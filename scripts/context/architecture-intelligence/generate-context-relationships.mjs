#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph } from '../lib/graph.mjs';
import { renderRelationshipDoc } from '../lib/relationship-doc.mjs';

export function generate() {
  const g = buildArchitectureGraph();
  const contextDoc = renderRelationshipDoc(g, {
    title: 'Context Relationships',
    headerNote: GENERATED_HEADER_NOTE,
    intro:
      'Every `CognitionContext` field (`ContextField` node) and every `IntelligenceProfile` field ' +
      '(`ProfileField` node), and what BUILDS/CONTRIBUTES_TO/SYNTHESIZES them. A field with an ' +
      '"Incoming" CONTRIBUTES_TO edge from a `ProfileField` traces one hop further back into ' +
      '`.context/profile_model.generated.md`; a field with no incoming edges at all besides `BUILDS` ' +
      'is either a pure literal (`contractVersion`, `resolvedAt`) or, like `visualIdentity`, has no ' +
      'implemented contributor — see `.context/repository_health.generated.md`.',
    nodeTypes: ['ContextField', 'ProfileField'],
    outTypes: ['CONTRIBUTES_TO', 'SYNTHESIZES'],
    inTypes: ['BUILDS', 'CONTRIBUTES_TO', 'SYNTHESIZES'],
  });
  return contextDoc;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'context_relationships.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/context_relationships.generated.md');
}
