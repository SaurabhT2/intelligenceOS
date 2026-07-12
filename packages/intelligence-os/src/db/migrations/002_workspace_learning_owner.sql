-- =============================================================================
-- Migration 002 — Allow workspace-owned learnings without a fabricated user
-- =============================================================================
-- Milestone 3, Phase 2 (Observation Pipeline).
--
-- Context:
--   intelligence.learnings already has a `workspace_id` column (added for
--   E1-2 Phase B — "workspace-scoped brand voice", see schema.sql's Amendments
--   header and WorkspaceIntelligenceDomain.getWorkspaceLearnings /
--   upsertWorkspaceLearning). That column has always been nullable and has
--   never carried a FK (the workspace table lives in BrandOS's schema).
--
--   However `user_id` on the same table is `NOT NULL REFERENCES auth.users`.
--   That makes WorkspaceIntelligenceDomain.upsertWorkspaceLearning() —
--   already fully implemented, already the exact method
--   ContextBuilder.build() reads from via getWorkspaceLearnings() — unusable
--   for a genuinely workspace-only observation (one with no single owning
--   user), which upsertWorkspaceLearning's own pre-existing comment already
--   flagged as an open problem ("the FK constraint requires a real
--   auth.users reference ... this path will be refactored in Phase B
--   proper").
--
-- This migration resolves that flag WITHOUT fabricating a sentinel user:
--   1. Drop the NOT NULL constraint on learnings.user_id.
--   2. Add a CHECK constraint requiring at least one real owner
--      (user_id OR workspace_id) — a learning can never be ownerless.
--
-- This is additive and backward compatible:
--   - Every existing row already has a real user_id, so the new CHECK is
--     satisfied by 100% of current data.
--   - Every existing query (`.eq('user_id', ...)`) is unaffected.
--   - User-scoped write paths (UserIntelligenceDomain, LearningValidator,
--     HypothesisEngine, ProfileBuilder) are untouched — they always set a
--     real user_id and continue to work exactly as before.
--
-- Explicitly NOT changed by this migration (left for a future increment,
-- flagged rather than silently worked around):
--   - intelligence.feedback_events, intelligence.signals, and
--     intelligence.hypotheses remain user_id-only (NOT NULL). The full
--     Signal → Hypothesis → Learning pipeline (SignalExtractor,
--     HypothesisEngine, LearningValidator, ProfileBuilder) is built around
--     `FeedbackEvent` (`@intelligence-os/shared-types`), which has no
--     workspaceId field at all. Threading workspace-ownership through that
--     entire pipeline (4 more tables, 4 more classes, plus the
--     BrandOS-side FeedbackEvent type) is a materially larger change than
--     "minimal" — it is not attempted here. See the Milestone 3 report for
--     the explicit scope line.
--   - intelligence.profiles / intelligence.archetypes are single-user
--     constructs with no workspace analog in this schema. Workspace-level
--     "identity" is represented instead by the same workspace-scoped
--     learnings this migration unblocks — there is no separate workspace
--     profile table to populate.
-- =============================================================================

ALTER TABLE intelligence.learnings
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE intelligence.learnings
  ADD CONSTRAINT learnings_owner_required
  CHECK (user_id IS NOT NULL OR workspace_id IS NOT NULL);

-- Verification (run manually after applying):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'intelligence.learnings'::regclass
--     AND conname = 'learnings_owner_required';
