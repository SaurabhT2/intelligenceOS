-- =============================================================================
-- Migration 005 — Cognitive Consolidation (ADR-004)
-- =============================================================================
-- Implements the schema half of ADR-004 ("Cognitive Consolidation:
-- Synthesizing Knowledge and Experience into Derived Understanding") and
-- the ADR-004 Engineering Blueprint's §1.3 File Impact Matrix / §12 Phase 3.
--
-- ── What this migration does ────────────────────────────────────────────────
-- Adds three nullable JSONB columns to intelligence.profiles:
--   knowledge_summary, reasoning_summary, positioning_summary
-- — the persisted form of IntelligenceProfile's three new
-- `SynthesizedCollection<T>`-shaped fields (see types/entities.ts).
-- `vocabulary_snapshot` is NOT touched by this migration — its column and
-- type are unchanged; only its *computation* changed (ProfileBuilder now
-- also reads Knowledge into it, ADR-004 §5), which requires no schema
-- change since it was already a nullable JSONB column.
--
-- ── Why a migration file, not folded into schema.sql's baseline ────────────
-- Follows this repository's established, demonstrated precedent for
-- profiles-table changes specifically: `002_workspace_learning_owner.sql`
-- and `004_subject_centric_intelligence.sql` both changed
-- `intelligence.profiles` and neither was folded back into `schema.sql`'s
-- baseline `CREATE TABLE` statement (see IMPLEMENTATION_STATUS.md §4 —
-- `schema.sql` still shows the pre-002/pre-004 shape for this table). This
-- migration follows that same, already-established pattern rather than
-- introducing a third, inconsistent convention (some changes folded into
-- schema.sql, some not, arbitrarily). `schema.sql`'s `profiles` table
-- remains a point-in-time baseline; the numbered migrations are the
-- authoritative record of everything applied after it, in order.
--
-- ── Backward compatibility ──────────────────────────────────────────────────
-- Purely additive: three new nullable columns, no existing column altered,
-- no existing row touched. Every current profile row has NULL in all three
-- new columns until its Subject's next natural rebuild — the same honest
-- "nothing synthesized yet" state ADR-003's `identity`/`voice` fields
-- already established for a Subject with nothing learned or declared yet
-- (ADR-004 §4.8, §12 Phase 3).
-- =============================================================================

ALTER TABLE intelligence.profiles
  ADD COLUMN knowledge_summary   JSONB,
  ADD COLUMN reasoning_summary   JSONB,
  ADD COLUMN positioning_summary JSONB;

COMMENT ON COLUMN intelligence.profiles.knowledge_summary IS
  'ADR-004 (Cognitive Consolidation) — SynthesizedCollection<{name, description}>. Recurring themes/named frameworks, from both Knowledge and Experience. See types/entities.ts.';
COMMENT ON COLUMN intelligence.profiles.reasoning_summary IS
  'ADR-004 (Cognitive Consolidation) — SynthesizedCollection<{statement}>. Declared/demonstrated reasoning conclusions, from both Knowledge and Experience. See types/entities.ts.';
COMMENT ON COLUMN intelligence.profiles.positioning_summary IS
  'ADR-004 (Cognitive Consolidation) — SynthesizedCollection<{statement}>. Market/category standing. Experience-only at launch — no Knowledge-side extractor exists yet (ADR-004 §0.1). See types/entities.ts.';

-- Verification (run manually after applying):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'intelligence' AND table_name = 'profiles'
--     AND column_name IN ('knowledge_summary', 'reasoning_summary', 'positioning_summary');
