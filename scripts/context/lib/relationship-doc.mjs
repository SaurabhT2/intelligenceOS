/**
 * scripts/context/lib/relationship-doc.mjs
 * Shared renderer: given the Architecture Knowledge Graph and a node-type
 * filter, renders a per-node relationship table (incoming + outgoing edges
 * of the given types). Used by every `*_relationships.generated.md` doc so
 * they stay structurally consistent and are all genuinely graph-driven
 * (not independently re-scanned per doc).
 */
export function renderNodeRelationships(g, node, { outTypes = null, inTypes = null } = {}) {
  const lines = [];
  const out = g.edgesFrom(node.id).filter((e) => !outTypes || outTypes.includes(e.type));
  const inc = g.edgesTo(node.id).filter((e) => !inTypes || inTypes.includes(e.type));
  lines.push(`### \`${node.label}\` _(${node.type})_`);
  lines.push('');
  if (node.file) lines.push(`- **Location:** \`${node.file}\`${node.line ? ':' + node.line : ''}`);
  if (node.metadata?.summary) lines.push(`- **Summary:** ${node.metadata.summary}`);
  if (out.length) {
    lines.push('- **Outgoing:**');
    for (const e of out.sort((a, b) => (a.type + a.to).localeCompare(b.type + b.to))) {
      const target = g.node(e.to);
      lines.push(`  - \`${e.type}\` → \`${target ? target.label : e.to}\`${target ? ` _(${target.type})_` : ''}`);
    }
  }
  if (inc.length) {
    lines.push('- **Incoming:**');
    for (const e of inc.sort((a, b) => (a.type + a.from).localeCompare(b.type + b.from))) {
      const source = g.node(e.from);
      lines.push(`  - \`${e.type}\` ← \`${source ? source.label : e.from}\`${source ? ` _(${source.type})_` : ''}`);
    }
  }
  if (!out.length && !inc.length) lines.push('_(no matching edges found)_');
  lines.push('');
  return lines.join('\n');
}

export function renderSubsystemDoc(g, { title, headerNote, intro, nodeIds }) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(headerNote);
  lines.push('');
  lines.push(intro);
  lines.push('');
  for (const id of nodeIds) {
    const node = g.node(id);
    if (!node) {
      lines.push(`### \`${id}\``);
      lines.push('');
      lines.push('_(node not found in graph — likely not wired in source; see repository_health.generated.md)_');
      lines.push('');
      continue;
    }
    lines.push(renderNodeRelationships(g, node, {}));
  }
  return lines.join('\n');
}

export function renderRelationshipDoc(g, { title, headerNote, intro, nodeTypes, outTypes = null, inTypes = null }) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(headerNote);
  lines.push('');
  lines.push(intro);
  lines.push('');
  const nodes = [...g.nodes.values()]
    .filter((n) => nodeTypes.includes(n.type))
    .sort((a, b) => a.label.localeCompare(b.label));
  lines.push(`Graph nodes covered: **${nodes.length}** (types: ${nodeTypes.join(', ')}).`);
  lines.push('');
  for (const node of nodes) {
    lines.push(renderNodeRelationships(g, node, { outTypes, inTypes }));
  }
  return lines.join('\n');
}
