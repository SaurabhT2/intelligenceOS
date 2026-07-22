#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph } from '../lib/graph.mjs';
import { renderRelationshipDoc } from '../lib/relationship-doc.mjs';

export function generate() {
  const g = buildArchitectureGraph();
  return renderRelationshipDoc(g, {
    title: 'Database Relationships',
    headerNote: GENERATED_HEADER_NOTE,
    intro: 'Every `Table` node\'s incoming OWNS/READS/WRITES/PERSISTS edges — the table-centric view of the same facts `domain_relationships.generated.md` shows domain-centric.',
    nodeTypes: ['Table'],
    inTypes: ['OWNS', 'READS', 'WRITES', 'PERSISTS'],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'database_relationships.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/database_relationships.generated.md');
}
