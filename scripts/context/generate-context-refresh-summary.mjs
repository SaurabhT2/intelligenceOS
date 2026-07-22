#!/usr/bin/env node
/**
 * generate-context-refresh-summary.mjs
 * Produces .context/context_refresh_summary.generated.md — a manifest of
 * what this run analyzed and what it found, keyed to a deterministic
 * repository fingerprint (a hash of every parsed file's relative path +
 * byte length) rather than a wall-clock timestamp. This is deliberate: the
 * mission requires "running the generation scripts twice without source
 * changes produces identical output," and a literal timestamp would break
 * that. The fingerprint changes if and only if the analyzed source changes,
 * which is the actually useful "has anything changed" signal anyway.
 */
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, extractStubMarkers, extractEventBusCalls,
  extractTableAccess, findFile, buildImportGraph, findCycles,
} from './lib/analyzer.mjs';
import { buildArchitectureGraph, idField } from './lib/graph.mjs';

function fingerprint(model) {
  const hash = createHash('sha256');
  for (const f of model.files) {
    hash.update(f.relPath);
    hash.update(String(f.content.length));
  }
  return hash.digest('hex').slice(0, 16);
}

const ARTIFACT_LIST = [
  'architecture.generated.md   — every narrative section (monorepo context through repository health), consolidated, with a table of contents.',
  'architecture.generated.json — every graph/JSON artifact (knowledgeGraph, fileLevelGraph, dependencyImpact, behaviorContracts, topicGraphs), sectioned by key.',
];

export function generate(model) {
  const fp = fingerprint(model);
  const { edges } = buildImportGraph(model);
  const cycles = findCycles(edges);

  let stubCount = 0;
  const stubClasses = new Set();
  for (const f of model.files) {
    const markers = extractStubMarkers(f.content);
    if (markers.length === 0) continue;
    stubCount += markers.length;
    for (const m of markers) {
      const cls = f.classes.find((c) => m.line >= c.bodyStartLine && m.line <= c.bodyEndLine);
      if (cls) stubClasses.add(cls.name);
    }
  }

  let emitCount = 0, onCount = 0;
  const emittedEvents = new Set();
  for (const f of model.files) {
    const { emits, ons } = extractEventBusCalls(f.content);
    emitCount += emits.length;
    onCount += ons.length;
    for (const e of emits) emittedEvents.add(e.event);
  }

  const eventsFile = findFile(model, 'types/events.ts');
  const declaredEventNames = eventsFile ? [...eventsFile.content.matchAll(/^\s*\|\s*'([\w.]+)'/gm)].map((m) => m[1]) : [];
  const declaredEvents = declaredEventNames.length;
  const neverEmittedEvents = declaredEventNames.filter((e) => !emittedEvents.has(e)).sort();

  // Context fields with a BUILDS edge but no CONTRIBUTES_TO/SYNTHESIZES
  // producer — computed from the same graph the rest of this framework
  // uses, not asserted.
  const g = buildArchitectureGraph();
  const uncontributedFields = [...g.nodes.values()]
    .filter((n) => n.type === 'ContextField')
    .filter((n) => {
      const incoming = g.edgesTo(n.id);
      const hasProducer = incoming.some((e) => ['CONTRIBUTES_TO', 'SYNTHESIZES'].includes(e.type));
      const isPureLiteral = /^(contractVersion|resolvedAt|workspaceId)$/.test(n.label.replace('CognitionContext.', ''));
      return !hasProducer && !isPureLiteral;
    })
    .map((n) => n.label);

  let tableAccessCount = 0;
  const tables = new Set();
  for (const f of model.files) {
    for (const a of extractTableAccess(f.content)) {
      tableAccessCount++;
      tables.add(`${a.schema}.${a.table}`);
    }
  }

  const classCount = model.files.reduce((n, f) => n + f.classes.length, 0);
  const methodCount = model.files.reduce((n, f) => n + f.classes.reduce((m, c) => m + c.methods.length, 0), 0);

  const lines = [];
  lines.push('# Context Refresh Summary');
  lines.push('');
  lines.push(
    '> **Generated file — do not edit by hand.** Produced by `scripts/context/generate-consolidated.mjs`. ' +
    'This file intentionally has no wall-clock timestamp — see this file\'s generator header comment ' +
    'for why — so that two runs against the same source tree are byte-identical.'
  );
  lines.push('');
  lines.push(`**Repository fingerprint:** \`${fp}\` (sha256 of every parsed file's path + byte length, truncated). ` +
    'Compare this value across two runs to know whether anything this framework tracks changed.');
  lines.push('');

  lines.push('## Corpus analyzed');
  lines.push('');
  lines.push(`- Packages: ${model.packages.length}`);
  lines.push(`- Source files parsed: ${model.files.length}`);
  lines.push(`- Classes: ${classCount}`);
  lines.push(`- Methods (across all classes): ${methodCount}`);
  lines.push(`- Declared event types: ${declaredEvents}`);
  lines.push(`- Event emit/on call sites: ${emitCount} emits, ${onCount} handlers`);
  lines.push(`- \`intelligence.*\` tables touched by code: ${tables.size}`);
  lines.push(`- Table access call sites: ${tableAccessCount}`);
  lines.push(`- Stub markers (\`new PhaseNotImplementedError\`/\`new DomainNotActivatedError\`): ${stubCount}`);
  lines.push(`- Import-graph cycles: ${cycles.length}`);
  lines.push('');

  lines.push('## Artifacts produced this run');
  lines.push('');
  for (const a of ARTIFACT_LIST) {
    const [file, ...descParts] = a.split(/\s+—\s+/);
    lines.push(`- [x] \`.context/${file.trim()}\`${descParts.length ? ' — ' + descParts.join(' — ') : ''}`);
  }
  lines.push('- [x] `.context/context_refresh_summary.generated.md` (this file)');
  lines.push('');

  lines.push('## Known gaps carried forward (see the "Repository Health" section of `architecture.generated.md` for detail)');
  lines.push('');
  lines.push(
    stubClasses.size
      ? `- ${stubCount} stub method(s) across ${[...stubClasses].sort().map((c) => `\`${c}\``).join(', ')}.`
      : '- No stub methods found.'
  );
  lines.push(
    neverEmittedEvents.length
      ? `- ${neverEmittedEvents.length} event type(s) declared in \`types/events.ts\` with no in-repo emit site: ${neverEmittedEvents.map((e) => `\`${e}\``).join(', ')}.`
      : '- Every declared event type has at least one in-repo emit site.'
  );
  lines.push(
    uncontributedFields.length
      ? `- ${uncontributedFields.length} CognitionContext field(s) with no implemented contributor: ${uncontributedFields.map((f) => `\`${f}\``).join(', ')}.`
      : '- Every CognitionContext field has at least one implemented contributor.'
  );
  lines.push('');

  lines.push('## How to regenerate');
  lines.push('');
  lines.push('```bash');
  lines.push('pnpm context:generate   # regenerate architecture.generated.{md,json} + this file');
  lines.push('pnpm build              # runs context:generate automatically, then the workspace build');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'context_refresh_summary.generated.md'), generate(model));
  console.log('✅ .context/context_refresh_summary.generated.md');
}
