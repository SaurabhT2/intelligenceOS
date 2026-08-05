-- 009_profiles_subject_centric_reconciliation.sql
--
-- Incident 2026-08-04: production `/v1/cognition/resolve` was failing with
-- Postgres 42703 ("column profiles.workspace_id does not exist"). Root
-- cause: migrations 004 (subject_centric_intelligence) and 005
-- (cognitive_consolidation) were applied ad hoc, table-by-table, via direct
-- SQL execution across separate sessions rather than as atomic files —
-- `hypotheses.workspace_id`/`subject_type` and `hypotheses.evidence_trail`
-- were confirmed live, but the corresponding `intelligence.profiles`
-- columns from those same two migration files were never confirmed applied.
-- See docs/IMPLEMENTATION_STATUS.md §4 ("Pending schema migrations") for
-- the session-by-session trail this migration reconciles.
--
-- Every statement below is written to be safe to run against a database in
-- an UNKNOWN partial state — i.e. it is safe whether zero, some, or all of
-- these columns/constraints/indexes already exist. This is intentional:
-- nobody has a verified, authoritative snapshot of exactly what's live on
-- `intelligence.profiles` today (that's the same operational gap that
-- caused the incident), so a non-idempotent migration would be unsafe to
-- run blindly.
--
-- BEFORE RUNNING: confirm current state with:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'intelligence' AND table_name = 'profiles'
--   ORDER BY ordinal_position;
--
-- AFTER RUNNING: re-run the same query and confirm workspace_id,
-- subject_type, knowledge_summary, reasoning_summary, and
-- positioning_summary are all present, then replay the affected
-- workspaces' /v1/cognition/resolve and /v1/cognition/observe calls.

BEGIN;

-- ── From migration 004 (subject_centric_intelligence) ──────────────────────

-- `user_id` must become nullable: a workspace-subject profile row has no
-- user_id at all (see profiles_owner_required below).
ALTER TABLE intelligence.profiles
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE intelligence.profiles
  ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE intelligence.profiles
  ADD COLUMN IF NOT EXISTS subject_type TEXT NOT NULL DEFAULT 'user';

-- Migration 004's original inlines this CHECK directly on the ADD COLUMN
-- statement (an unnamed, Postgres-auto-named constraint). Split out and
-- explicitly named here instead, because there is no safe idempotent form
-- of "ADD COLUMN IF NOT EXISTS ... CHECK (...)" — if workspace_id was
-- already added ad hoc without this check, inlining it would either error
-- (column exists) or silently do nothing (constraint never gets attached).
-- CHECK constraints have no ADD CONSTRAINT IF NOT EXISTS in Postgres, so
-- guard manually via pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_subject_type_valid'
      AND conrelid = 'intelligence.profiles'::regclass
  ) THEN
    ALTER TABLE intelligence.profiles
      ADD CONSTRAINT profiles_subject_type_valid
      CHECK (subject_type IN ('user', 'workspace'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_owner_required'
      AND conrelid = 'intelligence.profiles'::regclass
  ) THEN
    ALTER TABLE intelligence.profiles
      ADD CONSTRAINT profiles_owner_required
      CHECK (user_id IS NOT NULL OR workspace_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_subject_type_matches_owner'
      AND conrelid = 'intelligence.profiles'::regclass
  ) THEN
    ALTER TABLE intelligence.profiles
      ADD CONSTRAINT profiles_subject_type_matches_owner
      CHECK (
        (subject_type = 'user' AND user_id IS NOT NULL) OR
        (subject_type = 'workspace' AND workspace_id IS NOT NULL)
      );
  END IF;
END $$;

-- Mirrors the existing per-user "current profile" partial unique index —
-- required for UserIntelligenceDomain.upsertProfile()'s is_current-flip
-- logic to work for workspace subjects the same way it already does for
-- user subjects.
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_profiles_workspace_current
  ON intelligence.profiles (workspace_id)
  WHERE is_current = true AND workspace_id IS NOT NULL;

-- ── From migration 005 (cognitive_consolidation) ────────────────────────────

ALTER TABLE intelligence.profiles
  ADD COLUMN IF NOT EXISTS knowledge_summary JSONB;

ALTER TABLE intelligence.profiles
  ADD COLUMN IF NOT EXISTS reasoning_summary JSONB;

ALTER TABLE intelligence.profiles
  ADD COLUMN IF NOT EXISTS positioning_summary JSONB;

COMMIT;

-- ── Post-apply verification (run manually, not part of the transaction) ────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'intelligence' AND table_name = 'profiles'
--   AND column_name IN ('workspace_id', 'subject_type', 'knowledge_summary',
--                        'reasoning_summary', 'positioning_summary');
-- → should return exactly 5 rows.
