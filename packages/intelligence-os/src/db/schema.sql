-- =============================================================================
-- Intelligence OS — Postgres Schema
-- =============================================================================
-- Authority: BrandOS_IntelligenceOS_Architecture.md, Section 3
-- Amendments: Sprint 0 sign-off (2025-06-19)
--   • Added intelligence.archetypes (Logical Schema K.2 — Phase-1-mandatory)
--   • Added intelligence.audience_profiles (Logical Schema B.14 — Phase-1-mandatory)
--   • Fixed artifact_patterns RLS: universal patterns (user_id IS NULL) were
--     excluded by the original "auth.uid() = user_id" policy. Corrected below.
--   • workspace_id columns intentionally carry NO REFERENCES clause: the
--     workspace table lives in BrandOS's schema, not in intelligence.
--     Cross-schema FK enforcement is handled at the application layer.
--   • blueprint_ref in feedback_events is a soft UUID reference to
--     artifact_blueprints (same schema), not a hard FK, to allow the
--     blueprints table to have its own TTL-based expiry without cascade
--     deletes corrupting the feedback audit trail.
--
-- Application order: run this file once against a fresh Supabase project.
-- For subsequent migrations, generate incremental files rather than
-- re-running this script (which will fail on duplicate object names).
--
-- =============================================================================
-- SUPABASE CONFIGURATION REQUIRED BEFORE RUNNING
-- =============================================================================
-- In the Supabase dashboard → Settings → API → Exposed schemas:
--   Add "intelligence" to the exposed schemas list.
--
-- Then run the following GRANT statements as the postgres superuser
-- (Supabase SQL editor with "Run as superuser" enabled):
--
--   GRANT USAGE ON SCHEMA intelligence TO anon, authenticated, service_role;
--   GRANT SELECT ON ALL TABLES IN SCHEMA intelligence TO authenticated;
--   GRANT ALL ON ALL TABLES IN SCHEMA intelligence TO service_role;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA intelligence TO service_role;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA intelligence
--     GRANT SELECT ON TABLES TO authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA intelligence
--     GRANT ALL ON TABLES TO service_role;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA intelligence
--     GRANT ALL ON SEQUENCES TO service_role;
--
-- Intelligence OS uses the service_role key (bypasses RLS by design).
-- The authenticated role is read-only via Supabase client on the frontend.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS intelligence;

-- =============================================================================
-- 1. INTELLIGENCE PROFILE  (versioned user model)
-- =============================================================================

CREATE TABLE intelligence.profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version              INTEGER NOT NULL DEFAULT 1,
  is_current           BOOLEAN NOT NULL DEFAULT true,
  composite_confidence NUMERIC(4,3) NOT NULL DEFAULT 0
                         CHECK (composite_confidence >= 0 AND composite_confidence <= 1),
  archetype_primary    TEXT,
  archetype_confidence NUMERIC(4,3) CHECK (archetype_confidence >= 0 AND archetype_confidence <= 1),
  -- JSONB fields: exact internal structure owned by Profile Builder (Sprint 2+).
  -- Shapes: voice_summary → {register, tone[], sentenceRhythm, paragraphStyle, avoidPatterns}
  --         goal_summary   → [{goal, priority, timeHorizon}]
  --         constraint_summary → [{constraint, isHard}]
  voice_summary        JSONB,
  goal_summary         JSONB,
  constraint_summary   JSONB,
  preference_summary   JSONB,
  expertise_domains    JSONB,
  vocabulary_snapshot  JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX intelligence_profiles_user_current
  ON intelligence.profiles(user_id)
  WHERE is_current = true;

CREATE INDEX intelligence_profiles_user_version
  ON intelligence.profiles(user_id, version);

-- =============================================================================
-- 2. ARCHETYPES  (Phase-1-mandatory per Logical Schema K.2)
-- =============================================================================
-- System of record for user archetype classification. profiles.archetype_primary
-- and profiles.archetype_confidence are a fast-read cache of the is_primary = true
-- row here. Multi-archetype weighting (Phase 3) will use non-primary rows.

