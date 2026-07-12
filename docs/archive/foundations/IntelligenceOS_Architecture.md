# Intelligence OS — Independent Module Architecture

> **Historical specification document.** This is the original architecture spec IntelligenceOS was built from — the implementation is now complete (Epic 1 + Epic 2). "Status: Proposed" reflects the document's state at authoring time; the architecture described here has been implemented, refined, and in some cases superseded by subsequent decisions (ADR-001, ARCHITECTURE_REVIEW_E2-0). Treat this as the provenance record for *why* things were designed as they are, not as a description of current state. For current state, see `INTELLIGENCEOS_BOOTSTRAP.md` and `docs/IMPLEMENTATION_STATUS.md`.

**Document Class:** Engineering Architecture — Implementation-Ready  
**Status:** Proposed  
**Scope:** Intelligence OS design for independent development with BrandOS integration path  
**Authority Documents:** BrandOS Learning Taxonomy v1.0 · BrandOS Intelligence Architecture v1.0 · BrandOS Logical Intelligence Schema v1.0 · BrandOS Intelligence Contracts v1.0  
**Prepared for:** Engineering Team

---

## Stated Assumptions About the Existing BrandOS System

Before proposing any architecture, the following assumptions are made explicit. These are inferences from the design documents and must be validated against the actual codebase before implementation begins. **Any assumption that does not hold changes the integration approach for that specific area.**

### Infrastructure Assumptions

| # | Assumption | Basis | Risk if Wrong |
|---|---|---|---|
| A1 | BrandOS is a TypeScript monorepo using a standard workspace manager (pnpm, npm, or yarn workspaces) | "existing monorepo patterns" stated in brief | Intelligence OS packages can still be TypeScript, but the workspace configuration approach changes |
| A2 | Supabase is the primary database layer, running Postgres underneath | Explicitly stated in brief as preferred | If a different Postgres provider is used, Supabase-specific features (RLS, Realtime, Edge Functions) must be replaced with equivalents |
| A3 | A shared `packages/` or `libs/` directory exists for cross-package TypeScript types and utilities | Standard monorepo convention | If BrandOS uses a flat structure, shared types will need a new home |
| A4 | An event bus or message queue exists or can be introduced as infrastructure — the brief specifies event-driven integration | Brief states "event-driven integration" as a preference | If no event bus exists, the integration boundary will use direct function calls or HTTP instead, increasing coupling |
| A5 | The existing BrandOS artifact generation system has a defined input interface (a request object or prompt construction function) that can be called with additional context | Core integration assumption | If generation is tightly coupled, a thin adapter layer will be needed before Intelligence OS can inject context |
| A6 | Authentication and user identity are already solved: BrandOS has a `user_id` (UUID) that is stable and available in every request context | Universal for Supabase apps | If user identity is sessionbased without a persistent UUID, the intelligence profile anchor breaks |

### What Is Not Assumed

- I do **not** assume what ORM, HTTP framework, or AI SDK BrandOS uses. Intelligence OS is designed to be framework-agnostic internally.
- I do **not** assume any specific artifact generation runtime. Intelligence OS produces a `Blueprint` object; how that Blueprint is consumed by generation is a handoff, not a dependency.
- I do **not** assume an existing event bus is production-ready. The integration design includes a lightweight in-process event emitter fallback that can be swapped for a real bus (BullMQ, Inngest, etc.) without changing Intelligence OS internals.
- I do **not** assume BrandOS has any existing intelligence or memory infrastructure. The full schema is designed from scratch.

---

## Table of Contents

