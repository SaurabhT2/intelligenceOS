#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph, idClass, idModule, idField, idTable, idEvent } from '../lib/graph.mjs';
import { renderSubsystemDoc } from '../lib/relationship-doc.mjs';

export function generate() {
  const g = buildArchitectureGraph();
  const nodeIds = [
    idModule('packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts'),
    idClass('packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts', 'KnowledgeProcessor'),
    idModule('packages/intelligence-os/src/knowledge/VocabularyExtractor.ts'),
    idModule('packages/intelligence-os/src/knowledge/FrameworkExtractor.ts'),
    idModule('packages/intelligence-os/src/knowledge/PatternExtractor.ts'),
    idModule('packages/intelligence-os/src/knowledge/VisualFeatureExtractor.ts'),
    idModule('packages/intelligence-os/src/knowledge/KnowledgeValidator.ts'),
    idClass('packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts', 'KnowledgeIntelligenceDomain'),
    idTable('intelligence', 'knowledge_assets'),
    idEvent('intelligence.knowledge_asset.uploaded'),
    idField('profilefield', 'knowledgeSummary'),
    idField('contextfield', 'knowledge'),
  ];
  return renderSubsystemDoc(g, {
    title: 'Knowledge Relationships',
    headerNote: GENERATED_HEADER_NOTE,
    intro:
      'The Knowledge subsystem\'s graph neighborhood, hand-selected (module/class/table/event/field ' +
      'node IDs) but with every relationship for each shown mechanically from the Architecture ' +
      'Knowledge Graph — no relationship listed below was hand-transcribed. Cross-reference ' +
      '`.context/knowledge_pipeline.generated.md` (Phase 1) for the narrative walkthrough.',
    nodeIds,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'knowledge_relationships.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/knowledge_relationships.generated.md');
}
