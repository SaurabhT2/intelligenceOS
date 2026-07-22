#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph } from '../lib/graph.mjs';
import { renderRelationshipDoc } from '../lib/relationship-doc.mjs';

export function generate() {
  const g = buildArchitectureGraph();
  return renderRelationshipDoc(g, {
    title: 'Event Relationships',
    headerNote: GENERATED_HEADER_NOTE,
    intro: 'Every `Event` node\'s EMITS/CONSUMES edges. An event with an "Incoming" section but no "Outgoing" listed elsewhere pointing back to it is declared but structurally dead — cross-check against `.context/event_bus.generated.md` / `.context/repository_health.generated.md`.',
    nodeTypes: ['Event'],
    inTypes: ['EMITS', 'CONSUMES'],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'event_relationships.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/event_relationships.generated.md');
}
