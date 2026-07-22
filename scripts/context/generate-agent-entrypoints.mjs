#!/usr/bin/env node
/**
 * generate-agent-entrypoints.mjs
 * Produces .context/agent_entrypoints.generated.md — a navigation aid
 * ranking "where to start reading" by how central a file is in the
 * dependency graph (highest in-repo importer count = most load-bearing),
 * plus the fixed set of process/API entrypoints every agent should know
 * about regardless of graph centrality.
 */
import { join } from 'node:path';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE,
  buildImportGraph,
} from './lib/analyzer.mjs';

export function generate(model) {
  const { importedBy } = buildImportGraph(model);
  const ranked = model.files
    .filter((f) => f.relPath.startsWith('packages/intelligence-os/src/'))
    .map((f) => ({ file: f, count: (importedBy.get(f.relPath) ?? new Set()).size }))
    .sort((a, b) => b.count - a.count || a.file.relPath.localeCompare(b.file.relPath));

  const lines = [];
  lines.push('# Agent Entrypoints');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'Two complementary views: fixed process/API entrypoints (how a request or process enters the ' +
    'system) and graph-centrality ranking (which *source files*, if you had to read only a handful, ' +
    'carry the most load-bearing knowledge — measured by in-repo importer count).'
  );
  lines.push('');

  lines.push('## Fixed entrypoints');
  lines.push('');
  lines.push('| Entry | File |');
  lines.push('|---|---|');
  lines.push('| Library root export | `packages/intelligence-os/src/index.ts` |');
  lines.push('| The one class a consumer constructs | `packages/intelligence-os/src/IntelligenceOS.ts` |');
  lines.push('| Consumer-facing interface contract | `packages/intelligence-os/src/IIntelligenceProvider.ts` |');
  lines.push('| HTTP routing (shared by both process hosts) | `packages/intelligence-os/src/api/http/server.ts` |');
  lines.push('| Traditional process entrypoint | `apps/api/src/server.ts` |');
  lines.push('| Vercel Function entrypoint | `apps/api/api/cognition.ts` |');
  lines.push('| CognitionProvider implementation (workspace-scoped) | `packages/intelligence-os/src/api/CognitionProviderImpl.ts` |');
  lines.push('| Terminal context assembler | `packages/intelligence-os/src/context/ContextBuilder.ts` |');
  lines.push('');

  lines.push('## Top 15 files by in-repo importer count (read these first)');
  lines.push('');
  lines.push('| Rank | File | Importer count | Summary |');
  lines.push('|---|---|---|---|');
  ranked.slice(0, 15).forEach((r, idx) => {
    lines.push(`| ${idx + 1} | \`${r.file.relPath}\` | ${r.count} | ${r.file.headerSummary ?? '—'} |`);
  });
  lines.push('');

  lines.push('## Reading order for common tasks');
  lines.push('');
  lines.push('- **Architecture review:** `.context/monorepo_context.generated.md` → `.context/architecture_graph.generated.json` → `.context/domain_ownership.generated.md`.');
  lines.push('- **Debugging a specific bug report:** `.context/dependency_impact.generated.json` (find the file, read its `directDependents`) → `.context/behavior_contracts.generated.json` (is the method real or a stub?) → the source file itself.');
  lines.push('- **Implementing a new feature end-to-end:** `.context/cognition_pipeline.generated.md` for the request lifecycle → the specific pipeline doc (`learning_pipeline`, `knowledge_pipeline`, `identity_pipeline`) → `.context/api_contract.generated.md` for where to wire a new route/method.');
  lines.push('- **Forensic runtime investigation ("why did X happen for this user"):** `.context/event_bus.generated.md` (what fired) → `.context/domain_ownership.generated.md` (what got written) → `.context/profile_model.generated.md` (how the profile changed).');
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'agent_entrypoints.generated.md'), generate(model));
  console.log('✅ .context/agent_entrypoints.generated.md');
}