CREATE TABLE intelligence.archetypes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archetype_type   TEXT NOT NULL,
  confidence       NUMERIC(4,3) NOT NULL DEFAULT 0.1
                     CHECK (confidence >= 0 AND confidence <= 1),
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  evidence_summary JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one primary per user enforced here; application enforces the swap
-- (set old primary to false, insert/update new primary to true).
CREATE UNIQUE INDEX intelligence_archetypes_user_primary
  ON intelligence.archetypes(user_id)
  WHERE is_primary = true;

CREATE INDEX intelligence_archetypes_user_type
  ON intelligence.archetypes(user_id, archetype_type);

-- =============================================================================
-- 3. LEARNINGS  (validated intelligence atoms)
-- =============================================================================

CREATE TABLE intelligence.learnings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- workspace_id: intentionally no REFERENCES (workspace table lives in BrandOS schema)
  workspace_id          UUID,
  -- project_id: FK within intelligence schema
  project_id            UUID,   -- populated after Sprint 0; REFERENCES added in Sprint 2 migration
  domain                TEXT NOT NULL
                          CHECK (domain IN (
                            'user_intelligence','project_intelligence','artifact_intelligence',
                            'knowledge_intelligence','relationship_intelligence','workspace_intelligence'
                          )),
  taxonomy_category     TEXT NOT NULL,  -- 25 values from Taxonomy Section A
  stability_class       TEXT NOT NULL
                          CHECK (stability_class IN ('permanent','long_term','medium_term')),
  state                 TEXT NOT NULL DEFAULT 'VALIDATED'
                          CHECK (state IN ('VALIDATED','CONFIRMED','ACTIVE','DECAYING','FLAGGED','ARCHIVED','RETIRED')),
  confidence            NUMERIC(4,3) NOT NULL
                          CHECK (confidence >= 0 AND confidence <= 1),
  context_scope         TEXT NOT NULL DEFAULT 'global'
                          CHECK (context_scope IN ('global','artifact_type','project','audience')),
  context_artifact_type TEXT,     -- populated when context_scope = 'artifact_type'
  context_project_id    UUID,     -- populated when context_scope = 'project'
  context_audience_type TEXT,     -- populated when context_scope = 'audience'
  content               JSONB NOT NULL,   -- intelligence payload; structure varies by taxonomy_category
  source_summary        JSONB NOT NULL DEFAULT '{}',   -- {corroborationCount, quality, sources[]}
  decay_rate            TEXT CHECK (decay_rate IN ('none','slow','standard','fast')),
  last_confirmed_at     TIMESTAMPTZ,
  decay_started_at      TIMESTAMPTZ,
  archived_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_learnings_user_domain
  ON intelligence.learnings(user_id, domain, state);

CREATE INDEX intelligence_learnings_user_category
  ON intelligence.learnings(user_id, taxonomy_category, state);

CREATE INDEX intelligence_learnings_project
  ON intelligence.learnings(project_id, domain)
  WHERE project_id IS NOT NULL;

-- =============================================================================
-- 4. HYPOTHESES  (unvalidated propositions awaiting corroboration)
-- =============================================================================

