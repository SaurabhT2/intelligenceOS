#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph } from '../lib/graph.mjs';
import { renderRelationshipDoc } from '../lib/relationship-doc.mjs';

export function generate() {
  const g = buildArchitectureGraph();
  const base = renderRelationshipDoc(g, {
    title: 'API Relationships',
    headerNote: GENERATED_HEADER_NOTE,
    intro: 'Every `HttpApi` node\'s direct CALLS edge, plus its full CALLS-reachability set (everything downstream of the handler that a change to the route could ripple into).',
    nodeTypes: ['HttpApi'],
    outTypes: ['CALLS'],
  });
  const extra = [];
  extra.push('## Full downstream CALLS-reachability per route');
  extra.push('');
  const routes = [...g.nodes.values()].filter((n) => n.type === 'HttpApi').sort((a, b) => a.label.localeCompare(b.label));
  for (const r of routes) {
    const reachable = [...g.reachable(r.id, { types: ['CALLS'] })];
    extra.push(`### \`${r.label}\``);
    extra.push('');
    if (reachable.length === 0) {
      extra.push('_(no CALLS edges resolved for this route — handler not found by the hint table in `lib/graph.mjs`)_');
    } else {
      for (const id of reachable.sort()) {
        const n = g.node(id);
        extra.push(`- \`${n ? n.label : id}\`${n ? ` _(${n.type})_` : ''}`);
      }
    }
    extra.push('');
  }
  return base + '\n' + extra.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'api_relationships.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/api_relationships.generated.md');
}
