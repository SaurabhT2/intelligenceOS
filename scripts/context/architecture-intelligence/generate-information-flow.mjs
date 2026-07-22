#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph } from '../lib/graph.mjs';

/** Backward BFS from a ContextField: follow incoming CONTRIBUTES_TO/SYNTHESIZES/BUILDS/READS/WRITES/EMITS edges until hitting a leaf (Table, Event, or a node with no further incoming edges of interest). */
function traceBack(g, startId, { maxDepth = 8 } = {}) {
  const layers = [[startId]];
  const visited = new Set([startId]);
  let frontier = [startId];
  let depth = 0;
  while (frontier.length && depth < maxDepth) {
    const next = [];
    for (const id of frontier) {
      const incoming = g.edgesTo(id).filter((e) => ['CONTRIBUTES_TO', 'SYNTHESIZES', 'BUILDS', 'READS', 'WRITES', 'EMITS'].includes(e.type));
      for (const e of incoming) {
        if (!visited.has(e.from)) { visited.add(e.from); next.push(e.from); }
      }
    }
    if (next.length === 0) break;
    layers.push(next);
    frontier = next;
    depth++;
  }
  return layers;
}

export function generate() {
  const g = buildArchitectureGraph();
  const lines = [];
  lines.push('# Information Flow');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'For every `CognitionContext` field: a backward trace (via incoming CONTRIBUTES_TO / SYNTHESIZES / ' +
    'BUILDS / READS / WRITES / EMITS edges) from the field back toward whatever originates it — a ' +
    'Profile field, a producing function, ultimately a Table or Event where the data first entered the ' +
    'system. Layer 0 is the field itself; each subsequent layer is one hop further back.'
  );
  lines.push('');

  const fields = [...g.nodes.values()].filter((n) => n.type === 'ContextField').sort((a, b) => a.label.localeCompare(b.label));
  for (const field of fields) {
    lines.push(`## \`${field.label}\``);
    lines.push('');
    if (field.metadata?.originExpression) {
      lines.push(`**Origin expression (from \`ContextBuilder.build()\`):** \`${field.metadata.originExpression.replace(/\|/g, '\\|').replace(/\n/g, ' ')}\``);
      lines.push('');
    }
    const layers = traceBack(g, field.id);
    if (layers.length === 1) {
      lines.push('_(no upstream contributor edge found — likely a pure literal, e.g. `contractVersion`/`resolvedAt`, or a not-yet-implemented field like `visualIdentity`)_');
    } else {
      for (let i = 0; i < layers.length; i++) {
        const labels = layers[i].map((id) => {
          const n = g.node(id);
          return `\`${n ? n.label : id}\`${n ? ` _(${n.type})_` : ''}`;
        });
        lines.push(`${i === 0 ? '**Field**' : `**Layer ${i} back**`}: ${labels.join(', ')}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'information_flow.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/information_flow.generated.md');
}
