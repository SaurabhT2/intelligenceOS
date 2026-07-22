#!/usr/bin/env node
import { join } from 'node:path';
import { buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from './lib/analyzer.mjs';
import { renderPipelineDoc } from './lib/pipeline-doc.mjs';

const STAGES = [
  { name: '1. Knowledge Upload', file: 'IntelligenceOS.ts', note: '`IntelligenceOS.ingestKnowledgeAsset()` / `ingestWorkspaceConfiguration()` are the two public entry points; both persist through `KnowledgeIntelligenceDomain` and emit `intelligence.knowledge_asset.uploaded`.' },
  { name: '2. Extraction', file: 'knowledge/KnowledgeProcessor.ts', note: 'Orchestrates the type-specific extractors (`VocabularyExtractor`, `FrameworkExtractor`, `PatternExtractor`, `VisualFeatureExtractor`, `KnowledgeAssetExtractor`) over the raw uploaded content, then emits `intelligence.signal.extracted` — which two independent FeedbackProcessor handlers pick up in parallel (branch below).' },
  { name: '2a. Vocabulary extraction', file: 'knowledge/VocabularyExtractor.ts' },
  { name: '2b. Framework extraction', file: 'knowledge/FrameworkExtractor.ts' },
  { name: '2c. Pattern extraction', file: 'knowledge/PatternExtractor.ts' },
  { name: '2d. Visual feature extraction', file: 'knowledge/VisualFeatureExtractor.ts' },
  { name: '3. Validation', file: 'knowledge/KnowledgeValidator.ts', note: 'Validates extracted knowledge before it is allowed to persist or contribute to context.' },
  { name: '4. Storage', file: 'domains/KnowledgeIntelligenceDomain.ts', note: 'Owns `intelligence.knowledge_assets` — the only writer/reader of that table (see the "Domain Ownership" section of `architecture.generated.md`).' },
  {
    name: '5a. Profile Contribution — descriptive path (unchanged)',
    file: 'pipeline/ProfileBuilder.ts',
    note: 'The pre-ADR-005 path: `FeedbackProcessor.processKnowledgeExtraction()` folds knowledge assets into the Profile\'s *descriptive* fields (`knowledgeSummary` etc.) directly — no Hypothesis, no evidence gate, no promotion threshold. This path is unmodified by ADR-005.',
  },
  {
    name: '5b. Evidence Bridge — evidentiary path (ADR-005, new)',
    file: 'knowledge/KnowledgeAssetEvidenceAdapter.ts',
    note: 'New: the SAME `intelligence.signal.extracted` event also triggers `FeedbackProcessor.processKnowledgeEvidence()`, which converts extracted frameworks/vocabulary into a source-agnostic `EvidenceSourceInput` (this adapter, the only Knowledge-specific file in the bridge) and runs it through `pipeline/EvidenceExtractor.ts` (evidence-quality gate) → the *unmodified* Stage 2–6 Learning Pipeline (Observation → Hypothesis → Learning → Profile). A single uploaded document never becomes identity on its own — it becomes a PROVISIONAL Hypothesis and only promotes to a Learning once the ordinary corroboration threshold is met, exactly like feedback-derived evidence. See the "Learning Pipeline" section for Stage 1b.',
  },
  { name: '6. Context Contribution', file: 'context/ContextBuilder.ts', note: '`ContextBuilder` reads back persisted Knowledge assets ahead of Learning-derived voice/identity (workspace configuration takes precedence — ADR-003 §2.4). Learnings promoted via the evidence bridge (5b) reach `ContextBuilder` the same way any other Learning does — through the Profile, via `identitySynthesis.ts` — not through this descriptive read-back.' },
  { name: '7. Prompt Contribution', file: 'blueprint/BlueprintBuilder.ts', note: 'The assembled `CognitionContext` (which carries knowledge-derived fields) ultimately shapes the `ArtifactBlueprint` prompt/plan produced here.' },
];

export function generate(model) {
  return renderPipelineDoc(model, {
    title: 'Knowledge Pipeline',
    headerNote: GENERATED_HEADER_NOTE,
    intro:
      'The complete knowledge lifecycle: Knowledge Upload → Extraction → Validation → Storage, then ' +
      'TWO independent, parallel contribution paths from the same `intelligence.signal.extracted` ' +
      'event — a descriptive path (5a, unchanged) and, since ADR-005, an evidentiary path (5b) that ' +
      'lets Knowledge actually promote to identity through the ordinary Learning Pipeline gate, not ' +
      'just describe itself in the Profile. Both converge on Context Contribution → Prompt Contribution.',
    stages: STAGES,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'knowledge_pipeline.generated.md'), generate(model));
  console.log('✅ .context/knowledge_pipeline.generated.md');
}
