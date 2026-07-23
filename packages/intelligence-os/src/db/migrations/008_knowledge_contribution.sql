-- =============================================================================
-- Migration 008 — Knowledge Contribution Scoring
-- =============================================================================
-- Cognitive Platform Evolution Program — Knowledge Lifecycle Completion,
-- Objective 2 (reframed per the architecture review of 2026-07-23 — see
-- docs/handoffs/ for the full decision record).
--
-- Adds a descriptive "how much did this ingestion expand the workspace's
-- knowledge surface" readout to intelligence.knowledge_assets, computed by
-- knowledge/ContributionScorer.ts from data KnowledgeValidator/Vocabulary/
-- Framework/PatternExtractor already produce during Stage 5/1-3 of the
-- Knowledge Pipeline.
--
-- This is purely additive and, like migration 007, does not touch the
-- Evidence/Identity Bridge (ADR-005) in any way:
--   - Does not add, remove, or change any column on intelligence.hypotheses,
--     intelligence.learnings, or intelligence.intelligence_profiles.
--   - Does not change KnowledgeAssetEvidenceAdapter's candidate-building
--     logic, EvidenceExtractor's MIN_SUPPORTING_ITEMS/MIN_CANDIDATE_CONFIDENCE
--     gates, or HypothesisEngine's corroboration-threshold math in any way.
--   - Default '{}'::jsonb means every pre-existing row is valid without
--     backfill; historical assets simply have no contribution summary
--     (honest — they were ingested before this scoring existed, and
--     backfilling a score from data that predates ContributionScorer's
--     specific weighting would be a fabricated number, not a real one).
--
-- Shape (enforced at the application layer, in knowledge/types.ts's
-- ContributionSummary — matches this schema's existing convention for
-- extracted_vocabulary/extracted_frameworks/extracted_patterns of leaving
-- JSONB internal shape to the TypeScript layer):
--   {
--     score: number (0-100),
--     isDuplicate: boolean,
--     duplicateAssetId: string | null,
--     noveltyRatio: number (0-1),
--     corroborationScore: number (0-1),
--     termCount: number, frameworkCount: number, patternCount: number,
--     reasons: string[]
--   }
--
-- NOT YET EXECUTED against the live Supabase project (gzimytyjtidqtudqqhfx,
-- "IntelligenceOS") as of this commit. Apply via the same operational
-- process used for migrations 002-006 (direct execution against the live
-- project, verified against information_schema.columns per
-- docs/IMPLEMENTATION_STATUS.md's convention) before this branch's PR is
-- merged — see this PR's handoff doc under docs/handoffs/ for the specific
-- verification step still outstanding.

alter table intelligence.knowledge_assets
  add column if not exists contribution_summary jsonb not null default '{}'::jsonb;

comment on column intelligence.knowledge_assets.contribution_summary is
  'Descriptive readout of how much this ingestion expanded the workspace''s knowledge surface (ContributionSummary, knowledge/types.ts) — computed by knowledge/ContributionScorer.ts from vocabulary/framework/pattern counts and KnowledgeValidator''s novelty/duplicate signals. Never reads or writes the Evidence/Identity Bridge (ADR-005); a document can score highly here while contributing nothing to trusted identity yet, and that is correct, not a bug. Default ''{}''::jsonb for pre-existing rows ingested before this column existed.';