CREATE TABLE intelligence.hypotheses (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id                  UUID,
  taxonomy_category           TEXT NOT NULL,
  stability_class             TEXT NOT NULL
                                CHECK (stability_class IN ('permanent','long_term','medium_term')),
  state                       TEXT NOT NULL DEFAULT 'PROVISIONAL'
                                CHECK (state IN ('PROVISIONAL','ACCUMULATING','CHALLENGED','VALIDATED','DISCARDED','REJECTED')),
  confidence                  NUMERIC(4,3) NOT NULL DEFAULT 0.1
                                CHECK (confidence >= 0 AND confidence <= 1),
  required_corroborations     INTEGER NOT NULL,
  current_corroborations      INTEGER NOT NULL DEFAULT 0,
  high_quality_contradictions INTEGER NOT NULL DEFAULT 0,
  proposition                 JSONB NOT NULL,
  context_scope               TEXT NOT NULL DEFAULT 'global'
                                CHECK (context_scope IN ('global','artifact_type','project','audience')),
  context_artifact_type       TEXT,
  promoted_learning_id        UUID REFERENCES intelligence.learnings(id) ON DELETE SET NULL,
  expires_at                  TIMESTAMPTZ,   -- 30d for non-permanent stability class, null for permanent
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_hypotheses_user_active
  ON intelligence.hypotheses(user_id, state, taxonomy_category)
  WHERE state NOT IN ('DISCARDED','REJECTED','VALIDATED');

-- =============================================================================
-- 5. SIGNALS  (raw extraction inputs — ephemeral, auto-deleted post-processing)
-- =============================================================================

CREATE TABLE intelligence.signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        UUID,
  source_type       TEXT NOT NULL
                      CHECK (source_type IN (
                        'prompt','feedback_event','uploaded_artifact',
                        'edit_diff','explicit_statement','behavioral'
                      )),
  source_ref        UUID,            -- soft ref to source record (artifact_id, feedback_event id, etc.)
  context_flags     TEXT[] NOT NULL DEFAULT '{}',
                    -- known quarantine triggers: role_play|hypothetical|emotional_state
  taxonomy_category TEXT,            -- null until ObservationBuilder classifies it
  raw_content       JSONB NOT NULL,
  is_quarantined    BOOLEAN NOT NULL DEFAULT false,
  quarantine_reason TEXT,
  processed_at      TIMESTAMPTZ,     -- null until consumed by ObservationBuilder
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_signals_unprocessed
  ON intelligence.signals(user_id, processed_at)
  WHERE processed_at IS NULL;

-- =============================================================================
-- 6. ARTIFACT PATTERNS  (structural intelligence — universal → archetype → user)
-- =============================================================================

CREATE TABLE intelligence.artifact_patterns (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type            TEXT NOT NULL,
  pattern_level            TEXT NOT NULL
                             CHECK (pattern_level IN ('universal','archetype','user_calibrated')),
  -- null for universal patterns; required for user_calibrated (enforced below)
  user_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- populated for archetype-level patterns; null for universal and user_calibrated
  archetype_type           TEXT,
  confidence               NUMERIC(4,3) NOT NULL DEFAULT 0.5
                             CHECK (confidence >= 0 AND confidence <= 1),
  sections                 JSONB NOT NULL,          -- ordered section defs with depth specs
  narrative_model          JSONB NOT NULL,          -- frame, argument structure, opening, closing
  length_baseline          JSONB,                   -- {min, max} word counts per section
  tone_model               JSONB,
  exemplar_count           INTEGER NOT NULL DEFAULT 0,
  known_rejection_triggers JSONB NOT NULL DEFAULT '[]',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pattern_user_scope CHECK (
    (pattern_level = 'user_calibrated' AND user_id IS NOT NULL) OR
    (pattern_level != 'user_calibrated')
  )
);

CREATE INDEX intelligence_artifact_patterns_lookup
  ON intelligence.artifact_patterns(artifact_type, pattern_level, user_id);

-- =============================================================================
-- 7. ARTIFACT EXEMPLARS  (deployed / praised artifacts — never deleted)
-- =============================================================================

CREATE TABLE intelligence.artifact_exemplars (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_type       TEXT NOT NULL,
  source_artifact_id  UUID NOT NULL,   -- soft ref to BrandOS artifacts table (no FK)
  promotion_reason    TEXT NOT NULL
                        CHECK (promotion_reason IN ('deployed','explicitly_praised')),
  structural_snapshot JSONB NOT NULL,
  voice_snapshot      JSONB,
  audience_snapshot   JSONB,
  promoted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Exemplars are never deleted per Contracts H.5.
);

CREATE INDEX intelligence_artifact_exemplars_user_type
  ON intelligence.artifact_exemplars(user_id, artifact_type, promoted_at DESC);

-- =============================================================================
-- 8. KNOWLEDGE ASSETS
-- =============================================================================

CREATE TABLE intelligence.knowledge_assets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type           TEXT NOT NULL
                         CHECK (owner_type IN ('user','project','workspace')),
  user_id              UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id           UUID,       -- soft ref to intelligence.projects (no hard FK for now)
  workspace_id         UUID,       -- soft ref to BrandOS workspace (no FK by design)
  asset_type           TEXT NOT NULL
                         CHECK (asset_type IN ('playbook','framework','methodology','template','reference')),
  title                TEXT NOT NULL,
  source_file_ref      TEXT,       -- storage key or path to original file
  extracted_vocabulary JSONB,      -- {preferredTerms, forbiddenTerms, proprietaryTerms}
  extracted_patterns   JSONB,      -- structural patterns extracted from the document
  extracted_frameworks JSONB,      -- frameworks, complianceConstraints[], principles
  confidence           NUMERIC(4,3) NOT NULL DEFAULT 0.9
                         CHECK (confidence >= 0 AND confidence <= 1),
  version              INTEGER NOT NULL DEFAULT 1,
  is_current           BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_knowledge_assets_user
  ON intelligence.knowledge_assets(user_id, is_current)
  WHERE user_id IS NOT NULL;

CREATE INDEX intelligence_knowledge_assets_workspace
  ON intelligence.knowledge_assets(workspace_id, is_current)
  WHERE workspace_id IS NOT NULL;

-- =============================================================================
-- 9. PROJECTS
-- =============================================================================

CREATE TABLE intelligence.projects (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id       UUID,         -- soft ref to BrandOS workspace (no FK by design)
  brandos_project_id UUID UNIQUE,  -- soft ref to BrandOS project table (no FK by design)
  name               TEXT NOT NULL,
  project_type       TEXT,
  lifecycle_state    TEXT NOT NULL DEFAULT 'IDEATION'
                       CHECK (lifecycle_state IN ('IDEATION','ACTIVE','WIND_DOWN','ARCHIVED')),
  goals              JSONB NOT NULL DEFAULT '[]',
  constraints        JSONB NOT NULL DEFAULT '[]',
  vocabulary_model   JSONB NOT NULL DEFAULT '{}',
  stakeholders       JSONB NOT NULL DEFAULT '[]',
  success_criteria   JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_projects_user_active
  ON intelligence.projects(user_id, lifecycle_state)
  WHERE lifecycle_state IN ('IDEATION','ACTIVE');

-- =============================================================================
-- 10. RELATIONSHIPS  (table exists; domain deferred to Phase 2)
-- =============================================================================

CREATE TABLE intelligence.relationships (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  organization        TEXT,
  relationship_type   TEXT
                        CHECK (relationship_type IN ('investor','board','client','employee','partner','peer')),
  expertise_level     TEXT
                        CHECK (expertise_level IN ('expert','practitioner','informed','general')),
  communication_norms JSONB,
  known_sensitivities JSONB,
  confidence          NUMERIC(4,3) NOT NULL DEFAULT 0.3
                        CHECK (confidence >= 0 AND confidence <= 1),
  last_interaction_at TIMESTAMPTZ,
  decay_started_at    TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_relationships_user_active
  ON intelligence.relationships(user_id, is_active)
  WHERE is_active = true;

-- =============================================================================
-- 11. AUDIENCE PROFILES  (Phase-1-mandatory per Logical Schema B.14)
-- =============================================================================
-- Phase 1: owner_type = 'generic', relationship_id = NULL, audience_type set.
-- Phase 2: owner_type = 'named',   relationship_id = FK to relationships above.

CREATE TABLE intelligence.audience_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_type          TEXT NOT NULL
                        CHECK (owner_type IN ('generic','named')),
  -- Null for generic profiles (Phase 1); populated for named profiles (Phase 2).
  relationship_id     UUID REFERENCES intelligence.relationships(id) ON DELETE SET NULL,
  -- Null for named profiles (expertise comes from the relationship record).
  audience_type       TEXT
                        CHECK (audience_type IN ('board','investor','engineering','customer','general')),
  expertise_level     TEXT NOT NULL
                        CHECK (expertise_level IN ('expert','practitioner','informed','general')),
  communication_norms JSONB NOT NULL DEFAULT '{}',
  known_sensitivities JSONB NOT NULL DEFAULT '{}',
  confidence          NUMERIC(4,3) NOT NULL DEFAULT 0.5
                        CHECK (confidence >= 0 AND confidence <= 1),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Generic profiles must have audience_type; named profiles must have relationship_id.
  CONSTRAINT audience_profile_owner_consistency CHECK (
    (owner_type = 'generic'  AND audience_type IS NOT NULL) OR
    (owner_type = 'named'    AND relationship_id IS NOT NULL)
  )
);

CREATE INDEX intelligence_audience_profiles_user_generic
  ON intelligence.audience_profiles(user_id, audience_type, is_active)
  WHERE owner_type = 'generic' AND is_active = true;

CREATE INDEX intelligence_audience_profiles_relationship
  ON intelligence.audience_profiles(relationship_id)
  WHERE relationship_id IS NOT NULL;

-- =============================================================================
-- 12. FEEDBACK EVENTS
-- =============================================================================

CREATE TABLE intelligence.feedback_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_id       UUID NOT NULL,    -- soft ref to BrandOS artifacts table (no FK by design)
  artifact_type     TEXT NOT NULL,
  project_id        UUID,             -- soft ref to intelligence.projects
  event_type        TEXT NOT NULL
                      CHECK (event_type IN ('accepted','edited','rejected','deployed','explicit_feedback')),
  edit_diff         JSONB,            -- populated for 'edited' events
  explicit_reason   TEXT,             -- populated for 'explicit_feedback' events
  signals_extracted BOOLEAN NOT NULL DEFAULT false,
  -- Soft reference: blueprint may have been TTL-expired by the time this is read.
  blueprint_ref     UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_feedback_events_user_unprocessed
  ON intelligence.feedback_events(user_id, signals_extracted, created_at DESC)
  WHERE signals_extracted = false;

CREATE INDEX intelligence_feedback_events_artifact
  ON intelligence.feedback_events(artifact_id, created_at DESC);

-- =============================================================================
-- 13. ARTIFACT BLUEPRINTS  (ephemeral audit trail)
-- =============================================================================

CREATE TABLE intelligence.artifact_blueprints (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_type                TEXT NOT NULL,
  project_id                   UUID,
  relationship_id              UUID,  -- populated if named audience (Phase 2)
  sections                     JSONB NOT NULL,
  narrative_frame              JSONB NOT NULL,
  depth_spec                   JSONB NOT NULL,
  voice_directives             JSONB NOT NULL,
  vocabulary_directives        JSONB NOT NULL,
  audience_calibration         JSONB NOT NULL,
  compliance_requirements      JSONB NOT NULL DEFAULT '[]',
  conflicts_detected           JSONB NOT NULL DEFAULT '[]',
  conflicts_resolved           JSONB NOT NULL DEFAULT '[]',
  quality_score                JSONB,
  intelligence_profile_version INTEGER,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Auto-delete after 180 days per Architecture Section 3.
  expires_at                   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '180 days'
);

CREATE INDEX intelligence_artifact_blueprints_user
  ON intelligence.artifact_blueprints(user_id, created_at DESC);

CREATE INDEX intelligence_artifact_blueprints_expiry
  ON intelligence.artifact_blueprints(expires_at);

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================
-- Policy design:
--   • service_role bypasses RLS by default in Supabase — all Intelligence OS
--     backend writes use the service_role key. No explicit service_role
--     policies are needed.
--   • authenticated role: read-only access to the user's own rows.
--   • anon role: no access.
--
-- IMPORTANT — artifact_patterns fix: universal patterns have user_id IS NULL.
-- The original architecture doc's policy "auth.uid() = user_id" would silently
-- exclude all universal patterns for authenticated users. The corrected policy
-- below uses pattern_level = 'universal' OR user_id = auth.uid().
-- =============================================================================

ALTER TABLE intelligence.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.archetypes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.learnings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.hypotheses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.signals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.artifact_patterns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.artifact_exemplars ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.knowledge_assets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.relationships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.audience_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.feedback_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.artifact_blueprints ENABLE ROW LEVEL SECURITY;

-- User-scoped tables: simple owner check
CREATE POLICY "profiles_select"            ON intelligence.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "archetypes_select"          ON intelligence.archetypes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "learnings_select"           ON intelligence.learnings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "hypotheses_select"          ON intelligence.hypotheses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "signals_select"             ON intelligence.signals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "artifact_exemplars_select"  ON intelligence.artifact_exemplars
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "knowledge_assets_select"    ON intelligence.knowledge_assets
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "projects_select"            ON intelligence.projects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "relationships_select"       ON intelligence.relationships
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "audience_profiles_select"   ON intelligence.audience_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "feedback_events_select"     ON intelligence.feedback_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "artifact_blueprints_select" ON intelligence.artifact_blueprints
  FOR SELECT USING (auth.uid() = user_id);

-- artifact_patterns: CORRECTED policy (universal patterns have user_id IS NULL)
CREATE POLICY "artifact_patterns_select"   ON intelligence.artifact_patterns
  FOR SELECT USING (
    pattern_level = 'universal'      -- visible to all authenticated users
    OR user_id = auth.uid()          -- user's own calibrated / archetype patterns
  );

-- =============================================================================
-- SEED: Universal Artifact Patterns  (Sprint 0, Task 3)
-- =============================================================================
-- Seeds the 5 core artifact types at pattern_level = 'universal'.
-- These are the baseline patterns used by StructurePlanner before any
-- user-calibration data exists (new users, pre-onboarding).
--
-- The JSONB content below is a structural skeleton only. The actual
-- section titles, purposes, word counts, narrative models, and tone
-- guidance MUST be filled in by the product team before Sprint 1 QA.
-- Mark these rows with confidence = 0.5 (the minimum) until real
-- editorial content is provided.
--
-- Ownership: Product / Brand Strategy team, not the engineering team.
-- =============================================================================

INSERT INTO intelligence.artifact_patterns
  (artifact_type, pattern_level, user_id, archetype_type, confidence,
   sections, narrative_model, length_baseline, tone_model, exemplar_count)
VALUES

-- 1. Board Update
('board_update', 'universal', NULL, NULL, 0.5,
 '{"sections": [
    {"id": "exec_summary",     "title": "Executive Summary",        "purpose": "Key message in 3 sentences or fewer", "depthLevel": "summary"},
    {"id": "metrics_progress", "title": "Metrics & Progress",       "purpose": "KPIs vs targets, delta from last update", "depthLevel": "standard"},
    {"id": "decisions_needed", "title": "Decisions Needed",         "purpose": "Items requiring board input", "depthLevel": "standard"},
    {"id": "risks_mitigations","title": "Risks & Mitigations",      "purpose": "Top 2-3 risks with owner and mitigation", "depthLevel": "standard"},
    {"id": "next_period_plan", "title": "Next Period Plan",         "purpose": "Commitments for next review period", "depthLevel": "summary"}
  ]}',
 '{"frame": "TODO: board_update narrative frame", "argumentStructure": "TODO", "opening": "TODO", "closing": "TODO"}',
 '{"total": {"min": 400, "max": 800}, "perSection": {"exec_summary": {"max": 150}}}',
 '{"register": "formal", "tone": ["concise", "data-led", "accountable"], "avoidPatterns": []}',
 0),

