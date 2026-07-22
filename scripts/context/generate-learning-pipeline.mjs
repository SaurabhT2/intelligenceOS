#!/usr/bin/env node
import { join } from 'node:path';
import { buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from './lib/analyzer.mjs';
import { renderPipelineDoc } from './lib/pipeline-doc.mjs';

const STAGES = [
  { name: '1a. Signal Extraction (Experience-sourced)', file: 'pipeline/SignalExtractor.ts', note: 'Stage 1 per this module\'s own docblock. Extracts `Signal`s (governance/richness-scored, normalized to a 0–1 confidence range) out of feedback events and workspace observations, writing to `intelligence.signals`.' },
  { name: '1b. Evidence Extraction (Knowledge-sourced, ADR-005)', file: 'pipeline/EvidenceExtractor.ts', note: 'Also Stage 1, added by ADR-005 (Evidence/Identity Bridge) as a source-agnostic parallel producer alongside SignalExtractor — converts a generic `EvidenceSourceInput` envelope (today, built only by `knowledge/KnowledgeAssetEvidenceAdapter.ts` from an uploaded Knowledge asset\'s extracted frameworks/vocabulary) into the exact same `Signal[]` shape, behind a source-agnostic evidence-quality gate. Everything from Stage 2 onward is unmodified and unaware of which Stage-1 producer a Signal came from.' },
  { name: '2. Observation', file: 'pipeline/ObservationBuilder.ts', note: 'Turns one or more Signals into a structured `Observation` — the first durable, typed record in the learning lifecycle, regardless of which Stage-1 producer supplied the Signal.' },
  { name: '3. Hypothesis', file: 'pipeline/HypothesisEngine.ts', note: 'Aggregates signals into a candidate `Hypothesis` — a not-yet-trusted pattern about the user, stored in `intelligence.hypotheses`. Since ADR-005, `intelligence.hypotheses.evidence_trail` (migration 007) carries an append-only audit trail of every Observation that corroborated/contradicted it, not just a count.' },
  { name: '4–5. Learning', file: 'pipeline/LearningValidator.ts', note: 'Promotes a Hypothesis to a `Learning` once it clears validation thresholds, and is the module that emits `intelligence.learning.validated`. Copies `evidence_trail` verbatim into the Learning\'s `source_summary.evidenceTrail` on promotion (ADR-005), so identity traits stay traceable to their originating documents/frameworks/vocabulary, not just a confidence number.' },
  { name: 'Orchestration', file: 'pipeline/FeedbackProcessor.ts', note: 'Not itself a numbered stage — the orchestrator. Registers as the consumer of `intelligence.artifact.feedback` / `intelligence.user.correction` / `intelligence.signal.extracted`, and drives Signal → Observation → Hypothesis → Learning end-to-end for every entry point, including the supervisory review path (`intelligence.learning.reviewed`) and, since ADR-005, the knowledge-evidentiary path (`processKnowledgeEvidence`, registered alongside the pre-existing descriptive `processKnowledgeExtraction` on the same `intelligence.signal.extracted` event).' },
  { name: '6. Profile', file: 'pipeline/ProfileBuilder.ts', note: 'Rebuilds the `IntelligenceProfile` for a subject from confirmed Learnings, emitting `intelligence.profile.updated`. See `.context/profile_model.generated.md` (Phase 1 naming; now a section of `architecture.generated.md`) for the full field-origin breakdown.' },
  { name: 'Context (consumer, not a Learning Pipeline stage)', file: 'context/ContextBuilder.ts', note: 'Terminal consumer of the Profile — assembles the `CognitionContext` an artifact-generation request actually receives.' },
];

export function generate(model) {
  return renderPipelineDoc(model, {
    title: 'Learning Pipeline',
    headerNote: GENERATED_HEADER_NOTE,
    intro:
      'The complete learning lifecycle, in the order the source itself labels it (each stage file\'s ' +
      'own docblock states its stage number): Signal/Evidence Extraction (Stage 1, two parallel ' +
      'producers as of ADR-005) → Observation (Stage 2) → Hypothesis (Stage 3) → Learning (Stage 4–5) ' +
      '→ Profile (Stage 6) → Context (terminal consumer, not itself a numbered stage). Ownership, ' +
      'entry points, and dependencies below are extracted directly from each stage\'s source file, not asserted.',
    stages: STAGES,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'learning_pipeline.generated.md'), generate(model));
  console.log('✅ .context/learning_pipeline.generated.md');
}
