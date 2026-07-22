#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE, buildRepoModel } from '../lib/analyzer.mjs';
import { buildArchitectureGraph, idModule } from '../lib/graph.mjs';

const ENTRYPOINTS = [
  'apps/api/src/server.ts',
  'apps/api/api/cognition.ts',
  'apps/demo/src/index.ts',
  'apps/playground/src/index.ts',
];

export function generate() {
  const g = buildArchitectureGraph();
  const model = buildRepoModel();
  const lines = [];
  lines.push('# Runtime Relationships');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'Every process entrypoint\'s full DEPENDS_ON reachability set — everything that process transitively ' +
    'pulls in at boot. Complements `.context/runtime_model.generated.md` (Phase 1, which lists ' +
    'entrypoints and env vars) with the graph-derived reachability those entrypoints actually have.'
  );
  lines.push('');

  for (const entry of ENTRYPOINTS) {
    const id = idModule(entry);
    const pkg = model.packages.find((p) => entry.startsWith(p.relDir + '/'));
    lines.push(`## \`${entry}\``);
    lines.push('');
    if (!g.nodes.has(id)) {
      lines.push('_(module not found in graph)_');
      lines.push('');
      continue;
    }
    if (pkg?.dependencies.length) {
      lines.push(`- **Cross-package dependencies (declared in \`${pkg.name}/package.json\`):** ${pkg.dependencies.map((d) => `\`${d}\``).join(', ')}`);
    }
    const reachable = [...g.reachable(id, { types: ['DEPENDS_ON'] })].sort();
    const packages = new Set();
    for (const rid of reachable) {
      const n = g.node(rid);
      if (n?.metadata?.package) packages.add(n.metadata.package);
    }
    lines.push(`- **Intra-repo relative-import reachability (DEPENDS_ON):** ${reachable.length} module(s)${reachable.length === 0 ? ' — expected: this file only imports the cross-package surface listed above, never a relative path into another package\u2019s internals, per ADR-002 isolation.' : ` across ${[...packages].sort().map((p) => `\`${p}\``).join(', ')}`}`);
    lines.push('');
    if (reachable.length > 0) {
      lines.push('<details><summary>Full module list</summary>');
      lines.push('');
      for (const rid of reachable) lines.push(`- \`${g.node(rid)?.label ?? rid}\``);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  lines.push('## HttpApi routes hosted (both process entrypoints share these)');
  lines.push('');
  const routes = [...g.nodes.values()].filter((n) => n.type === 'HttpApi').sort((a, b) => a.label.localeCompare(b.label));
  for (const r of routes) lines.push(`- \`${r.label}\` (\`${r.file}:${r.line}\`)`);
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'runtime_relationships.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/runtime_relationships.generated.md');
}