-- 2. Investor Update
('investor_update', 'universal', NULL, NULL, 0.5,
 '{"sections": [
    {"id": "highlights",    "title": "Highlights",            "purpose": "Top 3 wins since last update", "depthLevel": "summary"},
    {"id": "metrics",       "title": "Key Metrics",           "purpose": "Revenue, growth, engagement", "depthLevel": "standard"},
    {"id": "team_product",  "title": "Team & Product",        "purpose": "Hires, milestones, roadmap", "depthLevel": "standard"},
    {"id": "challenges",    "title": "Challenges & Asks",     "purpose": "Honest assessment; specific requests", "depthLevel": "standard"},
    {"id": "next_milestones","title": "Next Milestones",      "purpose": "What we plan to achieve by next update", "depthLevel": "summary"}
  ]}',
 '{"frame": "TODO: investor_update narrative frame", "argumentStructure": "TODO", "opening": "TODO", "closing": "TODO"}',
 '{"total": {"min": 500, "max": 1000}}',
 '{"register": "professional", "tone": ["transparent", "confident", "data-led"], "avoidPatterns": []}',
 0),

-- 3. Strategy Document
('strategy_document', 'universal', NULL, NULL, 0.5,
 '{"sections": [
    {"id": "situation",   "title": "Situation & Context",     "purpose": "Where we are and why this matters now", "depthLevel": "standard"},
    {"id": "objective",   "title": "Strategic Objective",     "purpose": "Specific goal with success criteria", "depthLevel": "standard"},
    {"id": "options",     "title": "Options Considered",      "purpose": "2-3 alternatives with trade-offs", "depthLevel": "deep"},
    {"id": "recommended", "title": "Recommended Approach",    "purpose": "Chosen path with rationale", "depthLevel": "deep"},
    {"id": "plan",        "title": "Execution Plan",          "purpose": "Phases, owners, milestones", "depthLevel": "standard"},
    {"id": "risks",       "title": "Risks & Assumptions",     "purpose": "Key dependencies and mitigations", "depthLevel": "standard"}
  ]}',
 '{"frame": "TODO: strategy_document narrative frame", "argumentStructure": "TODO", "opening": "TODO", "closing": "TODO"}',
 '{"total": {"min": 1000, "max": 3000}}',
 '{"register": "professional", "tone": ["analytical", "authoritative", "structured"], "avoidPatterns": []}',
 0),

