-- =============================================================================
-- Migration 007 — Evidence Provenance (Knowledge → Identity Evidence Bridge)
-- =============================================================================
-- Adds an append-only provenance trail to intelligence.hypotheses so every
-- Hypothesis (and, once promoted, the Learning it produces) carries a full
-- audit trail of the evidence that built it — not just a corroboration
-- COUNT, which answers "how many" but not "which document/observation, from
-- what source, supporting what specific frameworks/vocabulary, at what
-- confidence".
--
-- This is purely additive:
--   - Does not change required_corroborations / current_corroborations /
--     high_quality_contradictions or any promotion-threshold math
--     (HypothesisEngine.computeCorroborationUpdates /
--     computeContradictionUpdates / LearningValidator.evaluate are
--     unchanged in their gating logic — see those files' updated comments).
--   - Does not change any existing CHECK constraint or index.
--   - Default '[]'::jsonb means every pre-existing row is valid without
--     backfill; historical hypotheses simply have an empty trail (honest —
--     we don't have retroactive provenance for them).
--
-- Shape of each element (enforced at the application layer in
-- pipeline/types.ts's EvidenceRecord, not by a DB CHECK — matches this
-- schema's existing convention of leaving JSONB internal shape to the
-- TypeScript layer, e.g. `proposition`, `source_summary`):
--   {
--     sourceKind: 'knowledge_asset' | 'connector' | 'web_import' |
--                 'repository' | 'conversation' | 'experience',
--     sourceId: string,
--     sourceLabel?: string,
--     taxonomyCategory: string,
--     supportingItems: string[],
--     confidence: number,
--     disposition: 'corroborating' | 'contradicting' | 'new',
--     observedAt: string (ISO 8601)
--   }
--
-- NOT YET EXECUTED — see this repository's operational migration process
-- for 002-006; apply the same way.

alter table intelligence.hypotheses
  add column if not exists evidence_trail jsonb not null default '[]'::jsonb;

comment on column intelligence.hypotheses.evidence_trail is
  'Append-only audit trail of every Observation that corroborated/contradicted this Hypothesis — one EvidenceRecord (see pipeline/types.ts) per Observation, in chronological order. Copied verbatim into the resulting Learning''s source_summary.evidenceTrail on promotion (LearningValidator.createLearning), so identity traits remain traceable to their originating documents/frameworks/vocabulary after promotion, not just as a corroboration count.';
