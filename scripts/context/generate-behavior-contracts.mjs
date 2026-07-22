#!/usr/bin/env node
/**
 * generate-behavior-contracts.mjs
 * Produces .context/behavior_contracts.generated.json — for every public
 * method on every class: real vs stub (does it throw a
 * PhaseNotImplementedError/DomainNotActivatedError unconditionally?),
 * whether it has fallback/degraded-mode logic (catch blocks, `createDegraded*`
 * factories), and its declared return type — a machine-readable behavior
 * ledger an agent can query before assuming a method actually does what its
 * name suggests.
 */
import { join } from 'node:path';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, extractFallbackSignals,
} from './lib/analyzer.mjs';

function methodBody(fileContent, classBodyStart, classBodyEnd, methodName, occurrenceIndex) {
  // Re-locate the method's own brace span within the class body so we can
  // check whether it *unconditionally* throws a stub error (i.e. the throw
  // is the only statement) vs conditionally (degraded/fallback path).
  const classBody = fileContent.slice(classBodyStart, classBodyEnd);
  const re = new RegExp(`\\b${methodName}\\s*\\([^{};]*\\)\\s*(?::[^{;=]+)?\\s*\\{`, 'g');
  let m;
  let idx = 0;
  while ((m = re.exec(classBody)) !== null) {
    if (idx === occurrenceIndex) {
      const openIdx = m.index + m[0].length - 1;
      let depth = 0, closeIdx = openIdx;
      for (let i = openIdx; i < classBody.length; i++) {
        if (classBody[i] === '{') depth++;
        else if (classBody[i] === '}') { depth--; if (depth === 0) { closeIdx = i; break; } }
      }
      return classBody.slice(openIdx + 1, closeIdx);
    }
    idx++;
  }
  return '';
}

export function generate(model) {
  const contracts = [];
  for (const f of model.files) {
    for (const cls of f.classes) {
      const nameOccurrences = new Map();
      for (const method of cls.methods) {
        if (method.name === 'constructor') continue;
        const occ = nameOccurrences.get(method.name) ?? 0;
        nameOccurrences.set(method.name, occ + 1);
        const body = methodBody(
          f.content,
          f.content.indexOf('{', f.content.indexOf(`class ${cls.name}`)),
          f.content.length,
          method.name,
          occ
        );
        const throwsStub = /throw\s+new\s+(PhaseNotImplementedError|DomainNotActivatedError|NotImplementedError)\s*\(/.test(body);
        const bodyStatements = body.trim();
        // "unconditional stub" heuristic: the throw is not nested inside an
        // `if` guard — i.e. it's the first non-comment statement.
        const firstStatement = bodyStatements.replace(/\/\/.*$/gm, '').trim().split(/\n/).find((l) => l.trim().length > 0) ?? '';
        const unconditionalStub = throwsStub && /^throw\s+new\s+(PhaseNotImplementedError|DomainNotActivatedError|NotImplementedError)/.test(firstStatement.trim());
        const fallback = extractFallbackSignals(body);
        contracts.push({
          file: f.relPath,
          class: cls.name,
          method: method.name,
          async: method.async,
          visibility: method.visibility,
          params: method.params,
          returnType: method.returnType,
          summary: method.summary,
          behavior: unconditionalStub ? 'stub' : (throwsStub ? 'conditional-stub' : 'implemented'),
          hasFallbackLogic: fallback.length > 0,
          fallbackSignalCount: fallback.length,
        });
      }
    }
  }

  return {
    generator: 'scripts/context/generate-behavior-contracts.mjs',
    description:
      'Per-method behavior ledger: "stub" = unconditionally throws a not-implemented/not-activated ' +
      'error; "conditional-stub" = throws that error only on some path (e.g. a not-yet-activated ' +
      'domain gate); "implemented" = no stub marker found. hasFallbackLogic flags catch blocks or ' +
      'createDegraded*() factories, i.e. methods designed to degrade gracefully rather than throw.',
    methodCount: contracts.length,
    stubCount: contracts.filter((c) => c.behavior === 'stub').length,
    conditionalStubCount: contracts.filter((c) => c.behavior === 'conditional-stub').length,
    contracts: contracts.sort((a, b) => (a.file + a.class + a.method).localeCompare(b.file + b.class + b.method)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'behavior_contracts.generated.json'), JSON.stringify(generate(model), null, 2));
  console.log('✅ .context/behavior_contracts.generated.json');
}