-- 4. Architecture Proposal
('architecture_proposal', 'universal', NULL, NULL, 0.5,
 '{"sections": [
    {"id": "problem",      "title": "Problem Statement",      "purpose": "What breaks or scales poorly today", "depthLevel": "standard"},
    {"id": "requirements", "title": "Requirements",           "purpose": "Functional and non-functional", "depthLevel": "standard"},
    {"id": "design",       "title": "Proposed Design",        "purpose": "Architecture with diagrams or pseudocode", "depthLevel": "deep"},
    {"id": "alternatives", "title": "Alternatives Rejected",  "purpose": "What was considered and why not chosen", "depthLevel": "standard"},
    {"id": "trade_offs",   "title": "Trade-offs & Risks",     "purpose": "Known limitations and mitigations", "depthLevel": "standard"},
    {"id": "migration",    "title": "Migration Path",         "purpose": "How we get from current to proposed state", "depthLevel": "standard"}
  ]}',
 '{"frame": "TODO: architecture_proposal narrative frame", "argumentStructure": "TODO", "opening": "TODO", "closing": "TODO"}',
 '{"total": {"min": 800, "max": 2500}}',
 '{"register": "technical", "tone": ["precise", "thorough", "neutral"], "avoidPatterns": []}',
 0),

-- 5. LinkedIn Post
('linkedin_post', 'universal', NULL, NULL, 0.5,
 '{"sections": [
    {"id": "hook",       "title": "Hook",           "purpose": "First line that earns the scroll stop", "depthLevel": "summary"},
    {"id": "body",       "title": "Body",           "purpose": "Insight, story, or argument in 3-5 paragraphs", "depthLevel": "standard"},
    {"id": "cta",        "title": "Call to Action", "purpose": "What you want readers to do or think", "depthLevel": "summary"}
  ]}',
 '{"frame": "TODO: linkedin_post narrative frame", "argumentStructure": "TODO", "opening": "TODO", "closing": "TODO"}',
 '{"total": {"min": 150, "max": 600}}',
 '{"register": "conversational", "tone": ["authentic", "insightful", "direct"], "avoidPatterns": []}',
 0);
