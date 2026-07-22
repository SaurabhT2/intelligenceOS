#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph } from '../lib/graph.mjs';
import { renderRelationshipDoc } from '../lib/relationship-doc.mjs';

export function generate() {
  const g = buildArchitectureGraph();
  return renderRelationshipDoc(g, {
    title: 'Domain Relationships',
    headerNote: GENERATED_HEADER_NOTE,
    intro: 'Every `Domain` node\'s persistence relationships, projected from the Architecture Knowledge Graph. See `.context/domain_ownership.generated.md` (Phase 1) for the narrative version of the same facts.',
    nodeTypes: ['Domain'],
    outTypes: ['OWNS', 'READS', 'WRITES', 'PERSISTS'],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'domain_relationships.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/domain_relationships.generated.md');
}
