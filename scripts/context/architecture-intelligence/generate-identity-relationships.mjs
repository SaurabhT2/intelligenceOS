#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph, idClass, idModule, idField, idMethod } from '../lib/graph.mjs';
import { renderSubsystemDoc } from '../lib/relationship-doc.mjs';

export function generate() {
  const g = buildArchitectureGraph();
  const nodeIds = [
    idModule('packages/intelligence-os/src/context/identitySynthesis.ts'),
    idModule('packages/intelligence-os/src/context/voiceMapping.ts'),
    idClass('packages/intelligence-os/src/context/ContextBuilder.ts', 'ContextBuilder'),
    idMethod('packages/intelligence-os/src/context/ContextBuilder.ts', 'ContextBuilder', 'build'),
    idField('contextfield', 'identity'),
    idField('contextfield', 'voice'),
    idField('contextfield', 'reasoning'),
    idField('contextfield', 'positioning'),
    idField('contextfield', 'confidence'),
    idField('contextfield', 'knowledge'),
    idField('contextfield', 'visualIdentity'),
  ];
  return renderSubsystemDoc(g, {
    title: 'Identity Relationships',
    headerNote: GENERATED_HEADER_NOTE,
    intro:
      'The Identity subsystem\'s graph neighborhood: Identity, Voice, Reasoning, Positioning, ' +
      'Confidence, Knowledge Summary, and Visual Identity as `ContextField` nodes, plus their ' +
      'producing functions/classes. `visualIdentity` will show zero incoming CONTRIBUTES_TO/SYNTHESIZES ' +
      'edges below — that is the graph confirming, not merely asserting, the gap already called out in ' +
      '`.context/identity_pipeline.generated.md` and `.context/repository_health.generated.md`.',
    nodeIds,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'identity_relationships.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/identity_relationships.generated.md');
}
