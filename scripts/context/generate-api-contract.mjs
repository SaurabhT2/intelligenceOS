#!/usr/bin/env node
/**
 * generate-api-contract.mjs
 * Produces .context/api_contract.generated.md — every public API surface:
 * the HTTP routes (server.ts), the `IIntelligenceProvider` consumer-facing
 * interface, and the `CognitionProvider` contract (cross-platform). For
 * each HTTP route, which handler and, transitively, which domains/pipelines
 * it reaches (via the dependency graph already built for the architecture
 * graph).
 */
import { join } from 'node:path';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE,
  findFile, extractHttpRoutes, buildImportGraph,
} from './lib/analyzer.mjs';

const ROUTE_HANDLER_HINTS = {
  '/v1/cognition/resolve': { impl: 'CognitionProviderImpl.resolveCognitionContext', file: 'packages/intelligence-os/src/api/CognitionProviderImpl.ts' },
  '/v1/cognition/observe': { impl: 'CognitionProviderImpl.observe', file: 'packages/intelligence-os/src/api/CognitionProviderImpl.ts' },
  '/v1/cognition/review': { impl: 'CognitionProviderImpl.review', file: 'packages/intelligence-os/src/api/CognitionProviderImpl.ts' },
  '/v1/cognition/summary': { impl: 'CognitionProviderImpl.summarizeCognition', file: 'packages/intelligence-os/src/api/CognitionProviderImpl.ts' },
  '/v1/cognition/health': { impl: 'CognitionProviderImpl.checkHealth / HealthChecker', file: 'packages/intelligence-os/src/api/HealthChecker.ts' },
  '/v1/knowledge/ingest': { impl: 'IntelligenceOS.ingestKnowledgeAsset', file: 'packages/intelligence-os/src/IntelligenceOS.ts' },
  '/v1/workspace-configuration': { impl: 'IntelligenceOS.ingestWorkspaceConfiguration', file: 'packages/intelligence-os/src/IntelligenceOS.ts' },
  '/v1/intelligence/feedback': { impl: 'IntelligenceOS.recordFeedbackEvent', file: 'packages/intelligence-os/src/IntelligenceOS.ts' },
  '/v1/intelligence/correction': { impl: 'IntelligenceOS.recordCorrection', file: 'packages/intelligence-os/src/IntelligenceOS.ts' },
};

export function generate(model) {
  const serverFile = findFile(model, 'api/http/server.ts');
  const routes = serverFile ? extractHttpRoutes(serverFile.content) : [];
  const { importedBy } = buildImportGraph(model);

  const providerFile = findFile(model, 'IIntelligenceProvider.ts');

  const lines = [];
  lines.push('# API Contract');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');

  lines.push('## HTTP routes (`packages/intelligence-os/src/api/http/server.ts`)');
  lines.push('');
  lines.push('All routes are hosted from the one `createCognitionHttpServer()` factory — both the ' +
    '`apps/api/src/server.ts` long-running process and the `apps/api/api/cognition.ts` Vercel Function ' +
    'entrypoint dispatch into this exact same handler.');
  lines.push('');
  lines.push('| Method | Path | Handler | Downstream |');
  lines.push('|---|---|---|---|');
  for (const r of routes) {
    const hint = ROUTE_HANDLER_HINTS[r.path];
    lines.push(`| ${r.method} | \`${r.path}\` | ${hint ? '\`' + hint.impl + '\`' : '(see server.ts:' + r.line + ')'} | ${hint ? '\`' + hint.file + '\`' : '—'} |`);
  }
  lines.push('');

  lines.push('## `IIntelligenceProvider` — the platform\'s consumer-facing contract');
  lines.push('');
  if (providerFile) {
    lines.push(providerFile.headerSummary ?? '');
    lines.push('');
    for (const iface of providerFile.interfaces) {
      lines.push(`### \`interface ${iface.name}\``);
      lines.push('');
      if (iface.summary) lines.push(iface.summary);
      lines.push('');
    }
    // Method signatures inside the interface body (regex over raw content,
    // since interfaces aren't parsed with the same brace-matcher as classes).
    const body = providerFile.content;
    const ifaceStart = body.indexOf('interface IIntelligenceProvider');
    const openIdx = body.indexOf('{', ifaceStart);
    let depth = 0, closeIdx = openIdx;
    for (let i = openIdx; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') { depth--; if (depth === 0) { closeIdx = i; break; } }
    }
    const ifaceBody = body.slice(openIdx + 1, closeIdx);
    const methodRe = /^\s*(\w+)\(([^)]*)\):\s*([^;]+);/gm;
    let m;
    lines.push('| Method | Params | Returns |');
    lines.push('|---|---|---|');
    while ((m = methodRe.exec(ifaceBody)) !== null) {
      lines.push(`| \`${m[1]}\` | \`${m[2].trim().replace(/\s+/g, ' ')}\` | \`${m[3].trim()}\` |`);
    }
    lines.push('');
  } else {
    lines.push('_(IIntelligenceProvider.ts not found)_');
  }

  lines.push('## `@platform/cognition-contract` — cross-platform contract types');
  lines.push('');
  const contractFiles = model.files.filter((f) => f.relPath.startsWith('packages/cognition-contract/'));
  for (const f of contractFiles) {
    if (f.interfaces.length === 0 && f.typeAliases.length === 0) continue;
    lines.push(`### \`${f.relPath}\``);
    lines.push('');
    for (const i of f.interfaces) lines.push(`- **interface \`${i.name}\`**${i.summary ? ' — ' + i.summary : ''}`);
    for (const t of f.typeAliases) lines.push(`- **type \`${t.name}\`**${t.summary ? ' — ' + t.summary : ''}`);
    lines.push('');
  }

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'api_contract.generated.md'), generate(model));
  console.log('✅ .context/api_contract.generated.md');
}