1. [Module Boundary and Integration Model](#1-module-boundary-and-integration-model)
2. [Package Structure](#2-package-structure)
3. [Database Schema — Supabase/Postgres](#3-database-schema--supabasepostgres)
4. [Domain Store Architecture](#4-domain-store-architecture)
5. [Learning Pipeline Implementation](#5-learning-pipeline-implementation)
6. [Blueprint Assembly System](#6-blueprint-assembly-system)
7. [Event Contract — Integration Boundary](#7-event-contract--integration-boundary)
8. [TypeScript Contracts](#8-typescript-contracts)
9. [Phase 1 Implementation Plan](#9-phase-1-implementation-plan)
10. [BrandOS Integration Guide](#10-brandos-integration-guide)
11. [Testing Strategy](#11-testing-strategy)

---

## 1. Module Boundary and Integration Model

### 1.1 — The Core Principle

Intelligence OS is designed as a **self-contained package** that BrandOS consumes via two interfaces:

1. **A context injection call** before artifact generation: `buildBlueprint(request)` → `ArtifactBlueprint`
2. **A feedback ingestion call** after artifact delivery: `recordFeedbackEvent(event)` → `void`

Everything else — the learning pipeline, domain stores, conflict resolution, hypothesis state machine — is an internal concern of Intelligence OS. BrandOS does not need to know about Signals, Observations, or Hypotheses to integrate.

```
┌──────────────────────────────────────────────────────────────┐
│                        BrandOS                               │
│                                                              │
│  [Artifact Request] ──► intelligence.buildBlueprint() ──►   │
│                         [ArtifactBlueprint]                  │
│                                ▼                             │
│                   [Existing Generation Runtime]              │
│                                ▼                             │
│  [User Feedback]  ──► intelligence.recordFeedbackEvent() ◄── │
└──────────────────────────────────────────────────────────────┘
         │                                                │
         │ emits events                    reads/writes   │
         ▼                                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Intelligence OS                          │
│  Signal Extractor → Observation Builder → Hypothesis Engine │
│  Learning Validator → Profile Builder                       │
│  Project Context Builder → Audience Calibrator             │
│  Narrative Planner → Structure Planner → Blueprint Builder  │
│  Conflict Resolution Model                                   │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  Supabase/Postgres│
                  │  (intelligence   │
                  │   schema)        │
                  └──────────────────┘
```

### 1.2 — Development Independence Strategy

Intelligence OS can be developed and tested in complete isolation from BrandOS. It requires only:

- A Supabase project (can be a separate project during development; merged at integration)
- A test harness that simulates the two integration calls with mock `user_id` values
- No access to BrandOS runtime, generation system, or existing database

The integration step is adding two function calls to the BrandOS artifact generation flow.

---

## 2. Package Structure

```
packages/
  intelligence-os/                    ← new: this package
    src/
      pipeline/                       ← Signal → Learning pipeline
        SignalExtractor.ts
        ObservationBuilder.ts
        HypothesisEngine.ts
        LearningValidator.ts
        ProfileBuilder.ts
        FeedbackProcessor.ts
      blueprint/                      ← blueprint assembly
        BlueprintBuilder.ts
        ConflictResolutionModel.ts
        StructurePlanner.ts
        NarrativePlanner.ts
        AudienceCalibrator.ts
        ProjectContextBuilder.ts
      domains/                        ← domain store interfaces
        UserIntelligenceDomain.ts
        ProjectIntelligenceDomain.ts
        ArtifactIntelligenceDomain.ts
        RelationshipIntelligenceDomain.ts
        WorkspaceIntelligenceDomain.ts
        KnowledgeIntelligenceDomain.ts
      db/                             ← Supabase queries (no ORM)
        schema.sql                    ← canonical migration
        queries/
          learnings.ts
          hypotheses.ts
          profiles.ts
          artifacts.ts
          projects.ts
          relationships.ts
      events/                         ← event bus abstraction
        IntelligenceEventBus.ts       ← interface
        InProcessEventBus.ts          ← default implementation
        BullMQEventBus.ts             ← production swap-in
      types/                          ← shared TypeScript contracts
        entities.ts                   ← all 24 entity types
        events.ts                     ← all event types
        pipeline.ts                   ← pipeline-specific types
        blueprint.ts                  ← blueprint types
        domains.ts                    ← domain enums and boundaries
      index.ts                        ← public API surface (2 functions + types)
    tests/
      pipeline/
      blueprint/
      integration/
    package.json
    tsconfig.json

packages/shared-intelligence-types/   ← new: types BrandOS can import
    src/
      ArtifactBlueprint.ts            ← the handoff type
      FeedbackEvent.ts                ← the ingestion type
      ArtifactRequest.ts              ← what BrandOS sends in
    package.json
    tsconfig.json
```

### 2.1 — Public API Surface

The `intelligence-os` package exports exactly three things consumed by BrandOS:

```typescript
// packages/intelligence-os/src/index.ts

export { IntelligenceOS } from './IntelligenceOS';
export type { ArtifactBlueprint } from './types/blueprint';
export type { FeedbackEvent } from './types/events';
```

The `IntelligenceOS` class:

```typescript
export class IntelligenceOS {
  constructor(private config: IntelligenceOSConfig) {}

  /**
   * Called before artifact generation.
   * Returns a complete Blueprint that the generation system uses.
   */
  async buildBlueprint(request: ArtifactRequest): Promise<ArtifactBlueprint> { ... }

  /**
   * Called after artifact delivery.
   * Asynchronously feeds the learning pipeline.
   * Returns immediately; processing is async.
   */
  async recordFeedbackEvent(event: FeedbackEvent): Promise<void> { ... }

  /**
   * Called at user onboarding or when a knowledge asset is uploaded.
   * Returns immediately; extraction is async.
   */
  async ingestKnowledgeAsset(asset: KnowledgeAssetInput): Promise<string> { ... }

  /**
   * Called when a project is created or updated.
   */
  async upsertProject(project: ProjectInput): Promise<string> { ... }
}
```

---

## 3. Database Schema — Supabase/Postgres

The Intelligence OS lives in a dedicated Postgres schema (`intelligence`) to avoid namespace collisions with the existing BrandOS schema. This is the cleanest isolation strategy in a shared Supabase project.

All tables reference `user_id` and `workspace_id` as foreign keys to BrandOS's existing `auth.users` and workspace tables. This is the sole coupling point to the existing database.

### 3.1 — Core Entity Tables

```sql
-- packages/intelligence-os/src/db/schema.sql

CREATE SCHEMA IF NOT EXISTS intelligence;

-- ─────────────────────────────────────────────────────
-- INTELLIGENCE PROFILE (versioned user model)
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  is_current      BOOLEAN NOT NULL DEFAULT true,
  composite_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  archetype_primary   TEXT,
  archetype_confidence NUMERIC(4,3),
  voice_summary   JSONB,           -- style, register, formality, vocabulary
  goal_summary    JSONB,           -- active goals with priority and time_horizon
  constraint_summary JSONB,
  preference_summary JSONB,
  expertise_domains JSONB,
  vocabulary_snapshot JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_profiles_user_current
  ON intelligence.profiles(user_id, is_current)
  WHERE is_current = true;

-- ─────────────────────────────────────────────────────
-- LEARNINGS (validated intelligence atoms)
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.learnings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    UUID,            -- null for personal learnings
  project_id      UUID,            -- null for non-project-scoped learnings
  domain          TEXT NOT NULL,   -- user|project|artifact|relationship|workspace|knowledge
  taxonomy_category TEXT NOT NULL, -- from Taxonomy Section A (25 categories)
  stability_class TEXT NOT NULL,   -- permanent|long_term|medium_term
  state           TEXT NOT NULL DEFAULT 'VALIDATED',
    -- VALIDATED|CONFIRMED|ACTIVE|DECAYING|FLAGGED|ARCHIVED|RETIRED
  confidence      NUMERIC(4,3) NOT NULL,
  context_scope   TEXT NOT NULL DEFAULT 'global',
    -- global|artifact_type|project|audience
  context_artifact_type TEXT,      -- populated when context_scope = artifact_type
  context_project_id    UUID,      -- populated when context_scope = project
  context_audience_type TEXT,      -- populated when context_scope = audience
  content         JSONB NOT NULL,  -- the actual intelligence payload (varies by taxonomy_category)
  source_summary  JSONB NOT NULL,  -- corroboration sources, count, quality
  decay_rate      TEXT,            -- none|slow|standard|fast (derives from stability_class)
  last_confirmed_at TIMESTAMPTZ,
  decay_started_at  TIMESTAMPTZ,
  archived_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_learnings_user_domain
  ON intelligence.learnings(user_id, domain, state);
CREATE INDEX intelligence_learnings_user_category
  ON intelligence.learnings(user_id, taxonomy_category, state);
CREATE INDEX intelligence_learnings_project
  ON intelligence.learnings(project_id, domain)
  WHERE project_id IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- HYPOTHESES (unvalidated propositions)
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.hypotheses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      UUID,
  taxonomy_category TEXT NOT NULL,
  stability_class TEXT NOT NULL,
  state           TEXT NOT NULL DEFAULT 'PROVISIONAL',
    -- PROVISIONAL|ACCUMULATING|CHALLENGED|VALIDATED|DISCARDED|REJECTED
  confidence      NUMERIC(4,3) NOT NULL DEFAULT 0.1,
  required_corroborations INTEGER NOT NULL,
  current_corroborations  INTEGER NOT NULL DEFAULT 0,
  high_quality_contradictions INTEGER NOT NULL DEFAULT 0,
  proposition     JSONB NOT NULL,  -- the hypothesis payload
  context_scope   TEXT NOT NULL DEFAULT 'global',
  context_artifact_type TEXT,
  promoted_learning_id UUID REFERENCES intelligence.learnings(id),
  expires_at      TIMESTAMPTZ,     -- 30d for non-permanent, null for permanent
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_hypotheses_user_active
  ON intelligence.hypotheses(user_id, state, taxonomy_category)
  WHERE state NOT IN ('DISCARDED', 'REJECTED', 'VALIDATED');

-- ─────────────────────────────────────────────────────
-- SIGNALS (raw extraction inputs)
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      UUID,
  source_type     TEXT NOT NULL,
    -- prompt|feedback_event|uploaded_artifact|edit_diff|explicit_statement|behavioral
  source_ref      UUID,            -- FK to the source record (artifact_id, etc.)
  context_flags   TEXT[] NOT NULL DEFAULT '{}',
    -- role_play|hypothetical|emotional_state (quarantine triggers)
  taxonomy_category TEXT,          -- set after Observation Builder runs
  raw_content     JSONB NOT NULL,
  is_quarantined  BOOLEAN NOT NULL DEFAULT false,
  quarantine_reason TEXT,
  processed_at    TIMESTAMPTZ,     -- null until processed into Observation
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Signals are ephemeral: auto-delete after 90 days post-processing
CREATE INDEX intelligence_signals_unprocessed
  ON intelligence.signals(user_id, processed_at)
  WHERE processed_at IS NULL;

-- ─────────────────────────────────────────────────────
-- ARTIFACT PATTERNS (structural intelligence)
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.artifact_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type   TEXT NOT NULL,
  pattern_level   TEXT NOT NULL,   -- universal|archetype|user_calibrated
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    -- null for universal patterns
  archetype_type  TEXT,            -- populated for archetype-level patterns
  confidence      NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  sections        JSONB NOT NULL,  -- ordered section definitions with depth specs
  narrative_model JSONB NOT NULL,  -- frame, argument structure, opening, closing
  length_baseline JSONB,           -- min/max word counts per section
  tone_model      JSONB,
  exemplar_count  INTEGER NOT NULL DEFAULT 0,
  known_rejection_triggers JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- User-calibrated patterns are scoped to user_id
  CONSTRAINT pattern_user_scope CHECK (
    (pattern_level = 'user_calibrated' AND user_id IS NOT NULL) OR
    (pattern_level != 'user_calibrated')
  )
);

CREATE INDEX intelligence_artifact_patterns_lookup
  ON intelligence.artifact_patterns(artifact_type, pattern_level, user_id);

-- ─────────────────────────────────────────────────────
-- ARTIFACT EXEMPLARS
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.artifact_exemplars (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_type   TEXT NOT NULL,
  source_artifact_id UUID NOT NULL,  -- FK to BrandOS artifacts table
  promotion_reason TEXT NOT NULL,    -- deployed|explicitly_praised
  structural_snapshot JSONB NOT NULL, -- the structure at time of promotion
  voice_snapshot  JSONB,
  audience_snapshot JSONB,
  promoted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Exemplars are never deleted (per contract)
);

-- ─────────────────────────────────────────────────────
-- KNOWLEDGE ASSETS
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.knowledge_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type      TEXT NOT NULL,   -- user|project|workspace
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      UUID,
  workspace_id    UUID,
  asset_type      TEXT NOT NULL,   -- playbook|framework|methodology|template|reference
  title           TEXT NOT NULL,
  source_file_ref TEXT,            -- path or storage key to original file
  extracted_vocabulary JSONB,
  extracted_patterns   JSONB,
  extracted_frameworks JSONB,
  confidence      NUMERIC(4,3) NOT NULL DEFAULT 0.9,
  version         INTEGER NOT NULL DEFAULT 1,
  is_current      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    UUID,
  brandos_project_id UUID UNIQUE,  -- FK to existing BrandOS project if one exists
  name            TEXT NOT NULL,
  project_type    TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'IDEATION',
    -- IDEATION|ACTIVE|WIND_DOWN|ARCHIVED
  goals           JSONB DEFAULT '[]',
  constraints     JSONB DEFAULT '[]',
  vocabulary_model JSONB DEFAULT '{}',
  stakeholders    JSONB DEFAULT '[]',
  success_criteria JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- RELATIONSHIPS
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.relationships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  organization    TEXT,
  relationship_type TEXT,          -- investor|board|client|employee|partner|peer
  expertise_level TEXT,            -- expert|practitioner|informed|general
  communication_norms JSONB,
  known_sensitivities JSONB,
  confidence      NUMERIC(4,3) NOT NULL DEFAULT 0.3,
  last_interaction_at TIMESTAMPTZ,
  decay_started_at TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- FEEDBACK EVENTS
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.feedback_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_id     UUID NOT NULL,   -- FK to BrandOS artifacts table
  artifact_type   TEXT NOT NULL,
  project_id      UUID,
  event_type      TEXT NOT NULL,   -- accepted|edited|rejected|deployed|explicit_feedback
  edit_diff       JSONB,           -- populated for edited events
  explicit_reason TEXT,            -- populated for explicit_feedback events
  signals_extracted BOOLEAN NOT NULL DEFAULT false,
  blueprint_ref   UUID,            -- the blueprint that produced this artifact
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- ARTIFACT BLUEPRINTS (ephemeral, retained for audit)
-- ─────────────────────────────────────────────────────
CREATE TABLE intelligence.artifact_blueprints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_type   TEXT NOT NULL,
  project_id      UUID,
  relationship_id UUID,
  sections        JSONB NOT NULL,
  narrative_frame JSONB NOT NULL,
  depth_spec      JSONB NOT NULL,
  voice_directives JSONB NOT NULL,
  vocabulary_directives JSONB NOT NULL,
  audience_calibration JSONB NOT NULL,
  compliance_requirements JSONB DEFAULT '[]',
  conflicts_detected JSONB DEFAULT '[]',
  conflicts_resolved JSONB DEFAULT '[]',
  quality_score   JSONB,
  intelligence_profile_version INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Auto-delete blueprints older than 180 days
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '180 days'
);

-- ─────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────
-- All intelligence tables are user-scoped.
-- Only the service role (used by Intelligence OS backend) has write access.
-- Users can only read their own data via the authenticated role.

ALTER TABLE intelligence.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.artifact_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.artifact_exemplars ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.knowledge_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.artifact_blueprints ENABLE ROW LEVEL SECURITY;

-- Universal user-scoped read policy (applied to each table)
CREATE POLICY "users_own_data" ON intelligence.profiles
  FOR SELECT USING (auth.uid() = user_id);
-- (repeated for all tables — omitted for brevity in this document)
```

---

## 4. Domain Store Architecture

Each domain is a TypeScript class that owns its reads and writes against the Postgres schema. No domain may write to another domain's tables. This enforces the hard domain boundary rule from the contracts.

```typescript
// packages/intelligence-os/src/domains/UserIntelligenceDomain.ts

export class UserIntelligenceDomain {
  constructor(private db: SupabaseClient) {}

  async getCurrentProfile(userId: string): Promise<IntelligenceProfile | null> {
    const { data } = await this.db
      .schema('intelligence')
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('is_current', true)
      .single();
    return data ? mapToProfile(data) : null;
  }

  async getActiveLearnings(
    userId: string,
    domain: DomainType,
    categories?: TaxonomyCategory[]
  ): Promise<Learning[]> {
    let query = this.db
      .schema('intelligence')
      .from('learnings')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domain)
      .in('state', ['VALIDATED', 'CONFIRMED', 'ACTIVE']);

    if (categories?.length) {
      query = query.in('taxonomy_category', categories);
    }
    const { data } = await query;
    return (data ?? []).map(mapToLearning);
  }

  async upsertProfile(profile: IntelligenceProfile): Promise<void> {
    // Mark current as non-current, insert new version
    await this.db.schema('intelligence')
      .from('profiles')
      .update({ is_current: false })
      .eq('user_id', profile.userId)
      .eq('is_current', true);

    await this.db.schema('intelligence')
      .from('profiles')
      .insert(mapFromProfile(profile));
  }
}
```

Domain stores for `ProjectIntelligenceDomain`, `ArtifactIntelligenceDomain`, `RelationshipIntelligenceDomain`, `WorkspaceIntelligenceDomain`, and `KnowledgeIntelligenceDomain` follow the same pattern, each owning their entity reads/writes.

---

## 5. Learning Pipeline Implementation

The pipeline runs as background processing, invoked via the event bus. It is **never called synchronously** during artifact generation. Blueprint assembly reads from the already-processed store of Learnings.

```
FeedbackProcessor → SignalExtractor → ObservationBuilder → HypothesisEngine → LearningValidator → ProfileBuilder
```

### 5.1 — Signal Extractor

```typescript
// packages/intelligence-os/src/pipeline/SignalExtractor.ts

export class SignalExtractor {
  /**
   * Entry point for the pipeline.
   * Extracts 1–N Signals from a FeedbackEvent or any input event.
   * Enforces the quarantine gate.
   */
  async extractFromFeedbackEvent(
    event: FeedbackEvent,
    userId: string,
    projectId?: string
  ): Promise<Signal[]> {
    const rawSignals = this.parseRawSignals(event);
    const classified = rawSignals.map(s => this.classifyAndFlag(s, event));

    const { quarantined, valid } = this.applyQuarantineGate(classified);

    // Persist quarantined signals for audit but do not process
    await this.persistSignals([
      ...quarantined.map(s => ({ ...s, is_quarantined: true })),
      ...valid
    ]);

    return valid;
  }

  private applyQuarantineGate(signals: RawSignal[]): {
    quarantined: RawSignal[];
    valid: RawSignal[];
  } {
    return signals.reduce(
      (acc, signal) => {
        const hasQuarantineFlag = signal.context_flags.some(f =>
          ['role_play', 'hypothetical', 'emotional_state'].includes(f)
        );
        // Per contract: quarantine unless signal explicitly describes
        // the user's own persistent identity (explicit override)
        const hasExplicitOverride = signal.has_explicit_identity_declaration;

        if (hasQuarantineFlag && !hasExplicitOverride) {
          acc.quarantined.push(signal);
        } else {
          acc.valid.push(signal);
        }
        return acc;
      },
      { quarantined: [] as RawSignal[], valid: [] as RawSignal[] }
    );
  }
}
```

### 5.2 — Hypothesis Engine (Phase 1 Simplified)

Phase 1 implements only `PROVISIONAL`, `ACCUMULATING`, and `DISCARDED` states. `CHALLENGED`, `FLAGGED`, and `COMPETED` are deferred to Phase 2 per the contracts (Section J.3).

```typescript
// packages/intelligence-os/src/pipeline/HypothesisEngine.ts

export class HypothesisEngine {
  async processObservation(observation: Observation): Promise<void> {
    // Find existing hypothesis for same user + category + scope
    const existing = await this.findMatchingHypothesis(observation);

    if (!existing) {
      await this.createHypothesis(observation);
      return;
    }

    // Classify as corroborating or contradicting
    const classification = this.classifyObservation(observation, existing);

    if (classification === 'corroborating') {
      await this.corroborate(existing, observation);
    } else {
      // Phase 1: simplified contradiction handling (no CHALLENGED state)
      // Just decrement confidence; full CHALLENGED state in Phase 2
      await this.applyContradiction(existing, observation);
    }
  }

  private requiredCorroborationsFor(stabilityClass: StabilityClass): number {
    // Per Logical Schema B.11
    const thresholds: Record<StabilityClass, number> = {
      permanent:    2,
      long_term:    3,
      medium_term:  2,
    };
    return thresholds[stabilityClass];
  }

  private async createHypothesis(obs: Observation): Promise<void> {
    const required = this.requiredCorroborationsFor(obs.stabilityClass);
    const expiresAt = obs.stabilityClass === 'permanent'
      ? null
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.db.schema('intelligence').from('hypotheses').insert({
      user_id: obs.userId,
      taxonomy_category: obs.taxonomyCategory,
      stability_class: obs.stabilityClass,
      state: 'PROVISIONAL',
      confidence: obs.initialConfidenceEstimate,
      required_corroborations: required,
      current_corroborations: 1,
      proposition: obs.content,
      context_scope: obs.contextScope,
      expires_at: expiresAt,
    });
  }
}
```

### 5.3 — Correction Override Rule

The User Correction Override is a hard contract requirement. It bypasses the normal pipeline:

```typescript
// In LearningValidator.ts

async applyUserCorrection(
  correction: UserCorrectionEvent
): Promise<void> {
  // Per contract: user correction immediately sets Learning to CONFIRMED
  // bypassing corroboration threshold. This is sacred.
  const existing = await this.findLearning(
    correction.userId,
    correction.taxonomyCategory,
    correction.contextScope
  );

  if (existing) {
    await this.updateLearningState(existing.id, {
      state: 'CONFIRMED',
      confidence: 0.99,
      content: correction.correctedContent,
    });
  } else {
    await this.createConfirmedLearning(correction);
  }

  // Trigger immediate profile rebuild
  await this.eventBus.emit('intelligence.learning.confirmed', {
    userId: correction.userId,
    learningId: existing?.id ?? 'new',
    isCorrection: true,
  });
}
```

---

## 6. Blueprint Assembly System

Blueprint assembly is **synchronous** from BrandOS's perspective — it must complete before generation begins. Internally it fans out to domain stores in parallel where possible.

### 6.1 — BlueprintBuilder Orchestration

```typescript
// packages/intelligence-os/src/blueprint/BlueprintBuilder.ts

export class BlueprintBuilder {
  constructor(
    private userDomain:         UserIntelligenceDomain,
    private projectDomain:      ProjectIntelligenceDomain,
    private artifactDomain:     ArtifactIntelligenceDomain,
    private relationshipDomain: RelationshipIntelligenceDomain,
    private workspaceDomain:    WorkspaceIntelligenceDomain,
    private knowledgeDomain:    KnowledgeIntelligenceDomain,
    private conflictModel:      ConflictResolutionModel,
    private structurePlanner:   StructurePlanner,
    private narrativePlanner:   NarrativePlanner,
    private audienceCalibrator: AudienceCalibrator,
    private projectContextBuilder: ProjectContextBuilder,
  ) {}

  async build(request: ArtifactRequest): Promise<ArtifactBlueprint> {
    const { userId, workspaceId, artifactType, projectId, audienceRef } = request;

    // Stage 1: Load all domain intelligence in parallel
    const [
      profile,
      artifactPatterns,
      projectContext,
      audienceCalibration,
      knowledgeAssets,
      workspaceContext,
    ] = await Promise.all([
      this.userDomain.getCurrentProfile(userId),
      this.artifactDomain.getPatterns(userId, artifactType),
      projectId ? this.projectContextBuilder.build(projectId) : null,
      this.audienceCalibrator.calibrate(userId, audienceRef),
      this.knowledgeDomain.getRelevantAssets(userId, projectId, artifactType),
      workspaceId ? this.workspaceDomain.getContext(workspaceId) : null,
    ]);

    // Stage 2: Resolve conflicts before assembly
    const { resolutions, conflicts } = await this.conflictModel.resolve({
      profile,
      artifactPatterns,
      projectContext,
      audienceCalibration,
      workspaceContext,
      artifactType,
    });

    // Stage 3: Structure selection (universal → archetype → user-calibrated)
    const structure = await this.structurePlanner.plan({
      artifactType,
      patterns: artifactPatterns,
      profile,
      resolutions,
    });

    // Stage 4: Narrative design
    const narrative = await this.narrativePlanner.plan({
      profile,
      structure,
      projectContext,
      audienceCalibration,
      resolutions,
    });

    // Stage 5: Assemble the complete Blueprint
    const blueprint: ArtifactBlueprint = {
      id: crypto.randomUUID(),
      userId,
      artifactType,
      projectId: projectId ?? null,
      sections: structure.sections,
      narrativeFrame: narrative,
      depthSpec: this.resolveDepth(profile, artifactType, audienceCalibration),
      voiceDirectives: this.extractVoiceDirectives(profile),
      vocabularyDirectives: this.extractVocabularyDirectives(
        profile, projectContext, workspaceContext, knowledgeAssets
      ),
      audienceCalibration,
      complianceRequirements: workspaceContext?.complianceConstraints ?? [],
      conflictsDetected: conflicts,
      conflictsResolved: resolutions,
      intelligenceProfileVersion: profile?.version ?? 0,
      createdAt: new Date(),
    };

    // Persist blueprint for audit and feedback correlation
    await this.persistBlueprint(blueprint);

    return blueprint;
  }
}
```

### 6.2 — Conflict Resolution Model

```typescript
// packages/intelligence-os/src/blueprint/ConflictResolutionModel.ts

export class ConflictResolutionModel {
  /**
   * Applies the three structural rules from Logical Schema J.3:
   * 1. Scope Rule: most specific intelligence wins within its scope
   * 2. Recipient Rule: audience requirements override user style preferences
   * 3. Additive Rule: when non-conflicting, apply both (union, not replacement)
   *
   * And two governance rules:
   * 4. Transparency Rule: surface significant departures to user
   * 5. Immutability Rule: workspace compliance constraints are never overridden
   */
  async resolve(inputs: ConflictResolutionInputs): Promise<ConflictResolutionResult> {
    const conflicts: DetectedConflict[] = [];
    const resolutions: ConflictResolution[] = [];

    // Rule 5 first: compliance is immutable
    if (inputs.workspaceContext?.complianceConstraints?.length) {
      this.enforceComplianceImmutability(inputs, resolutions);
    }

    // Rule 2: Recipient overrides user style when audience has explicit requirements
    const audienceConflicts = this.detectAudienceStyleConflicts(inputs);
    for (const conflict of audienceConflicts) {
      conflicts.push(conflict);
      resolutions.push({
        conflictId: conflict.id,
        rule: 'RECIPIENT',
        winner: 'audience',
        departure: conflict.departure,
        transparency: conflict.departure.isSignificant
          ? this.buildTransparencyNote(conflict)
          : null,
      });
    }

    // Rule 1: Scope — user-calibrated beats archetype beats universal
    // (handled in StructurePlanner, not here)

    // Rule 3: Additive — remaining non-conflicting preferences applied together
    // (this is the default behavior when no conflict is detected)

    return { conflicts, resolutions };
  }
}
```

---

## 7. Event Contract — Integration Boundary

The event bus is the decoupling mechanism between BrandOS actions and Intelligence OS processing. BrandOS emits events; Intelligence OS listens and processes asynchronously.

### 7.1 — Event Bus Abstraction

```typescript
// packages/intelligence-os/src/events/IntelligenceEventBus.ts

export interface IntelligenceEventBus {
  emit<T extends IntelligenceEventType>(
    event: T,
    payload: IntelligenceEventPayload<T>
  ): Promise<void>;

  on<T extends IntelligenceEventType>(
    event: T,
    handler: (payload: IntelligenceEventPayload<T>) => Promise<void>
  ): void;
}

// In-process implementation for development and testing
export class InProcessEventBus implements IntelligenceEventBus {
  private handlers = new Map<string, Array<(p: unknown) => Promise<void>>>();

  async emit<T extends IntelligenceEventType>(
    event: T,
    payload: IntelligenceEventPayload<T>
  ): Promise<void> {
    const handlers = this.handlers.get(event) ?? [];
    // Fire and forget; errors logged, not thrown
    await Promise.allSettled(handlers.map(h => h(payload)));
  }

  on<T extends IntelligenceEventType>(
    event: T,
    handler: (payload: IntelligenceEventPayload<T>) => Promise<void>
  ): void {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, [...existing, handler as (p: unknown) => Promise<void>]);
  }
}

// BullMQ swap-in (for production):
// export class BullMQEventBus implements IntelligenceEventBus { ... }
// Inngest swap-in:
// export class InngestEventBus implements IntelligenceEventBus { ... }
```

### 7.2 — Intelligence Event Types

```typescript
// packages/intelligence-os/src/types/events.ts

export type IntelligenceEventType =
  // Emitted by BrandOS, consumed by Intelligence OS
  | 'brandos.artifact.feedback'
  | 'brandos.knowledge_asset.uploaded'
  | 'brandos.project.created'
  | 'brandos.project.updated'
  | 'brandos.user.correction'
  // Emitted by Intelligence OS pipeline (internal + observable)
  | 'intelligence.signal.extracted'
  | 'intelligence.hypothesis.created'
  | 'intelligence.hypothesis.promoted'
  | 'intelligence.learning.validated'
  | 'intelligence.learning.confirmed'
  | 'intelligence.profile.updated'
  | 'intelligence.blueprint.built'
  | 'intelligence.conflict.detected'
  | 'intelligence.conflict.recurring';

export type IntelligenceEventPayload<T extends IntelligenceEventType> =
  T extends 'brandos.artifact.feedback'        ? FeedbackEventPayload :
  T extends 'brandos.knowledge_asset.uploaded' ? KnowledgeAssetPayload :
  T extends 'brandos.project.created'          ? ProjectPayload :
  T extends 'brandos.user.correction'          ? UserCorrectionPayload :
  T extends 'intelligence.profile.updated'     ? ProfileUpdatedPayload :
  T extends 'intelligence.conflict.recurring'  ? RecurringConflictPayload :
  BaseEventPayload;
```

---

## 8. TypeScript Contracts

These are the types shared between `intelligence-os` and BrandOS via the `shared-intelligence-types` package.

```typescript
// packages/shared-intelligence-types/src/ArtifactRequest.ts

export interface ArtifactRequest {
  userId:       string;
  workspaceId?: string;
  projectId?:   string;
  artifactType: ArtifactType;
  audienceRef?: AudienceReference;
  // Contextual hints BrandOS can provide; Intelligence OS uses
  // these as context but does not blindly trust them
  hints?: {
    urgency?: 'high' | 'standard';
    recipientName?: string;
    topicOverride?: string;
  };
}

export type ArtifactType =
  | 'board_update'
  | 'strategy_document'
  | 'architecture_proposal'
  | 'research_paper'
  | 'product_roadmap'
  | 'investor_update'
  | 'linkedin_post'
  | string; // extensible for custom artifact types

export interface AudienceReference {
  // Named relationship (highest specificity)
  relationshipId?: string;
  // Generic audience type (fallback)
  audienceType?: 'board' | 'investor' | 'engineering' | 'customer' | 'general';
}
```

```typescript
// packages/shared-intelligence-types/src/ArtifactBlueprint.ts

export interface ArtifactBlueprint {
  id:            string;
  userId:        string;
  artifactType:  ArtifactType;
  projectId:     string | null;
  sections:      BlueprintSection[];
  narrativeFrame: NarrativeFrame;
  depthSpec:     DepthSpecification;
  voiceDirectives: VoiceDirectives;
  vocabularyDirectives: VocabularyDirectives;
  audienceCalibration: AudienceCalibration;
  complianceRequirements: ComplianceRequirement[];
  conflictsDetected: DetectedConflict[];
  conflictsResolved: ConflictResolution[];
  intelligenceProfileVersion: number;
  createdAt:     Date;
}

export interface BlueprintSection {
  id:           string;
  title:        string;
  purpose:      string;
  depthLevel:   'summary' | 'standard' | 'deep';
  wordCountMin?: number;
  wordCountMax?: number;
  subsections?: BlueprintSection[];
  evidenceType?: 'data' | 'narrative' | 'example' | 'mixed';
}

export interface VoiceDirectives {
  register:     'formal' | 'professional' | 'conversational' | 'technical';
  tone:         string[];          // ['authoritative', 'concise', 'data-led']
  sentenceRhythm: 'short' | 'mixed' | 'long';
  paragraphStyle: 'dense' | 'airy';
  avoidPatterns: string[];         // known rejection vocabulary
}

export interface VocabularyDirectives {
  preferredTerms:  Record<string, string>;  // 'growth metric' → 'net revenue retention'
  forbiddenTerms:  string[];
  domainJargon:    string[];                // expected industry vocabulary
  proprietaryTerms: string[];              // from Knowledge Assets
}
```

```typescript
// packages/shared-intelligence-types/src/FeedbackEvent.ts

export interface FeedbackEvent {
  userId:       string;
  artifactId:   string;
  artifactType: ArtifactType;
  projectId?:   string;
  blueprintId?: string;            // correlates feedback to the blueprint used
  eventType:    FeedbackEventType;
  editDiff?:    EditDiff;
  explicitReason?: string;
}

export type FeedbackEventType =
  | 'accepted'          // used without edits
  | 'edited'            // used after making changes
  | 'rejected'          // not used
  | 'deployed'          // sent/published externally (highest signal)
  | 'explicit_feedback'; // user provided direct feedback text

export interface EditDiff {
  sectionsAdded:   string[];
  sectionsRemoved: string[];
  sectionsReordered: boolean;
  lengthDelta:     number;      // positive = made longer, negative = shorter
  vocabularyChanges: VocabularyChange[];
  toneShift?:      'more_formal' | 'more_casual' | 'more_authoritative' | 'other';
}
```

---

## 9. Phase 1 Implementation Plan

Phase 1 delivers the GTM-ready minimum viable contract set. Every item here maps to a specific contract in the authority documents.

### Sprint 0 — Foundation (Week 1–2)

| Task | Contract Reference | Output |
|---|---|---|
| Set up `intelligence-os` package in monorepo | — | Package scaffolded, TS config, test runner |
| Create Postgres schema migration | Section 3 (this doc) | `schema.sql` applied to Supabase dev instance |
| Seed Universal Artifact Patterns (5 types) | Contracts A.2 (Curation-Originated) | `artifact_patterns` rows at `pattern_level: universal` |
| Implement `IntelligenceEventBus` + `InProcessEventBus` | Section 7 (this doc) | Event bus testable in isolation |
| Implement domain store classes (read-only first) | Section 4 (this doc) | All 6 domain stores, read paths only |
| Write integration harness | — | Test scaffold with mock `user_id` |

### Sprint 1 — Blueprint Assembly (Week 3–4)

| Task | Contract Reference | Output |
|---|---|---|
| `StructurePlanner` — universal pattern lookup | Contracts C.2, I Component: Structure Planner | Pattern loaded and applied in blueprint |
| `AudienceCalibrator` — generic profiles only (Phase 1) | Contracts C.2, I Component: Audience Calibrator | Generic audience calibration working |
| `ProjectContextBuilder` — basic project package | Contracts A.2, I Component: Project Context Builder | Project goals + vocabulary injected |
| `BlueprintBuilder` — Phase 1 assembly (no Narrative Planner yet) | Contracts G.2, I Component: Blueprint Builder | `buildBlueprint()` returns valid Blueprint |
| `ConflictResolutionModel` — Phase 1 rules only | Contracts I Component: Conflict Resolution, J.2 | Compliance immutability + Recipient Rule working |
| `IntelligenceOS.buildBlueprint()` public API | Section 2.1 (this doc) | API complete and testable |

### Sprint 2 — Learning Pipeline (Week 5–6)

| Task | Contract Reference | Output |
|---|---|---|
| `FeedbackProcessor` | Contracts A.2, I Component: Feedback Processor | Feedback events parsed into delta types |
| `SignalExtractor` + quarantine gate | Contracts B.2, I Component: Signal Extractor | Signals extracted; quarantine enforced |
| `ObservationBuilder` + confidence ceiling | Contracts B.2, I Component: Observation Builder | Observations with correct confidence caps |
| `HypothesisEngine` — Phase 1 simplified states | Contracts B.2, J.2 | PROVISIONAL/ACCUMULATING/DISCARDED working |
| `LearningValidator` + correction override | Contracts B.2, I Component: Learning Validator | Learnings promoted; corrections applied immediately |
| `ProfileBuilder` — Phase 1 dimensions | Contracts I Component: Profile Builder | Profile rebuilt on Learning changes |
| `IntelligenceOS.recordFeedbackEvent()` public API | Section 2.1 (this doc) | Full feedback loop operational end-to-end |

### Sprint 3 — Onboarding Intelligence (Week 7–8)

| Task | Contract Reference | Output |
|---|---|---|
| `IntelligenceOS.ingestKnowledgeAsset()` | Contracts A.2, B.3 (Knowledge Asset) | Assets persisted; vocabulary extracted |
| Onboarding signal extraction (writing samples, explicit goals, archetype) | Taxonomy Section I.3 (GTM Intelligence Stack) | Profile seeded from session 1 |
| `NarrativePlanner` — Phase 1 implementation | Contracts I Component: Narrative Planner | Narrative frame included in Blueprint |
| User-Calibrated pattern formation (≥2 accepted exemplars) | Contracts A.2, H.2 | Pattern upgrade working |
| Exemplar promotion (deployed artifacts) | Contracts H.5, A.2 | Exemplars persisted on deploy events |
| End-to-end integration test with mock BrandOS | — | Full loop verified: request → blueprint → feedback → improved profile |

### Sprint 4 — BrandOS Integration (Week 9–10)

| Task | Output |
|---|---|
| Add `buildBlueprint()` call to BrandOS artifact generation entry point | Blueprint injected into generation |
| Add `recordFeedbackEvent()` call to BrandOS artifact delivery/feedback handlers | Feedback loop connected |
| Map existing BrandOS artifact types to Intelligence OS `ArtifactType` | Type alignment verified |
| Connect BrandOS `user_id` to Intelligence OS profile anchor | User identity verified |
| QA pass: verify Blueprint is correctly consumed by existing generation runtime | End-to-end output quality verified |
| Seed initial Universal Artifact Patterns in production Supabase | GTM patterns active |

---

## 10. BrandOS Integration Guide

This section is addressed to the BrandOS engineer performing the integration. Intelligence OS is a drop-in addition, not a replacement of any existing component.

### 10.1 — Installation

```bash
# In the monorepo root
pnpm add @brandos/intelligence-os @brandos/shared-intelligence-types
```

### 10.2 — Initialization

```typescript
// In your BrandOS server/app initialization

import { IntelligenceOS } from '@brandos/intelligence-os';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Intelligence OS needs service role
);

export const intelligence = new IntelligenceOS({
  supabase,
  eventBus: new InProcessEventBus(), // swap for BullMQEventBus in production
});
```

### 10.3 — Artifact Generation Integration

Find the existing BrandOS function that handles an artifact generation request. Add one call before generation:

```typescript
// In your existing artifact generation handler

async function generateArtifact(request: BrandOSArtifactRequest) {
  // ── NEW: Intelligence OS blueprint injection ──────────────
  const blueprint = await intelligence.buildBlueprint({
    userId:       request.userId,
    workspaceId:  request.workspaceId,
    projectId:    request.projectId,
    artifactType: request.artifactType,
    audienceRef:  request.audienceRef,
  });
  // ─────────────────────────────────────────────────────────

  // Pass blueprint to your existing generation runtime.
  // The blueprint provides structure, voice directives, and
  // vocabulary directives that the generation prompt should use.
  const artifact = await existingGenerationRuntime.generate({
    ...request,
    blueprint, // ← inject here
  });

  return artifact;
}
```

### 10.4 — Feedback Integration

Find the existing BrandOS function that handles user feedback on artifacts:

```typescript
// In your existing artifact feedback handler

async function handleArtifactFeedback(event: BrandOSFeedbackEvent) {
  // ── NEW: Intelligence OS feedback ingestion ───────────────
  // Fire and forget — does not block the response
  intelligence.recordFeedbackEvent({
    userId:       event.userId,
    artifactId:   event.artifactId,
    artifactType: event.artifactType,
    projectId:    event.projectId,
    blueprintId:  event.blueprintId,
    eventType:    event.type, // map to 'accepted'|'edited'|'rejected'|'deployed'
    editDiff:     event.diff,
  }).catch(err => logger.error('Intelligence feedback ingestion failed', err));
  // ─────────────────────────────────────────────────────────

  // Continue with existing feedback handling
  await existingFeedbackHandler(event);
}
```

### 10.5 — Generation Runtime: Consuming the Blueprint

The Blueprint is not a prompt — it is a structured specification that your prompt construction layer translates into generation instructions. The minimum integration is:

```typescript
function blueprintToPromptContext(blueprint: ArtifactBlueprint): string {
  return `
STRUCTURE:
${blueprint.sections.map(s =>
  `- ${s.title} (${s.depthLevel}, ~${s.wordCountMin}–${s.wordCountMax} words)`
).join('\n')}

VOICE:
Register: ${blueprint.voiceDirectives.register}
Tone: ${blueprint.voiceDirectives.tone.join(', ')}
Avoid: ${blueprint.voiceDirectives.avoidPatterns.join(', ')}

VOCABULARY:
Preferred: ${Object.entries(blueprint.vocabularyDirectives.preferredTerms)
  .map(([k, v]) => `"${k}" → "${v}"`).join(', ')}
Domain terms to use: ${blueprint.vocabularyDirectives.domainJargon.join(', ')}

AUDIENCE:
${blueprint.audienceCalibration.expertiseLevel} expertise
Communication norms: ${blueprint.audienceCalibration.communicationNorms}

NARRATIVE:
Opening: ${blueprint.narrativeFrame.opening}
Argument: ${blueprint.narrativeFrame.argumentStructure}
`.trim();
}
```

---

## 11. Testing Strategy

### 11.1 — Unit Tests (isolated pipeline components)

Each pipeline component is tested in isolation with mock database clients. Key test cases per contract:

```typescript
// Signal quarantine gate
test('quarantines signals with role_play context flag', ...)
test('does not quarantine explicit identity declarations even with role_play flag', ...)

// Hypothesis corroboration thresholds
test('requires 3 corroborations for long_term stability class', ...)
test('discards provisional hypothesis after 30 days without corroboration', ...)

// User correction override
test('immediately sets learning to CONFIRMED without corroboration threshold', ...)
test('correction bypasses all pipeline stages', ...)

// Conflict resolution
test('workspace compliance constraint cannot be overridden by any domain', ...)
test('recipient rule applies when audience has explicit depth requirement', ...)
test('additive rule applies when no conflict detected', ...)
```

### 11.2 — Integration Tests (full pipeline loop)

```typescript
// Full loop: feedback event → signal → observation → hypothesis → learning → profile
test('accepted artifact reinforces artifact pattern confidence', ...)
test('deployed artifact promotes to exemplar and triggers maximum reinforcement', ...)
test('3 consistent structural edits update user-calibrated artifact pattern', ...)
test('rejected artifact does not recalibrate model on single occurrence', ...)
test('2 consistent rejections on same dimension trigger model review event', ...)
```

### 11.3 — Blueprint Assembly Tests

```typescript
// Pattern hierarchy
test('user-calibrated pattern takes precedence over universal when available', ...)
test('universal pattern used when no user-calibrated pattern exists', ...)

// Composition per artifact type (per Contracts Section D)
test('board_update blueprint: relationship intelligence in priority slot 1', ...)
test('linkedin_post blueprint: user voice is dominant domain', ...)
test('investor_update: recipient rule applies when investor concerns conflict with positive framing', ...)
```

### 11.4 — Performance Targets

| Operation | Target | Rationale |
|---|---|---|
| `buildBlueprint()` | < 200ms p95 | Synchronous path; blocks generation |
| `recordFeedbackEvent()` | < 50ms (API call; async processing) | User-facing action |
| Pipeline processing (Signal → Profile update) | < 30s | Background; no user waits |
| Profile rebuild | < 5s | Background; triggered on significant Learning changes |

---

## Summary: What This Architecture Delivers

| What | How |
|---|---|
| **Fully independent development** | Intelligence OS has no runtime dependency on BrandOS. It requires only a `user_id` reference and a Supabase client. |
| **Two-call BrandOS integration** | `buildBlueprint()` before generation, `recordFeedbackEvent()` after delivery. No other BrandOS changes required. |
| **TypeScript monorepo fit** | Structured as a standard monorepo package with shared types extracted to a separate package BrandOS can import without pulling in Intelligence OS internals. |
| **Supabase/Postgres native** | Schema lives in a dedicated `intelligence` schema within the existing Supabase project. RLS applied. No new database. |
| **Event-driven with a fallback** | `InProcessEventBus` works without infrastructure. Swap to BullMQ or Inngest when ready with no interface changes. |
| **Phase 1 first, no premature complexity** | Simplified Hypothesis Engine (no `CHALLENGED` state), no cross-user aggregation, no Relationship or Workspace domain active. All Phase 2+ capabilities are stubbed as no-ops that return defaults — the integration does not change when they activate. |
| **Contract-faithful implementation** | Every component maps 1:1 to the runtime components in Contracts Section I. Every validation rule is implemented as stated in Contracts Section B. |

---

*Intelligence OS Architecture · Engineering Design Document*  
*Derived from: BrandOS Learning Taxonomy v1.0 · BrandOS Intelligence Architecture v1.0 · BrandOS Logical Intelligence Schema v1.0 · BrandOS Intelligence Contracts v1.0*  
*Intended path: `docs/architecture/intelligence/IntelligenceOS_Architecture.md`*
