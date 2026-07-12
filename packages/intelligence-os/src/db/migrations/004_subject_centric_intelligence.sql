-- =============================================================================
-- Migration 004 — Subject-centric intelligence (ADR-003)
-- =============================================================================
-- Implements the schema half of ADR-003 ("Subject-Centric Intelligence:
-- Generalizing IntelligenceOS Beyond the User") and the first bullet of
-- ROADMAP.md's "Mid-term (subject-centric intelligence)" section:
--
--   "Add a subject_type discriminator alongside the existing nullable
--    user_id/workspace_id columns on learnings (and, where meaningful,
--    hypotheses) — a new migration following 002's pattern, not a
--    redesign of it."
--
-- Follows migration 002's pattern exactly, extended to the three tables
-- 002 explicitly left alone (its own comment: "intelligence.feedback_events,
-- intelligence.signals, and intelligence.hypotheses remain user_id-only
-- ... left for a future increment"). This is that increment.
--
-- ── What this migration does ────────────────────────────────────────────────
--   1. intelligence.learnings: add a `subject_type` discriminator column
--      (the table's user_id/workspace_id columns are already nullable per
--      migration 002 — this only adds the explicit discriminator and a
--      CHECK tying it to whichever column is actually populated).
--   2. intelligence.hypotheses: relax user_id to nullable, add workspace_id
--      (new column — hypotheses previously had no workspace concept at
--      all), add subject_type + the same owner-required / discriminator
--      CHECK pattern as learnings.
--   3. intelligence.signals: same three changes as hypotheses. (Signals are
--      never actually persisted in Phase 1 per SignalExtractor.ts's own
--      docblock — they're in-memory pipeline artefacts — but the column
--      set is kept in lockstep with the TypeScript `Signal` shape and with
--      hypotheses/learnings, consistent with this schema file's existing
--      convention of modeling all pipeline-internal entities' persisted
--      shape even where nothing currently writes rows.)
--   4. intelligence.profiles: same three changes — a Workspace Subject's
--      synthesized identity reuses this table exactly the way a User's
--      does (ADR-003 §2.3, §5 "Alternatives Considered" — a second
--      WorkspaceProfile table was explicitly rejected).
--
-- ── Why a discriminator column, not just "whichever id is set" ─────────────
-- `user_id IS NOT NULL` vs `workspace_id IS NOT NULL` already distinguishes
-- the two subject types positionally, so a discriminator is redundant for
-- *reading* a row. It earns its place for two reasons ADR-003 §2.1 and
-- this repository's own domain-store convention both care about:
--   - Every subject-scoped write site (UserIntelligenceDomain) can branch
--     on one explicit column instead of re-deriving "which one is set" —
--     the same reasoning `context_scope` already gets its own column on
--     `learnings` rather than being inferred from which context_* column
--     is populated.
--   - It gives every future subject type (ADR-003 §5 explicitly does not
--     add one now, but leaves the union open, mirroring ArchetypeType's
--     open-string-union precedent) a single column to extend rather than a
--     new nullable id column plus rewritten inference logic at every call
--     site.
--
-- ── Backward compatibility ──────────────────────────────────────────────────
-- Additive and non-breaking, following 002's own reasoning:
--   - Every existing row in all four tables already has a real user_id, so
--     `subject_type` backfills to 'user' via its DEFAULT for 100% of
--     current data, and every new CHECK is satisfied immediately.
--   - Every existing query (`.eq('user_id', ...)`) is unaffected — no
--     column is renamed or removed.
--   - User-scoped write paths (UserIntelligenceDomain, HypothesisEngine,
--     LearningValidator, ProfileBuilder, SignalExtractor) continue to work
--     exactly as before; they now also set `subject_type = 'user'`
--     explicitly rather than relying on the column default, per
--     `types/subject.ts`'s `subjectColumns()` helper.
--
-- ── Explicitly NOT changed by this migration ────────────────────────────────
--   - intelligence.feedback_events remains user_id-only (NOT NULL). Nothing
--     in ADR-003 gives a Workspace subject its own feedback_events concept
--     — `ObservationInput` (the workspace-scoped equivalent) is translated
--     into Signals directly by `SignalExtractor.extractFromObservation()`,
--     never into a `feedback_events` row. Extending that table is out of
--     scope for this migration.
--   - No data backfill beyond the column DEFAULTs above is needed or
--     performed — there is no existing workspace-owned row in any of these
--     four tables to reclassify (WorkspaceIntelligenceDomain.
--     upsertWorkspaceLearning() was the only prior workspace-scoped write
--     path, and it already used the plain `learnings.workspace_id` column
--     migration 002 added, no `subject_type` column existed yet for it to
--     have set — this migration's DEFAULT 'user' on preexisting rows is
--     therefore technically imprecise for any workspace-owned learning
--     already written via that path, but the same information is still
--     recoverable from `workspace_id IS NOT NULL` alone; a one-off
--     `UPDATE ... SET subject_type = 'workspace' WHERE workspace_id IS NOT
--     NULL AND user_id IS NULL` is safe to run by hand post-migration if a
--     live database already has such rows, and is intentionally not baked
--     into this file since no live database exists in this environment to
--     verify it against — see IMPLEMENTATION_STATUS.md).
-- =============================================================================

-- ── 1. intelligence.learnings ────────────────────────────────────────────────

ALTER TABLE intelligence.learnings
  ADD COLUMN subject_type TEXT NOT NULL DEFAULT 'user'
    CHECK (subject_type IN ('user', 'workspace'));

ALTER TABLE intelligence.learnings
  ADD CONSTRAINT learnings_subject_type_matches_owner
  CHECK (
    (subject_type = 'user' AND user_id IS NOT NULL)
    OR (subject_type = 'workspace' AND workspace_id IS NOT NULL)
  );

CREATE INDEX intelligence_learnings_workspace_domain
  ON intelligence.learnings(workspace_id, domain, state)
  WHERE workspace_id IS NOT NULL;

-- ── 2. intelligence.hypotheses ───────────────────────────────────────────────

ALTER TABLE intelligence.hypotheses
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE intelligence.hypotheses
  ADD COLUMN workspace_id UUID;  -- intentionally no REFERENCES, mirrors learnings.workspace_id

ALTER TABLE intelligence.hypotheses
  ADD COLUMN subject_type TEXT NOT NULL DEFAULT 'user'
    CHECK (subject_type IN ('user', 'workspace'));

ALTER TABLE intelligence.hypotheses
  ADD CONSTRAINT hypotheses_owner_required
  CHECK (user_id IS NOT NULL OR workspace_id IS NOT NULL);

ALTER TABLE intelligence.hypotheses
  ADD CONSTRAINT hypotheses_subject_type_matches_owner
  CHECK (
    (subject_type = 'user' AND user_id IS NOT NULL)
    OR (subject_type = 'workspace' AND workspace_id IS NOT NULL)
  );

CREATE INDEX intelligence_hypotheses_workspace_active
  ON intelligence.hypotheses(workspace_id, state, taxonomy_category)
  WHERE workspace_id IS NOT NULL AND state NOT IN ('DISCARDED', 'REJECTED', 'VALIDATED');

-- ── 3. intelligence.signals ──────────────────────────────────────────────────
-- Kept in lockstep with the Signal TypeScript shape even though Phase 1
-- never persists a row here (see SignalExtractor.ts) — see this file's
-- header note.

ALTER TABLE intelligence.signals
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE intelligence.signals
  ADD COLUMN workspace_id UUID;

ALTER TABLE intelligence.signals
  ADD COLUMN subject_type TEXT NOT NULL DEFAULT 'user'
    CHECK (subject_type IN ('user', 'workspace'));

ALTER TABLE intelligence.signals
  ADD CONSTRAINT signals_owner_required
  CHECK (user_id IS NOT NULL OR workspace_id IS NOT NULL);

ALTER TABLE intelligence.signals
  ADD CONSTRAINT signals_subject_type_matches_owner
  CHECK (
    (subject_type = 'user' AND user_id IS NOT NULL)
    OR (subject_type = 'workspace' AND workspace_id IS NOT NULL)
  );

-- ── 4. intelligence.profiles ─────────────────────────────────────────────────
-- A Workspace Subject's synthesized identity reuses this table exactly the
-- way a User's does (ADR-003 §2.3) — no separate WorkspaceProfile table.

ALTER TABLE intelligence.profiles
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE intelligence.profiles
  ADD COLUMN workspace_id UUID;

ALTER TABLE intelligence.profiles
  ADD COLUMN subject_type TEXT NOT NULL DEFAULT 'user'
    CHECK (subject_type IN ('user', 'workspace'));

ALTER TABLE intelligence.profiles
  ADD CONSTRAINT profiles_owner_required
  CHECK (user_id IS NOT NULL OR workspace_id IS NOT NULL);

ALTER TABLE intelligence.profiles
  ADD CONSTRAINT profiles_subject_type_matches_owner
  CHECK (
    (subject_type = 'user' AND user_id IS NOT NULL)
    OR (subject_type = 'workspace' AND workspace_id IS NOT NULL)
  );

-- The pre-existing `intelligence_profiles_user_current` unique index
-- (`ON intelligence.profiles(user_id) WHERE is_current = true`) already
-- silently ignores rows with a null user_id (a partial unique index on a
-- nullable column does not constrain NULLs against each other in
-- Postgres), so a Workspace-subject profile would not violate it — but it
-- also would not *prevent* two concurrently-current profiles for the same
-- workspace, since the index doesn't look at workspace_id at all. Add the
-- symmetric index rather than relying on that accidental non-enforcement.
CREATE UNIQUE INDEX intelligence_profiles_workspace_current
  ON intelligence.profiles(workspace_id)
  WHERE is_current = true AND workspace_id IS NOT NULL;

-- Verification (run manually after applying):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid IN (
--     'intelligence.learnings'::regclass,
--     'intelligence.hypotheses'::regclass,
--     'intelligence.signals'::regclass,
--     'intelligence.profiles'::regclass
--   )
--   AND conname LIKE '%subject_type%' OR conname LIKE '%owner_required%';
