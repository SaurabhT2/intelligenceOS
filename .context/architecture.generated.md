# IntelligenceOS Architecture

> **Generated file — do not edit by hand.** Produced by `scripts/context/`. Re-run `pnpm context:generate` (or `pnpm context:refresh`) to regenerate. See `READMEFIRST.md` at the repo root before using this file.

This is the single consolidated architecture document for IntelligenceOS — every narrative artifact this framework produces, merged into one file so an agent (or a human) reads one document instead of thirty. The single canonical machine-readable companion is `architecture.generated.json`. Both regenerate on every build (`pnpm build` runs `pnpm context:generate` first) and are reproducible: re-running with no source changes produces byte-identical output.

## Table of contents

- [Monorepo Context](#monorepo-context)
- [Agent Entrypoints](#agent-entrypoints)
- [Architecture Knowledge Graph — Overview](#architecture-knowledge-graph-overview)
- [Cognition Pipeline](#cognition-pipeline)
- [Learning Pipeline](#learning-pipeline)
- [Knowledge Pipeline](#knowledge-pipeline)
- [Identity Pipeline](#identity-pipeline)
- [Pipeline Stage Sequencing (graph-derived)](#pipeline-stage-sequencing-graph-derived)
- [Context Builder](#context-builder)
- [Profile Model](#profile-model)
- [Domain Ownership](#domain-ownership)
- [Database Context](#database-context)
- [Event Bus](#event-bus)
- [API Contract](#api-contract)
- [Runtime Model](#runtime-model)
- [Execution Paths](#execution-paths)
- [Information Flow](#information-flow)
- [Repository Health](#repository-health)

## Monorepo Context

### What this repository is

IntelligenceOS is a deterministic user-intelligence layer and artifact-blueprint engine, published as an independently consumable platform SDK (see `packages/intelligence-os/package.json` description). It is consumed over HTTP by external platforms (e.g. BrandOS) via `@platform/cognition-contract`, and directly as a library by `apps/demo` and `apps/playground`.

### Package / app inventory

| Package | Version | Dir | Dependencies (workspace + external) | Description |
|---|---|---|---|---|
| `@intelligence-os/api` | 0.1.0 | `apps/api` | @intelligence-os/core, @supabase/supabase-js | Deployable runtime for IntelligenceOS. Owns environment loading, dependency composition, and HTTP hosting only — all IntelligenceOS business logic lives in @intelligence-os/core. See docs/adr/ADR-002-apps-runtime-layer.md. |
| `@intelligence-os/demo` | 0.1.0 | `apps/demo` | @platform/cognition-contract | Minimal integration-validation client proving IntelligenceOS can be consumed independently of BrandOS, purely over HTTP. Not a production UI. |
| `@intelligence-os/playground` | 0.1.0 | `apps/playground` | @intelligence-os/core | Scaffold for a future interactive IntelligenceOS developer playground. Not yet a functioning application — see README.md. |
| `@platform/cognition-contract` | 1.1.0 | `packages/cognition-contract` | _(none)_ | Zero-dependency cross-platform system contract between BrandOS (Execution Platform) and IntelligenceOS (Cognitive Platform). Types only — no runtime logic. This is the IntelligenceOS-repo copy; see README.md for the physical-duplication rule this package operates under. |
| `@intelligence-os/core` | 0.5.0 | `packages/intelligence-os` | @intelligence-os/shared-types, @platform/cognition-contract, @supabase/supabase-js | Intelligence OS — a deterministic user-intelligence layer and artifact-blueprint engine, published as an independently consumable platform SDK. |
| `@intelligence-os/shared-types` | 0.2.0 | `packages/shared-intelligence-types` | _(none)_ | Contract types for Intelligence OS — the request/response/event DTOs any consumer needs to call Intelligence OS and interpret its results. Zero runtime dependencies. |

### Per-package file counts (source of truth: live file tree)

| Package | .ts files parsed | Classes | Interfaces | Exported functions |
|---|---|---|---|---|
| `@intelligence-os/api` | 2 | 0 | 0 | 0 |
| `@intelligence-os/demo` | 1 | 0 | 0 | 0 |
| `@intelligence-os/playground` | 1 | 0 | 0 | 0 |
| `@platform/cognition-contract` | 3 | 0 | 14 | 1 |
| `@intelligence-os/core` | 59 | 41 | 71 | 26 |
| `@intelligence-os/shared-types` | 5 | 0 | 16 | 0 |

### Workspace scripts (root `package.json`)

```json
{
  "build": "pnpm context:generate && pnpm -r build",
  "typecheck": "pnpm -r typecheck",
  "test": "pnpm -r test",
  "test:coverage": "pnpm -r test:coverage",
  "lint": "eslint .",
  "validate": "pnpm -r typecheck && pnpm --filter @intelligence-os/core check:boundaries && pnpm lint",
  "dev:api": "pnpm --filter @intelligence-os/api dev",
  "demo": "pnpm --filter @intelligence-os/demo start",
  "clean": "pnpm -r clean",
  "context:generate": "node scripts/context/generate-consolidated.mjs",
  "context:refresh": "node scripts/context/generate-consolidated.mjs",
  "context:check": "node scripts/context/generate-consolidated.mjs && git diff --exit-code .context",
  "trace": "node scripts/context/trace.mjs",
  "impact": "node scripts/context/impact.mjs"
}
```

### Directory shape of `packages/intelligence-os/src` (the core engine)

```
(root)/  (4 files)
api/  (4 files)
blueprint/  (10 files)
compat/  (1 file)
context/  (5 files)
domains/  (7 files)
events/  (2 files)
knowledge/  (10 files)
pipeline/  (9 files)
types/  (5 files)
utils/  (1 file)
```

Each of these subdirectories except `types/`, `db/`, and `utils/` carries its own `AGENT_CONTEXT.md` hand-authored companion — this generated corpus cross-references those but is derived independently from source, per the mission's "documentation is secondary, implementation is the source of truth" directive.

### Where to go next

- `.context/architecture_graph.generated.json` — the full module dependency graph.
- `.context/cognition_pipeline.generated.md` — the end-to-end request pipeline.
- `.context/learning_pipeline.generated.md` — the learning lifecycle.
- `.context/knowledge_pipeline.generated.md` — the knowledge ingestion lifecycle.
- `.context/identity_pipeline.generated.md` — identity derivation.
- `.context/domain_ownership.generated.md` — table ownership map.
- `.context/repository_health.generated.md` — automatically detected issues.
- `READMEFIRST.md` (repo root) — read this first, before this file.

## Agent Entrypoints

Two complementary views: fixed process/API entrypoints (how a request or process enters the system) and graph-centrality ranking (which *source files*, if you had to read only a handful, carry the most load-bearing knowledge — measured by in-repo importer count).

### Fixed entrypoints

| Entry | File |
|---|---|
| Library root export | `packages/intelligence-os/src/index.ts` |
| The one class a consumer constructs | `packages/intelligence-os/src/IntelligenceOS.ts` |
| Consumer-facing interface contract | `packages/intelligence-os/src/IIntelligenceProvider.ts` |
| HTTP routing (shared by both process hosts) | `packages/intelligence-os/src/api/http/server.ts` |
| Traditional process entrypoint | `apps/api/src/server.ts` |
| Vercel Function entrypoint | `apps/api/api/cognition.ts` |
| CognitionProvider implementation (workspace-scoped) | `packages/intelligence-os/src/api/CognitionProviderImpl.ts` |
| Terminal context assembler | `packages/intelligence-os/src/context/ContextBuilder.ts` |

### Top 15 files by in-repo importer count (read these first)

| Rank | File | Importer count | Summary |
|---|---|---|---|
| 1 | `packages/intelligence-os/src/types/entities.ts` | 31 | TypeScript shapes for the entities Intelligence OS persists or operates on. |
| 2 | `packages/intelligence-os/src/types/domains.ts` | 16 | DomainType and domain-specific input / filter types. |
| 3 | `packages/intelligence-os/src/types/subject.ts` | 13 | ADR-003 (Subject-Centric Intelligence): the `Subject` reference and its small set of pure helpers. |
| 4 | `packages/intelligence-os/src/knowledge/types.ts` | 12 | Internal types for the Sprint 3 Knowledge Intelligence pipeline. |
| 5 | `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts` | 11 | Owns: intelligence.profiles, intelligence.learnings, intelligence.archetypes, intelligence.hypotheses No other domain may write to these tables. |
| 6 | `packages/intelligence-os/src/errors.ts` | 10 | Typed error hierarchy for Intelligence OS. |
| 7 | `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts` | 7 | Owns: intelligence.knowledge_assets No other domain may write to this table. |
| 8 | `packages/intelligence-os/src/events/IntelligenceEventBus.ts` | 7 | Event bus abstraction and default in-process implementation. |
| 9 | `packages/intelligence-os/src/pipeline/types.ts` | 7 | Internal types for the Sprint 2 Learning Pipeline. |
| 10 | `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts` | 6 | Owns: intelligence.artifact_patterns, intelligence.artifact_exemplars, intelligence.feedback_events, intelligence.artifact_blueprints No other domain may write to these tables. |
| 11 | `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts` | 6 | Owns: workspace-scoped intelligence (compliance constraints, shared vocabulary). |
| 12 | `packages/intelligence-os/src/types/events.ts` | 5 | Intelligence OS event type union and the seven distinct payload contracts. |
| 13 | `packages/intelligence-os/src/api/HealthChecker.ts` | 4 | Milestone 2 (CognitionProvider integration layer). |
| 14 | `packages/intelligence-os/src/blueprint/internal/defaults.ts` | 4 | System-wide constants and defaults for Blueprint Assembly. |
| 15 | `packages/intelligence-os/src/blueprint/ProjectContextBuilder.ts` | 4 | Assembles all project-scoped intelligence needed by BlueprintBuilder. |

### Reading order for common tasks

- **Architecture review:** `.context/monorepo_context.generated.md` → `.context/architecture_graph.generated.json` → `.context/domain_ownership.generated.md`.
- **Debugging a specific bug report:** `.context/dependency_impact.generated.json` (find the file, read its `directDependents`) → `.context/behavior_contracts.generated.json` (is the method real or a stub?) → the source file itself.
- **Implementing a new feature end-to-end:** `.context/cognition_pipeline.generated.md` for the request lifecycle → the specific pipeline doc (`learning_pipeline`, `knowledge_pipeline`, `identity_pipeline`) → `.context/api_contract.generated.md` for where to wire a new route/method.
- **Forensic runtime investigation ("why did X happen for this user"):** `.context/event_bus.generated.md` (what fired) → `.context/domain_ownership.generated.md` (what got written) → `.context/profile_model.generated.md` (how the profile changed).

## Architecture Knowledge Graph — Overview

This section documents the Architecture Knowledge Graph itself — the intermediate model every other section of `architecture.generated.md`, and every section of `architecture.generated.json`, is a projection of. The graph (`knowledgeGraph` in the JSON file) is nodes + edges built from the same source extraction the rest of this document uses (imports, classes/methods, table access, event-bus calls, HTTP routes), so that "who owns this table," "what breaks if this class changes," and "where did this field originate" are graph queries (see `pnpm trace` / `pnpm impact` below) rather than re-derived by hand each time.

### Graph summary

- **Nodes:** 447
- **Edges:** 730

| Node type | Count |
|---|---|
| Class | 36 |
| ContextField | 11 |
| Domain | 6 |
| Event | 15 |
| Function | 4 |
| HttpApi | 9 |
| Interface | 101 |
| Method | 155 |
| Module | 71 |
| Package | 6 |
| ProfileField | 20 |
| Repository | 1 |
| Table | 12 |

| Edge type | Count | Meaning |
|---|---|---|
| BUILDS | 31 | ContextBuilder.build() / ProfileBuilder.rebuildForSubject() → a field of the object they assemble |
| CALLS | 85 | HTTP route → handler method, or method → method resolved via constructor-injected field types |
| CONSUMES | 4 | a `.bus.on(event)` call site |
| CONTRIBUTES_TO | 21 | a function or Profile field whose value flows into a CognitionContext field |
| DEPENDS_ON | 224 | module A imports module B (intra-repo relative imports only) |
| EMITS | 13 | a `.bus.emit(event)` call site |
| IMPLEMENTS | 6 | class implements interface |
| OWNS | 12 | Domain class is the sole authorized writer of a table (declared "Owns:" docblock) |
| PERSISTS | 16 | alias of WRITES, scoped to Domain classes — the durable-storage relationship specifically |
| READS | 20 | a `.schema().from(table).select()` call site |
| SYNTHESIZES | 9 | a pure derivation function that computes a context field from Learnings (subset of CONTRIBUTES_TO, called out separately since "synthesis" is architecturally distinct from a passthrough) |
| USES | 273 | generic structural containment (class is-defined-in module, method is-member-of class, package is-member-of repo) |
| WRITES | 16 | a `.schema().from(table).insert/update/upsert/delete()` call site |

### Edge types reserved but not yet populated

The mission specification also names `RETURNS`, `REBUILDS`, `USES` (as a semantic rather than structural relation), and `REFERENCES` as edge types. `RETURNS` is redundant with the `returnType` already carried in every `Method` node's metadata rather than materialized as edges (materializing one edge per return-type reference would roughly double edge count for information already on the node). `REBUILDS` is discoverable today via `EMITS`/`CONSUMES` on `intelligence.profile.updated` plus `BUILDS` from `ProfileBuilder.rebuildForSubject`, without needing a separate edge type. Both are left as documented gaps rather than populated with a fabricated edge, per this framework's standing rule: derive from source, or say the derivation wasn't attempted.

### Consolidation history

This framework was built in three passes. Pass 1 generated 18 markdown + 8 JSON documents directly from source. Pass 2 added this Architecture Knowledge Graph plus 13 more documents projected from it — at which point several Pass-1 and Pass-2 documents covered the same ground twice (domain ownership, database access, event wiring, API routes, runtime shape, knowledge/identity subsystems, and context/profile fields each had a narrative doc *and* a graph-relationship doc). Pass 3 consolidated all of it into the two files this section lives in — `architecture.generated.md` and `architecture.generated.json` — merging each duplicated pair into one narrative section with the graph ledger nested as a subsection, and folding every JSON artifact into one sectioned file. No extraction logic changed across any of the three passes; only how the same underlying facts are packaged for a reader changed.

### Files (now two, plus the refresh manifest)

- `architecture.generated.md — every narrative section, this one included, in one file with a table of contents.`
- `architecture.generated.json — every graph/JSON artifact (`knowledgeGraph`, `fileLevelGraph`, `dependencyImpact`, `behaviorContracts`, `topicGraphs`), sectioned by key, in one file.`
- `context_refresh_summary.generated.md — kept separate deliberately: the small, high-signal "did anything change" manifest (repository fingerprint + counts + known gaps) shouldn't be buried inside either of the two large files above.`

### How to query the graph yourself

```bash
pnpm trace knowledge      # prints the Knowledge pipeline execution chain
pnpm trace identity       # prints the Identity pipeline execution chain
pnpm trace workspace      # prints the Workspace-configuration chain
pnpm impact ProfileBuilder   # impact analysis for a class name
pnpm impact ContextBuilder
```

Or load `architecture.generated.json`'s `knowledgeGraph` key directly and traverse it — see `scripts/context/lib/graph.mjs`'s `bfsPath()` / `reachable()` for the same traversal primitives the CLIs use.

## Cognition Pipeline

The end-to-end request pipeline exposed over HTTP: Explain, Resolve Context, Observe, Review, Knowledge Ingest, Correction, Workspace Configuration. All routes are hosted by `packages/intelligence-os/src/api/http/server.ts` — see `.context/api_contract.generated.md` for the full route table.

### Stages

#### Explain

`summarizeCognition(workspaceId)` — `GET /v1/cognition/summary`. Explains the current state of a workspace's cognition (a human/agent-readable summary), distinct from `resolveCognitionContext` which returns the machine-consumed context.

- **File:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer).
- **Class:** `CognitionProviderImpl`
  - **Methods:**
    - `async resolveCognitionContext(request: CognitionRequest): Promise<CognitionContext>` — Delegates entirely to `context/ContextBuilder` (new — Milestone 2), which composes `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` (existing, unmodified).
    - `async observe(input: ObservationInput): Promise<void>` — ADR-003 (Subject-Centric Intelligence) — routes every observation through the same Learning Pipeline (`SignalExtractor` → `ObservationBuilder` → `HypothesisEngine` → `LearningValidator` → `ProfileBuilder`) a User subject's `FeedbackEvent` already runs through, via `FeedbackProcessor.processObservation()`.
    - `async review(decision: CognitionReviewDecision): Promise<void>` — Delegates to `UserIntelligenceDomain.reviewLearningForWorkspace` (new — Milestone 2), which reuses the exact fetch-and-transition logic `reviewLearning` already had (extracted, not duplicated), gated on `workspace_id` instead of `user_id` since `CognitionReviewDecision` has no userId either.
    - `async summarizeCognition(workspaceId: string): Promise<CognitionSummary>` — Composed from the same `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` call `resolveCognitionContext` uses — no new DB access, just a different projection of the same already-consolidated data, matching the contract's description of `summarizeCognition` as "distinct...
    - `async checkHealth(): Promise<CognitionHealth>` — Delegates to `HealthChecker` (new — Milestone 2, thin).
- **Depends on (intra-repo):** `packages/intelligence-os/src/api/HealthChecker.ts`, `packages/intelligence-os/src/context/ContextBuilder.ts`, `packages/intelligence-os/src/context/voiceMapping.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/errors.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`
- **Called from:** `packages/intelligence-os/src/IntelligenceOS.ts`, `packages/intelligence-os/src/api/index.ts`, `packages/intelligence-os/src/index.ts`

#### Resolve Context

`resolveCognitionContext(request)` — `POST /v1/cognition/resolve`. The main request path: resolves a `CognitionRequest` down to a full `CognitionContext` via `ContextBuilder`.

- **File:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer).
- **Class:** `CognitionProviderImpl`
  - **Methods:**
    - `async resolveCognitionContext(request: CognitionRequest): Promise<CognitionContext>` — Delegates entirely to `context/ContextBuilder` (new — Milestone 2), which composes `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` (existing, unmodified).
    - `async observe(input: ObservationInput): Promise<void>` — ADR-003 (Subject-Centric Intelligence) — routes every observation through the same Learning Pipeline (`SignalExtractor` → `ObservationBuilder` → `HypothesisEngine` → `LearningValidator` → `ProfileBuilder`) a User subject's `FeedbackEvent` already runs through, via `FeedbackProcessor.processObservation()`.
    - `async review(decision: CognitionReviewDecision): Promise<void>` — Delegates to `UserIntelligenceDomain.reviewLearningForWorkspace` (new — Milestone 2), which reuses the exact fetch-and-transition logic `reviewLearning` already had (extracted, not duplicated), gated on `workspace_id` instead of `user_id` since `CognitionReviewDecision` has no userId either.
    - `async summarizeCognition(workspaceId: string): Promise<CognitionSummary>` — Composed from the same `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` call `resolveCognitionContext` uses — no new DB access, just a different projection of the same already-consolidated data, matching the contract's description of `summarizeCognition` as "distinct...
    - `async checkHealth(): Promise<CognitionHealth>` — Delegates to `HealthChecker` (new — Milestone 2, thin).
- **Depends on (intra-repo):** `packages/intelligence-os/src/api/HealthChecker.ts`, `packages/intelligence-os/src/context/ContextBuilder.ts`, `packages/intelligence-os/src/context/voiceMapping.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/errors.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`
- **Called from:** `packages/intelligence-os/src/IntelligenceOS.ts`, `packages/intelligence-os/src/api/index.ts`, `packages/intelligence-os/src/index.ts`

#### Observe

`observe(input)` — `POST /v1/cognition/observe`. Entry point into the Learning Pipeline's Observation stage for workspace-scoped subjects.

- **File:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer).
- **Class:** `CognitionProviderImpl`
  - **Methods:**
    - `async resolveCognitionContext(request: CognitionRequest): Promise<CognitionContext>` — Delegates entirely to `context/ContextBuilder` (new — Milestone 2), which composes `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` (existing, unmodified).
    - `async observe(input: ObservationInput): Promise<void>` — ADR-003 (Subject-Centric Intelligence) — routes every observation through the same Learning Pipeline (`SignalExtractor` → `ObservationBuilder` → `HypothesisEngine` → `LearningValidator` → `ProfileBuilder`) a User subject's `FeedbackEvent` already runs through, via `FeedbackProcessor.processObservation()`.
    - `async review(decision: CognitionReviewDecision): Promise<void>` — Delegates to `UserIntelligenceDomain.reviewLearningForWorkspace` (new — Milestone 2), which reuses the exact fetch-and-transition logic `reviewLearning` already had (extracted, not duplicated), gated on `workspace_id` instead of `user_id` since `CognitionReviewDecision` has no userId either.
    - `async summarizeCognition(workspaceId: string): Promise<CognitionSummary>` — Composed from the same `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` call `resolveCognitionContext` uses — no new DB access, just a different projection of the same already-consolidated data, matching the contract's description of `summarizeCognition` as "distinct...
    - `async checkHealth(): Promise<CognitionHealth>` — Delegates to `HealthChecker` (new — Milestone 2, thin).
- **Depends on (intra-repo):** `packages/intelligence-os/src/api/HealthChecker.ts`, `packages/intelligence-os/src/context/ContextBuilder.ts`, `packages/intelligence-os/src/context/voiceMapping.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/errors.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`
- **Called from:** `packages/intelligence-os/src/IntelligenceOS.ts`, `packages/intelligence-os/src/api/index.ts`, `packages/intelligence-os/src/index.ts`

#### Review

`review(decision)` — `POST /v1/cognition/review`. Supervisory review of a flagged Learning; corresponds to `intelligence.learning.reviewed`.

- **File:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer).
- **Class:** `CognitionProviderImpl`
  - **Methods:**
    - `async resolveCognitionContext(request: CognitionRequest): Promise<CognitionContext>` — Delegates entirely to `context/ContextBuilder` (new — Milestone 2), which composes `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` (existing, unmodified).
    - `async observe(input: ObservationInput): Promise<void>` — ADR-003 (Subject-Centric Intelligence) — routes every observation through the same Learning Pipeline (`SignalExtractor` → `ObservationBuilder` → `HypothesisEngine` → `LearningValidator` → `ProfileBuilder`) a User subject's `FeedbackEvent` already runs through, via `FeedbackProcessor.processObservation()`.
    - `async review(decision: CognitionReviewDecision): Promise<void>` — Delegates to `UserIntelligenceDomain.reviewLearningForWorkspace` (new — Milestone 2), which reuses the exact fetch-and-transition logic `reviewLearning` already had (extracted, not duplicated), gated on `workspace_id` instead of `user_id` since `CognitionReviewDecision` has no userId either.
    - `async summarizeCognition(workspaceId: string): Promise<CognitionSummary>` — Composed from the same `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` call `resolveCognitionContext` uses — no new DB access, just a different projection of the same already-consolidated data, matching the contract's description of `summarizeCognition` as "distinct...
    - `async checkHealth(): Promise<CognitionHealth>` — Delegates to `HealthChecker` (new — Milestone 2, thin).
- **Depends on (intra-repo):** `packages/intelligence-os/src/api/HealthChecker.ts`, `packages/intelligence-os/src/context/ContextBuilder.ts`, `packages/intelligence-os/src/context/voiceMapping.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/errors.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`
- **Called from:** `packages/intelligence-os/src/IntelligenceOS.ts`, `packages/intelligence-os/src/api/index.ts`, `packages/intelligence-os/src/index.ts`

#### Knowledge Ingest

`ingestKnowledgeAsset(asset, rawContent?)` — `POST /v1/knowledge/ingest`. Entry point into the Knowledge Pipeline.

- **File:** `packages/intelligence-os/src/IntelligenceOS.ts`
- **Summary:** Root class.
- **Class:** `IntelligenceOS`
  - **Methods:**
    - `async buildBlueprint(request: ArtifactRequest): Promise<ArtifactBlueprint>` — Called before artifact generation.
    - `async recordFeedbackEvent(event: FeedbackEvent): Promise<void>` — Called after artifact delivery/publish.
    - `async ingestKnowledgeAsset(asset: KnowledgeAssetInput, rawContent = '', existingAssetId?: string): Promise<string>` — Called at user onboarding or when a knowledge asset is uploaded.
    - `async ingestWorkspaceConfiguration(input: WorkspaceConfigurationInput): Promise<string>` — ADR-003 (Subject-Centric Intelligence) §2.4 — ingests explicit, admin-declared workspace configuration (a persona/brand-voice override, identity declarations, compliance requirements) as Knowledge, modeled on this class's existing `ingestKnowledgeAsset()` entry point rather than routed through the Learning Pipeline or a new `CognitionProvider` method (`PLATFORM_CONTRACT.md` §5 forbids a sixth oper
    - `async upsertProject(input: ProjectInput): Promise<string>` — Called when a consumer-side project is created or updated.
    - `async recordCorrection(input: UserCorrectionInput): Promise<void>` — The emitter half of `intelligence.user.correction` (see `UserCorrectionInput` in `types/domains.ts` for the full rationale).
    - `async reviewLearning(userId: string, learningId: string, approved: boolean, reviewedBy: string): Promise<void>` — Transitions a FLAGGED learning to ACTIVE (approved=true) or ARCHIVED (approved=false).
    - `eventBus(): IntelligenceEventBus` — Exposes the event bus so any consumer can subscribe to Intelligence OS pipeline events (e.g.
    - `asCognitionProvider(): CognitionProvider` — Returns the `CognitionProvider` implementation for this instance, constructing it on first access.
- **Depends on (intra-repo):** `packages/intelligence-os/src/IIntelligenceProvider.ts`, `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/api/HealthChecker.ts`, `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`, `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/types/domains.ts`
- **Called from:** `packages/intelligence-os/src/compat/IntelligenceOSProvider.ts`, `packages/intelligence-os/src/index.ts`

#### Correction

`recordCorrection(input)` — `POST /v1/intelligence/correction`. Alternate entry into the Learning Pipeline's Observation stage, for explicit user corrections rather than passive feedback.

- **File:** `packages/intelligence-os/src/IntelligenceOS.ts`
- **Summary:** Root class.
- **Class:** `IntelligenceOS`
  - **Methods:**
    - `async buildBlueprint(request: ArtifactRequest): Promise<ArtifactBlueprint>` — Called before artifact generation.
    - `async recordFeedbackEvent(event: FeedbackEvent): Promise<void>` — Called after artifact delivery/publish.
    - `async ingestKnowledgeAsset(asset: KnowledgeAssetInput, rawContent = '', existingAssetId?: string): Promise<string>` — Called at user onboarding or when a knowledge asset is uploaded.
    - `async ingestWorkspaceConfiguration(input: WorkspaceConfigurationInput): Promise<string>` — ADR-003 (Subject-Centric Intelligence) §2.4 — ingests explicit, admin-declared workspace configuration (a persona/brand-voice override, identity declarations, compliance requirements) as Knowledge, modeled on this class's existing `ingestKnowledgeAsset()` entry point rather than routed through the Learning Pipeline or a new `CognitionProvider` method (`PLATFORM_CONTRACT.md` §5 forbids a sixth oper
    - `async upsertProject(input: ProjectInput): Promise<string>` — Called when a consumer-side project is created or updated.
    - `async recordCorrection(input: UserCorrectionInput): Promise<void>` — The emitter half of `intelligence.user.correction` (see `UserCorrectionInput` in `types/domains.ts` for the full rationale).
    - `async reviewLearning(userId: string, learningId: string, approved: boolean, reviewedBy: string): Promise<void>` — Transitions a FLAGGED learning to ACTIVE (approved=true) or ARCHIVED (approved=false).
    - `eventBus(): IntelligenceEventBus` — Exposes the event bus so any consumer can subscribe to Intelligence OS pipeline events (e.g.
    - `asCognitionProvider(): CognitionProvider` — Returns the `CognitionProvider` implementation for this instance, constructing it on first access.
- **Depends on (intra-repo):** `packages/intelligence-os/src/IIntelligenceProvider.ts`, `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/api/HealthChecker.ts`, `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`, `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/types/domains.ts`
- **Called from:** `packages/intelligence-os/src/compat/IntelligenceOSProvider.ts`, `packages/intelligence-os/src/index.ts`

#### Workspace Configuration

`ingestWorkspaceConfiguration(input)` — `POST /v1/workspace-configuration`. Persists admin-declared voice/identity/compliance overrides as Knowledge, read back by `ContextBuilder` ahead of Learning-derived identity (ADR-003 §2.4).

- **File:** `packages/intelligence-os/src/IntelligenceOS.ts`
- **Summary:** Root class.
- **Class:** `IntelligenceOS`
  - **Methods:**
    - `async buildBlueprint(request: ArtifactRequest): Promise<ArtifactBlueprint>` — Called before artifact generation.
    - `async recordFeedbackEvent(event: FeedbackEvent): Promise<void>` — Called after artifact delivery/publish.
    - `async ingestKnowledgeAsset(asset: KnowledgeAssetInput, rawContent = '', existingAssetId?: string): Promise<string>` — Called at user onboarding or when a knowledge asset is uploaded.
    - `async ingestWorkspaceConfiguration(input: WorkspaceConfigurationInput): Promise<string>` — ADR-003 (Subject-Centric Intelligence) §2.4 — ingests explicit, admin-declared workspace configuration (a persona/brand-voice override, identity declarations, compliance requirements) as Knowledge, modeled on this class's existing `ingestKnowledgeAsset()` entry point rather than routed through the Learning Pipeline or a new `CognitionProvider` method (`PLATFORM_CONTRACT.md` §5 forbids a sixth oper
    - `async upsertProject(input: ProjectInput): Promise<string>` — Called when a consumer-side project is created or updated.
    - `async recordCorrection(input: UserCorrectionInput): Promise<void>` — The emitter half of `intelligence.user.correction` (see `UserCorrectionInput` in `types/domains.ts` for the full rationale).
    - `async reviewLearning(userId: string, learningId: string, approved: boolean, reviewedBy: string): Promise<void>` — Transitions a FLAGGED learning to ACTIVE (approved=true) or ARCHIVED (approved=false).
    - `eventBus(): IntelligenceEventBus` — Exposes the event bus so any consumer can subscribe to Intelligence OS pipeline events (e.g.
    - `asCognitionProvider(): CognitionProvider` — Returns the `CognitionProvider` implementation for this instance, constructing it on first access.
- **Depends on (intra-repo):** `packages/intelligence-os/src/IIntelligenceProvider.ts`, `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/api/HealthChecker.ts`, `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`, `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/types/domains.ts`
- **Called from:** `packages/intelligence-os/src/compat/IntelligenceOSProvider.ts`, `packages/intelligence-os/src/index.ts`

## Learning Pipeline

The complete learning lifecycle, in the order the source itself labels it (each stage file's own docblock states its stage number): Signal/Evidence Extraction (Stage 1, two parallel producers as of ADR-005) → Observation (Stage 2) → Hypothesis (Stage 3) → Learning (Stage 4–5) → Profile (Stage 6) → Context (terminal consumer, not itself a numbered stage). Ownership, entry points, and dependencies below are extracted directly from each stage's source file, not asserted.

### Stages

#### 1a. Signal Extraction (Experience-sourced)

Stage 1 per this module's own docblock. Extracts `Signal`s (governance/richness-scored, normalized to a 0–1 confidence range) out of feedback events and workspace observations, writing to `intelligence.signals`.

- **File:** `packages/intelligence-os/src/pipeline/SignalExtractor.ts`
- **Summary:** Stage 1 of the Learning Pipeline.
- **Class:** `SignalExtractor`
  - **Methods:**
    - `extractFromFeedback(event: FeedbackEventPayload): Signal[]` — Extracts zero or more in-memory Signal records from a FeedbackEvent payload.
    - `extractFromObservation(input: ObservationInput): Signal[]` — ADR-003 (Subject-Centric Intelligence) §2.1 — Stage 1 of the Learning Pipeline for a Workspace subject.
    - `shouldQuarantine(contextFlags: string[])` — Checks whether a signal should be quarantined.
- **Depends on (intra-repo):** `packages/intelligence-os/src/pipeline/types.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/events.ts`
- **Called from:** `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/pipeline/index.ts`

#### 1b. Evidence Extraction (Knowledge-sourced, ADR-005)

Also Stage 1, added by ADR-005 (Evidence/Identity Bridge) as a source-agnostic parallel producer alongside SignalExtractor — converts a generic `EvidenceSourceInput` envelope (today, built only by `knowledge/KnowledgeAssetEvidenceAdapter.ts` from an uploaded Knowledge asset's extracted frameworks/vocabulary) into the exact same `Signal[]` shape, behind a source-agnostic evidence-quality gate. Everything from Stage 2 onward is unmodified and unaware of which Stage-1 producer a Signal came from.

- **File:** `packages/intelligence-os/src/pipeline/EvidenceExtractor.ts`
- **Summary:** Stage 1 of the Learning Pipeline — Evidence/Identity Bridge (ADR-005).
- **Class:** `EvidenceExtractor`
  - **Methods:**
    - `extract(input: EvidenceSourceInput): Signal[]` — Converts a source-agnostic `EvidenceSourceInput` into zero or more in-memory `Signal` records, applying the evidence-quality gate above.
- **Depends on (intra-repo):** `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/knowledge/KnowledgeAssetEvidenceAdapter.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`

#### 2. Observation

Turns one or more Signals into a structured `Observation` — the first durable, typed record in the learning lifecycle, regardless of which Stage-1 producer supplied the Signal.

- **File:** `packages/intelligence-os/src/pipeline/ObservationBuilder.ts`
- **Summary:** Stage 2 of the Learning Pipeline.
- **Class:** `ObservationBuilder`
  - **Methods:**
    - `build(signal: Signal): Observation | null` — Builds an Observation from a validated (non-quarantined) Signal.
    - `applyCeiling(rawConfidence: number, quality: SourceQuality): number` — Applies the confidence ceiling to a raw confidence value.
    - `stabilityClassFor(category: TaxonomyCategory): StabilityClass` — Returns the stability class for a given taxonomy category.
- **Depends on (intra-repo):** `packages/intelligence-os/src/pipeline/types.ts`, `packages/intelligence-os/src/types/domains.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/pipeline/index.ts`

#### 3. Hypothesis

Aggregates signals into a candidate `Hypothesis` — a not-yet-trusted pattern about the user, stored in `intelligence.hypotheses`. Since ADR-005, `intelligence.hypotheses.evidence_trail` (migration 007) carries an append-only audit trail of every Observation that corroborated/contradicted it, not just a count.

- **File:** `packages/intelligence-os/src/pipeline/HypothesisEngine.ts`
- **Summary:** Stage 3 of the Learning Pipeline.
- **Class:** `HypothesisEngine`
  - **Methods:**
    - `async process(observation: Observation): Promise<Hypothesis>` — Processes an Observation: finds or creates the matching Hypothesis, applies the corroboration/contradiction logic, and persists the result.
    - `async markPromoted(hypothesisId: string, learningId: string): Promise<void>` — Marks a Hypothesis as having been promoted to a Learning.
    - `async discardExpired(userId: string): Promise<number>` — Discards expired PROVISIONAL hypotheses (timeout > 30 days, non-permanent) for a User subject.
    - `async discardExpiredForSubject(subject: SubjectRef): Promise<number>` — ADR-003 (Subject-Centric Intelligence) — discards expired hypotheses for any Subject.
- **Depends on (intra-repo):** `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/pipeline/types.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/pipeline/index.ts`

#### 4–5. Learning

Promotes a Hypothesis to a `Learning` once it clears validation thresholds, and is the module that emits `intelligence.learning.validated`. Copies `evidence_trail` verbatim into the Learning's `source_summary.evidenceTrail` on promotion (ADR-005), so identity traits stay traceable to their originating documents/frameworks/vocabulary, not just a confidence number.

- **File:** `packages/intelligence-os/src/pipeline/LearningValidator.ts`
- **Summary:** Stage 4–5 of the Learning Pipeline.
- **Class:** `LearningValidator`
  - **Methods:**
    - `async evaluate(hypothesis: Hypothesis, triggeringObservation?: Observation): Promise<ValidationResult>` — Evaluates whether the Hypothesis is ready for promotion to a Learning.
    - `async maybeConfirm(userId: string, taxonomyCategory: TaxonomyCategory): Promise<boolean>` — Checks whether an existing Learning for this user + category should be confirmed (upgraded from VALIDATED to CONFIRMED) based on new corroboration.
- **Depends on (intra-repo):** `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/pipeline/types.ts`, `packages/intelligence-os/src/types/domains.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/pipeline/index.ts`

#### Orchestration

Not itself a numbered stage — the orchestrator. Registers as the consumer of `intelligence.artifact.feedback` / `intelligence.user.correction` / `intelligence.signal.extracted`, and drives Signal → Observation → Hypothesis → Learning end-to-end for every entry point, including the supervisory review path (`intelligence.learning.reviewed`) and, since ADR-005, the knowledge-evidentiary path (`processKnowledgeEvidence`, registered alongside the pre-existing descriptive `processKnowledgeExtraction` on the same `intelligence.signal.extracted` event).

- **File:** `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`
- **Summary:** Pipeline orchestrator for the Learning Pipeline.
- **Class:** `FeedbackProcessor`
  - **Methods:**
    - `register(): void` — Registers the pipeline handlers on the event bus.
    - `async process(event: FeedbackEventPayload): Promise<PipelineRunResult>` — Processes a single FeedbackEvent through the full pipeline.
    - `async processObservation(input: ObservationInput): Promise<PipelineRunResult>` — Processes a single `CognitionProvider.observe()` payload through the full Learning Pipeline for a Workspace subject — the same six stages `process()` runs for a User subject's FeedbackEvent, generalized via `SubjectRef` rather than duplicated.
    - `async processCorrection(payload: UserCorrectionPayload): Promise<` — Handles an `intelligence.user.correction` event by routing it to `LearningValidator.maybeConfirm()` — the explicit-correction fast path.
    - `async processKnowledgeExtraction(payload: KnowledgeSignalExtractedPayload): Promise<` — ADR-004 (Cognitive Consolidation) §3.2, §12.1 — the fourth FeedbackProcessor entry point, driving straight to a profile rebuild-trigger check rather than through Stages 1-5 (Signal/Observation/Hypothesis/Learning), which don't apply to Knowledge — Knowledge doesn't require corroboration, only provenance (ADR-003 §2.4).
    - `async processKnowledgeEvidence(payload: KnowledgeSignalExtractedPayload): Promise<PipelineRunResult>` — Evidence/Identity Bridge (ADR-005) — the fifth FeedbackProcessor entry point.
- **Depends on (intra-repo):** `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/knowledge/KnowledgeAssetEvidenceAdapter.ts`, `packages/intelligence-os/src/knowledge/types.ts`, `packages/intelligence-os/src/pipeline/EvidenceExtractor.ts`, `packages/intelligence-os/src/pipeline/HypothesisEngine.ts`, `packages/intelligence-os/src/pipeline/LearningValidator.ts`, `packages/intelligence-os/src/pipeline/ObservationBuilder.ts`, `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`, `packages/intelligence-os/src/pipeline/SignalExtractor.ts`, `packages/intelligence-os/src/pipeline/types.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/events.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/IntelligenceOS.ts`, `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/pipeline/index.ts`

#### 6. Profile

Rebuilds the `IntelligenceProfile` for a subject from confirmed Learnings, emitting `intelligence.profile.updated`. See `.context/profile_model.generated.md` (Phase 1 naming; now a section of `architecture.generated.md`) for the full field-origin breakdown.

- **File:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Summary:** Stage 6 of the Learning Pipeline.
- **Class:** `ProfileBuilder`
  - **Methods:**
    - `async shouldRebuild(userId: string, newLearning: Learning): Promise<RebuildDecision>` — Evaluates whether a profile rebuild is needed for the given user, considering the newly created Learning and the current profile state.
    - `async shouldRebuildForSubject(subject: SubjectRef, newLearning: Learning): Promise<RebuildDecision>` — ADR-003 (Subject-Centric Intelligence) — evaluates whether a profile rebuild is needed for any Subject (User or Workspace), considering the newly created Learning and the current profile state.
    - `async shouldRebuildForSubjectFromKnowledge(subject: SubjectRef, changedKnowledgeAssetId: string): Promise<RebuildDecision>` — ADR-004 (Cognitive Consolidation) §12.2 — evaluates whether a profile rebuild is needed in response to a new/changed `isCurrent` `KnowledgeAsset` for the given Subject.
    - `async rebuild(userId: string, changedDomains: string[] = []): Promise<IntelligenceProfile>` — Builds a new version of the Intelligence Profile from all active Learnings.
    - `async rebuildForSubject(subject: SubjectRef, changedDomains: string[] = []): Promise<IntelligenceProfile>` — ADR-003 (Subject-Centric Intelligence) — builds a new version of the Intelligence Profile for any Subject (User or Workspace) from all of that Subject's active Learnings.
- **Depends on (intra-repo):** `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/errors.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/knowledge/types.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/pipeline/index.ts`

#### Context (consumer, not a Learning Pipeline stage)

Terminal consumer of the Profile — assembles the `CognitionContext` an artifact-generation request actually receives.

- **File:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer), generalized by ADR-003 (Subject-Centric Intelligence).
- **Class:** `ContextBuilder`
  - **Methods:**
    - `async build(workspaceId: string, _taskType?: string): Promise<CognitionContext>` — Assembles the complete, immutable CognitionContext for a workspace.
- **Depends on (intra-repo):** `packages/intelligence-os/src/context/identitySynthesis.ts`, `packages/intelligence-os/src/context/voiceMapping.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/context/index.ts`, `packages/intelligence-os/src/index.ts`

## Knowledge Pipeline

The complete knowledge lifecycle: Knowledge Upload → Extraction → Validation → Storage, then TWO independent, parallel contribution paths from the same `intelligence.signal.extracted` event — a descriptive path (5a, unchanged) and, since ADR-005, an evidentiary path (5b) that lets Knowledge actually promote to identity through the ordinary Learning Pipeline gate, not just describe itself in the Profile. Both converge on Context Contribution → Prompt Contribution.

### Stages

#### 1. Knowledge Upload

`IntelligenceOS.ingestKnowledgeAsset()` / `ingestWorkspaceConfiguration()` are the two public entry points; both persist through `KnowledgeIntelligenceDomain` and emit `intelligence.knowledge_asset.uploaded`.

- **File:** `packages/intelligence-os/src/IntelligenceOS.ts`
- **Summary:** Root class.
- **Class:** `IntelligenceOS`
  - **Methods:**
    - `async buildBlueprint(request: ArtifactRequest): Promise<ArtifactBlueprint>` — Called before artifact generation.
    - `async recordFeedbackEvent(event: FeedbackEvent): Promise<void>` — Called after artifact delivery/publish.
    - `async ingestKnowledgeAsset(asset: KnowledgeAssetInput, rawContent = '', existingAssetId?: string): Promise<string>` — Called at user onboarding or when a knowledge asset is uploaded.
    - `async ingestWorkspaceConfiguration(input: WorkspaceConfigurationInput): Promise<string>` — ADR-003 (Subject-Centric Intelligence) §2.4 — ingests explicit, admin-declared workspace configuration (a persona/brand-voice override, identity declarations, compliance requirements) as Knowledge, modeled on this class's existing `ingestKnowledgeAsset()` entry point rather than routed through the Learning Pipeline or a new `CognitionProvider` method (`PLATFORM_CONTRACT.md` §5 forbids a sixth oper
    - `async upsertProject(input: ProjectInput): Promise<string>` — Called when a consumer-side project is created or updated.
    - `async recordCorrection(input: UserCorrectionInput): Promise<void>` — The emitter half of `intelligence.user.correction` (see `UserCorrectionInput` in `types/domains.ts` for the full rationale).
    - `async reviewLearning(userId: string, learningId: string, approved: boolean, reviewedBy: string): Promise<void>` — Transitions a FLAGGED learning to ACTIVE (approved=true) or ARCHIVED (approved=false).
    - `eventBus(): IntelligenceEventBus` — Exposes the event bus so any consumer can subscribe to Intelligence OS pipeline events (e.g.
    - `asCognitionProvider(): CognitionProvider` — Returns the `CognitionProvider` implementation for this instance, constructing it on first access.
- **Depends on (intra-repo):** `packages/intelligence-os/src/IIntelligenceProvider.ts`, `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/api/HealthChecker.ts`, `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`, `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/types/domains.ts`
- **Called from:** `packages/intelligence-os/src/compat/IntelligenceOSProvider.ts`, `packages/intelligence-os/src/index.ts`

#### 2. Extraction

Orchestrates the type-specific extractors (`VocabularyExtractor`, `FrameworkExtractor`, `PatternExtractor`, `VisualFeatureExtractor`, `KnowledgeAssetExtractor`) over the raw uploaded content, then emits `intelligence.signal.extracted` — which two independent FeedbackProcessor handlers pick up in parallel (branch below).

- **File:** `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`
- **Summary:** Orchestrator for the Knowledge Intelligence pipeline.
- **Class:** `KnowledgeProcessor`
  - **Methods:**
    - `register(): void` — Registers the processor on the event bus.
    - `async process(input: KnowledgeAssetInput, rawContent: string, assetId: string): Promise<KnowledgeProcessorResult>` — Processes a knowledge asset through the full extraction pipeline.
- **Depends on (intra-repo):** `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/knowledge/FrameworkExtractor.ts`, `packages/intelligence-os/src/knowledge/KnowledgeAssetExtractor.ts`, `packages/intelligence-os/src/knowledge/KnowledgeValidator.ts`, `packages/intelligence-os/src/knowledge/PatternExtractor.ts`, `packages/intelligence-os/src/knowledge/VisualFeatureExtractor.ts`, `packages/intelligence-os/src/knowledge/VocabularyExtractor.ts`, `packages/intelligence-os/src/knowledge/types.ts`, `packages/intelligence-os/src/types/domains.ts`, `packages/intelligence-os/src/types/entities.ts`
- **Called from:** `packages/intelligence-os/src/IntelligenceOS.ts`, `packages/intelligence-os/src/knowledge/index.ts`

#### 2a. Vocabulary extraction


- **File:** `packages/intelligence-os/src/knowledge/VocabularyExtractor.ts`
- **Summary:** Stage 1 of the Knowledge Intelligence pipeline (after KnowledgeAssetExtractor).
- **Class:** `VocabularyExtractor`
  - **Methods:**
    - `extract(job: ExtractionJob): VocabularyExtractionResult` — Extracts vocabulary intelligence from a normalized ExtractionJob.
- **Depends on (intra-repo):** `packages/intelligence-os/src/knowledge/types.ts`, `packages/intelligence-os/src/types/entities.ts`
- **Called from:** `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/knowledge/index.ts`

#### 2b. Framework extraction


- **File:** `packages/intelligence-os/src/knowledge/FrameworkExtractor.ts`
- **Summary:** Stage 2 of the Knowledge Intelligence pipeline.
- **Class:** `FrameworkExtractor`
  - **Methods:**
    - `extract(job: ExtractionJob): FrameworkExtractionResult` — Detects frameworks (explicit and implicit) in the extraction job.
- **Depends on (intra-repo):** `packages/intelligence-os/src/knowledge/types.ts`
- **Called from:** `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/knowledge/index.ts`

#### 2c. Pattern extraction


- **File:** `packages/intelligence-os/src/knowledge/PatternExtractor.ts`
- **Summary:** Stage 3 of the Knowledge Intelligence pipeline.
- **Class:** `PatternExtractor`
  - **Methods:**
    - `extract(job: ExtractionJob): PatternExtractionResult` — Extracts structural, narrative, and artifact approach patterns from the extraction job's normalized content.
- **Depends on (intra-repo):** `packages/intelligence-os/src/knowledge/types.ts`
- **Called from:** `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/knowledge/index.ts`

#### 2d. Visual feature extraction


- **File:** `packages/intelligence-os/src/knowledge/VisualFeatureExtractor.ts`
- **Summary:** Stage 4 of the Knowledge Intelligence pipeline (parallel to Stage 1–3 for visual-typed assets).
- **Class:** `VisualFeatureExtractor`
  - **Methods:**
    - `extract(job: ExtractionJob): VisualFeatureExtractionResult` — Extracts visual features from an ExtractionJob.
- **Depends on (intra-repo):** `packages/intelligence-os/src/knowledge/types.ts`
- **Called from:** `packages/intelligence-os/src/index.ts`, `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`

#### 3. Validation

Validates extracted knowledge before it is allowed to persist or contribute to context.

- **File:** `packages/intelligence-os/src/knowledge/KnowledgeValidator.ts`
- **Summary:** Stage 4 of the Knowledge Intelligence pipeline.
- **Class:** `KnowledgeValidator`
  - **Methods:**
    - `async validate(job: ExtractionJob, vocabulary: VocabularyExtractionResult, frameworks: FrameworkExtractionResult): Promise<ValidationResult>` — Validates an extraction job and its extraction results.
- **Depends on (intra-repo):** `packages/intelligence-os/src/knowledge/types.ts`, `packages/intelligence-os/src/types/entities.ts`
- **Called from:** `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/knowledge/index.ts`

#### 4. Storage

Owns `intelligence.knowledge_assets` — the only writer/reader of that table (see the "Domain Ownership" section of `architecture.generated.md`).

- **File:** `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`
- **Summary:** Owns: intelligence.knowledge_assets No other domain may write to this table.
- **Class:** `KnowledgeIntelligenceDomain`
  - **Methods:**
    - `async getAssets(filter: KnowledgeAssetFilter): Promise<KnowledgeAsset[]>` — Returns knowledge assets matching the given filter.
    - `async getCurrentAssetsForSubject(subject: SubjectRef): Promise<KnowledgeAsset[]>` — ADR-004 (Cognitive Consolidation) §2.1 — Subject-generic counterpart to `getAssets()`, mirroring the `...ForSubject` convention ADR-003 established on `UserIntelligenceDomain`.
    - `async getAssetById(id: string): Promise<KnowledgeAsset | null>` — Returns a single knowledge asset by id, or null if not found.
    - `async requireAsset(id: string): Promise<KnowledgeAsset>` — Returns an asset by id, throwing EntityNotFoundError if it doesn't exist.
    - `async ingestAsset(_input: KnowledgeAssetInput): Promise<string>` — Ingests a knowledge asset (upload → extract vocabulary/patterns/frameworks).
    - `async persistExtracted(input: KnowledgeAssetUpsertInput): Promise<KnowledgeAsset>` — Persists a fully-extracted knowledge asset (upsert by id).
    - `async upsertWorkspaceConfiguration(input: WorkspaceConfigurationInput): Promise<string>` — ADR-003 (Subject-Centric Intelligence) §2.4 — persists explicit, admin-declared workspace configuration (a persona/brand-voice override, compliance requirements) as a `KnowledgeAsset` (`ownerType: 'workspace'`, `assetType: 'reference'`), not a `Learning`.
- **Depends on (intra-repo):** `packages/intelligence-os/src/errors.ts`, `packages/intelligence-os/src/types/domains.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/IntelligenceOS.ts`, `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`, `packages/intelligence-os/src/blueprint/ProjectContextBuilder.ts`, `packages/intelligence-os/src/domains/index.ts`, `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`

#### 5a. Profile Contribution — descriptive path (unchanged)

The pre-ADR-005 path: `FeedbackProcessor.processKnowledgeExtraction()` folds knowledge assets into the Profile's *descriptive* fields (`knowledgeSummary` etc.) directly — no Hypothesis, no evidence gate, no promotion threshold. This path is unmodified by ADR-005.

- **File:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Summary:** Stage 6 of the Learning Pipeline.
- **Class:** `ProfileBuilder`
  - **Methods:**
    - `async shouldRebuild(userId: string, newLearning: Learning): Promise<RebuildDecision>` — Evaluates whether a profile rebuild is needed for the given user, considering the newly created Learning and the current profile state.
    - `async shouldRebuildForSubject(subject: SubjectRef, newLearning: Learning): Promise<RebuildDecision>` — ADR-003 (Subject-Centric Intelligence) — evaluates whether a profile rebuild is needed for any Subject (User or Workspace), considering the newly created Learning and the current profile state.
    - `async shouldRebuildForSubjectFromKnowledge(subject: SubjectRef, changedKnowledgeAssetId: string): Promise<RebuildDecision>` — ADR-004 (Cognitive Consolidation) §12.2 — evaluates whether a profile rebuild is needed in response to a new/changed `isCurrent` `KnowledgeAsset` for the given Subject.
    - `async rebuild(userId: string, changedDomains: string[] = []): Promise<IntelligenceProfile>` — Builds a new version of the Intelligence Profile from all active Learnings.
    - `async rebuildForSubject(subject: SubjectRef, changedDomains: string[] = []): Promise<IntelligenceProfile>` — ADR-003 (Subject-Centric Intelligence) — builds a new version of the Intelligence Profile for any Subject (User or Workspace) from all of that Subject's active Learnings.
- **Depends on (intra-repo):** `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/errors.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/knowledge/types.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`, `packages/intelligence-os/src/pipeline/index.ts`

#### 5b. Evidence Bridge — evidentiary path (ADR-005, new)

New: the SAME `intelligence.signal.extracted` event also triggers `FeedbackProcessor.processKnowledgeEvidence()`, which converts extracted frameworks/vocabulary into a source-agnostic `EvidenceSourceInput` (this adapter, the only Knowledge-specific file in the bridge) and runs it through `pipeline/EvidenceExtractor.ts` (evidence-quality gate) → the *unmodified* Stage 2–6 Learning Pipeline (Observation → Hypothesis → Learning → Profile). A single uploaded document never becomes identity on its own — it becomes a PROVISIONAL Hypothesis and only promotes to a Learning once the ordinary corroboration threshold is met, exactly like feedback-derived evidence. See the "Learning Pipeline" section for Stage 1b.

- **File:** `packages/intelligence-os/src/knowledge/KnowledgeAssetEvidenceAdapter.ts`
- **Summary:** Evidence/Identity Bridge (ADR-005) — the ONLY Knowledge-specific file in the bridge.
- **Function:** `buildKnowledgeAssetEvidenceInput` — Builds the `EvidenceSourceInput` for one knowledge asset, or `null` if the asset produced no identity-relevant evidence at all (e.g.
- **Depends on (intra-repo):** `packages/intelligence-os/src/knowledge/types.ts`, `packages/intelligence-os/src/pipeline/EvidenceExtractor.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`

#### 6. Context Contribution

`ContextBuilder` reads back persisted Knowledge assets ahead of Learning-derived voice/identity (workspace configuration takes precedence — ADR-003 §2.4). Learnings promoted via the evidence bridge (5b) reach `ContextBuilder` the same way any other Learning does — through the Profile, via `identitySynthesis.ts` — not through this descriptive read-back.

- **File:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer), generalized by ADR-003 (Subject-Centric Intelligence).
- **Class:** `ContextBuilder`
  - **Methods:**
    - `async build(workspaceId: string, _taskType?: string): Promise<CognitionContext>` — Assembles the complete, immutable CognitionContext for a workspace.
- **Depends on (intra-repo):** `packages/intelligence-os/src/context/identitySynthesis.ts`, `packages/intelligence-os/src/context/voiceMapping.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/context/index.ts`, `packages/intelligence-os/src/index.ts`

#### 7. Prompt Contribution

The assembled `CognitionContext` (which carries knowledge-derived fields) ultimately shapes the `ArtifactBlueprint` prompt/plan produced here.

- **File:** `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`
- **Summary:** Final assembly layer for blueprint generation.
- **Class:** `BlueprintBuilder`
  - **Methods:**
    - `async build(request: ArtifactRequest): Promise<ArtifactBlueprint>`
- **Depends on (intra-repo):** `packages/intelligence-os/src/blueprint/AudienceCalibrator.ts`, `packages/intelligence-os/src/blueprint/ConflictResolutionModel.ts`, `packages/intelligence-os/src/blueprint/NarrativePlanner.ts`, `packages/intelligence-os/src/blueprint/ProjectContextBuilder.ts`, `packages/intelligence-os/src/blueprint/StructurePlanner.ts`, `packages/intelligence-os/src/blueprint/internal/conflictDetection.ts`, `packages/intelligence-os/src/blueprint/internal/trackedFetch.ts`, `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/types/entities.ts`
- **Called from:** `packages/intelligence-os/src/IntelligenceOS.ts`, `packages/intelligence-os/src/blueprint/index.ts`


#### Knowledge subsystem — graph relationships

_Graph-derived relationship ledger (from the Architecture Knowledge Graph) — see `architecture.generated.json`._

The Knowledge subsystem's graph neighborhood, hand-selected (module/class/table/event/field node IDs) but with every relationship for each shown mechanically from the Architecture Knowledge Graph — no relationship listed below was hand-transcribed. Cross-reference `.context/knowledge_pipeline.generated.md` (Phase 1) for the narrative walkthrough.

###### `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts` _(Module)_

- **Location:** `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`
- **Outgoing:**
  - `DEPENDS_ON` → `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/events/IntelligenceEventBus.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/FrameworkExtractor.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/KnowledgeAssetExtractor.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/KnowledgeValidator.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/PatternExtractor.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/types.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/VisualFeatureExtractor.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/VocabularyExtractor.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/types/domains.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/types/entities.ts` _(Module)_
  - `USES` → `@intelligence-os/core` _(Package)_
- **Incoming:**
  - `DEPENDS_ON` ← `packages/intelligence-os/src/IntelligenceOS.ts` _(Module)_
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/index.ts` _(Module)_
  - `USES` ← `KnowledgeProcessor` _(Class)_

###### `KnowledgeProcessor` _(Class)_

- **Location:** `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`:60
- **Outgoing:**
  - `CONSUMES` → `intelligence.knowledge_asset.uploaded` _(Event)_
  - `EMITS` → `intelligence.signal.extracted` _(Event)_
  - `USES` → `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts` _(Module)_
- **Incoming:**
  - `USES` ← `KnowledgeProcessor.persistAsset` _(Method)_
  - `USES` ← `KnowledgeProcessor.process` _(Method)_
  - `USES` ← `KnowledgeProcessor.register` _(Method)_

###### `packages/intelligence-os/src/knowledge/VocabularyExtractor.ts` _(Module)_

- **Location:** `packages/intelligence-os/src/knowledge/VocabularyExtractor.ts`
- **Outgoing:**
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/types.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/types/entities.ts` _(Module)_
  - `USES` → `@intelligence-os/core` _(Package)_
- **Incoming:**
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/index.ts` _(Module)_
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts` _(Module)_
  - `USES` ← `VocabularyExtractor` _(Class)_

###### `packages/intelligence-os/src/knowledge/FrameworkExtractor.ts` _(Module)_

- **Location:** `packages/intelligence-os/src/knowledge/FrameworkExtractor.ts`
- **Outgoing:**
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/types.ts` _(Module)_
  - `USES` → `@intelligence-os/core` _(Package)_
- **Incoming:**
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/index.ts` _(Module)_
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts` _(Module)_
  - `USES` ← `FrameworkExtractor` _(Class)_

###### `packages/intelligence-os/src/knowledge/PatternExtractor.ts` _(Module)_

- **Location:** `packages/intelligence-os/src/knowledge/PatternExtractor.ts`
- **Outgoing:**
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/types.ts` _(Module)_
  - `USES` → `@intelligence-os/core` _(Package)_
- **Incoming:**
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/index.ts` _(Module)_
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts` _(Module)_
  - `USES` ← `PatternExtractor` _(Class)_

###### `packages/intelligence-os/src/knowledge/VisualFeatureExtractor.ts` _(Module)_

- **Location:** `packages/intelligence-os/src/knowledge/VisualFeatureExtractor.ts`
- **Outgoing:**
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/types.ts` _(Module)_
  - `USES` → `@intelligence-os/core` _(Package)_
- **Incoming:**
  - `DEPENDS_ON` ← `packages/intelligence-os/src/index.ts` _(Module)_
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts` _(Module)_
  - `USES` ← `VisualFeatureExtractor` _(Class)_

###### `packages/intelligence-os/src/knowledge/KnowledgeValidator.ts` _(Module)_

- **Location:** `packages/intelligence-os/src/knowledge/KnowledgeValidator.ts`
- **Outgoing:**
  - `DEPENDS_ON` → `packages/intelligence-os/src/knowledge/types.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/types/entities.ts` _(Module)_
  - `USES` → `@intelligence-os/core` _(Package)_
- **Incoming:**
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/index.ts` _(Module)_
  - `DEPENDS_ON` ← `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts` _(Module)_
  - `USES` ← `KnowledgeValidator` _(Class)_

###### `KnowledgeIntelligenceDomain` _(Domain)_

- **Location:** `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`:110
- **Outgoing:**
  - `OWNS` → `intelligence.knowledge_assets` _(Table)_
  - `PERSISTS` → `intelligence.knowledge_assets` _(Table)_
  - `READS` → `intelligence.knowledge_assets` _(Table)_
  - `READS` → `intelligence.knowledge_assets` _(Table)_
  - `USES` → `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts` _(Module)_
  - `WRITES` → `intelligence.knowledge_assets` _(Table)_
- **Incoming:**
  - `USES` ← `KnowledgeIntelligenceDomain.getAssetById` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.getAssets` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.getCurrentAssetsForSubject` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.ingestAsset` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.persistExtracted` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.requireAsset` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.upsertWorkspaceConfiguration` _(Method)_

###### `intelligence.knowledge_assets` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `KnowledgeIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `KnowledgeIntelligenceDomain` _(Domain)_
  - `READS` ← `KnowledgeIntelligenceDomain` _(Domain)_
  - `READS` ← `KnowledgeIntelligenceDomain` _(Domain)_
  - `READS` ← `WorkspaceIntelligenceDomain` _(Domain)_
  - `WRITES` ← `KnowledgeIntelligenceDomain` _(Domain)_

###### `intelligence.knowledge_asset.uploaded` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `CONSUMES` ← `KnowledgeProcessor` _(Class)_
  - `EMITS` ← `IntelligenceOS` _(Class)_

###### `IntelligenceProfile.knowledgeSummary` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Outgoing:**
  - `CONTRIBUTES_TO` → `CognitionContext.knowledge` _(ContextField)_
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `CognitionContext.knowledge` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `CONTRIBUTES_TO` ← `IntelligenceProfile.knowledgeSummary` _(ProfileField)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

## Identity Pipeline

Identity derivation, and every field `ContextBuilder` assembles alongside it: Voice, Reasoning, Positioning, Audience, Confidence, Knowledge Summary, Visual Identity. Several of these are not separate modules — they are inline projections inside `ContextBuilder.build()` itself, which this doc calls out explicitly rather than inventing a module that doesn't exist.

### Stages

#### Identity derivation

`deriveIdentityContribution(learnings)` — turns confirmed Learnings into an `IdentityContribution`, or `null` if nothing has been learned yet (the deliberate "honest null" state per `ContextBuilder.ts`'s own header doc). As of ADR-005 (Evidence/Identity Bridge), those Learnings can now originate from Knowledge assets too — see `pipeline/EvidenceExtractor.ts` and `knowledge/KnowledgeAssetEvidenceAdapter.ts` — not only from feedback/observation evidence; `identitySynthesis.ts` itself is unchanged and unaware of which source produced a given Learning.

- **File:** `packages/intelligence-os/src/context/identitySynthesis.ts`
- **Summary:** ADR-003 (Subject-Centric Intelligence) §2.3 — gives `context/ContextBuilder.ts` a real identity-synthesis path for the Workspace subject, replacing the unconditional `identity: null` Milestone 2 shipped (see `ContextBuilder.ts`'s former "Consequence, stated plainly" note, now corrected).
- **Function:** `deriveIdentityContribution` — Projects a Subject's identity-relevant Learnings into an `IdentityContribution`, or `null` if none exist yet.
- **Depends on (intra-repo):** `packages/intelligence-os/src/context/confidenceMerge.ts`, `packages/intelligence-os/src/types/entities.ts`
- **Called from:** `packages/intelligence-os/src/context/ContextBuilder.ts`

#### Voice

`deriveVoiceProfile(learnings)` — maps Learnings to a `VoiceProfile`. Same file also derives `deriveConfidence` and `deriveLastConsolidatedAt`.

- **File:** `packages/intelligence-os/src/context/voiceMapping.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer).
- **Function:** `deriveVoiceProfile` — Projects the subset of workspace learnings tagged as voice-relevant into a `VoiceProfile`.
- **Function:** `deriveConfidence` — Buckets a set of already-computed per-learning confidence scores into the single, coarse `CognitionConfidence` value the contract permits.
- **Function:** `deriveLastConsolidatedAt` — Most recent `updatedAt` across a set of learnings, or null if empty.
- **Depends on (intra-repo):** `packages/intelligence-os/src/context/confidenceMerge.ts`, `packages/intelligence-os/src/types/entities.ts`
- **Called from:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/context/ContextBuilder.ts`, `packages/intelligence-os/src/context/index.ts`

#### Reasoning

Computed inline in `ContextBuilder.build()` (the `reasoning:` field) by projecting the Profile's reasoning-pattern collection through `projectByAscendingConfidence` — there is no standalone `reasoning*.ts` module; it lives directly in the builder.

- **File:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer), generalized by ADR-003 (Subject-Centric Intelligence).
- **Class:** `ContextBuilder`
  - **Methods:**
    - `async build(workspaceId: string, _taskType?: string): Promise<CognitionContext>` — Assembles the complete, immutable CognitionContext for a workspace.
- **Depends on (intra-repo):** `packages/intelligence-os/src/context/identitySynthesis.ts`, `packages/intelligence-os/src/context/voiceMapping.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/context/index.ts`, `packages/intelligence-os/src/index.ts`

#### Positioning

Same pattern as Reasoning — computed inline (`positioning:` field) via the same generic projection helper.

- **File:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer), generalized by ADR-003 (Subject-Centric Intelligence).
- **Class:** `ContextBuilder`
  - **Methods:**
    - `async build(workspaceId: string, _taskType?: string): Promise<CognitionContext>` — Assembles the complete, immutable CognitionContext for a workspace.
- **Depends on (intra-repo):** `packages/intelligence-os/src/context/identitySynthesis.ts`, `packages/intelligence-os/src/context/voiceMapping.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/context/index.ts`, `packages/intelligence-os/src/index.ts`

#### Audience

Audience calibration is a Blueprint-time concern (per-request, given a named recipient) rather than a Context-time one — see `AudienceCalibration.isNamedRelationship` referenced from `ArtifactIntelligenceDomain.countArtifactsWithNamedRecipients`.

- **File:** `packages/intelligence-os/src/blueprint/AudienceCalibrator.ts`
- **Summary:** Assembles audience intelligence for blueprint assembly.
- **Class:** `AudienceCalibrator`
  - **Methods:**
    - `async calibrate(userId: string, audienceRef: AudienceReference | undefined): Promise<AudienceCalibratorResult>`
- **Depends on (intra-repo):** `packages/intelligence-os/src/blueprint/internal/defaults.ts`, `packages/intelligence-os/src/blueprint/internal/trackedFetch.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/types/entities.ts`
- **Called from:** `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`, `packages/intelligence-os/src/blueprint/index.ts`

#### Confidence

`deriveConfidence(learnings)` — the top-level `CognitionConfidence` on the assembled context; per-section confidence (identity/voice/reasoning/positioning) is derived independently per section via `projectByAscendingConfidence`, not copied from this top-level value.

- **File:** `packages/intelligence-os/src/context/voiceMapping.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer).
- **Function:** `deriveVoiceProfile` — Projects the subset of workspace learnings tagged as voice-relevant into a `VoiceProfile`.
- **Function:** `deriveConfidence` — Buckets a set of already-computed per-learning confidence scores into the single, coarse `CognitionConfidence` value the contract permits.
- **Function:** `deriveLastConsolidatedAt` — Most recent `updatedAt` across a set of learnings, or null if empty.
- **Depends on (intra-repo):** `packages/intelligence-os/src/context/confidenceMerge.ts`, `packages/intelligence-os/src/types/entities.ts`
- **Called from:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/context/ContextBuilder.ts`, `packages/intelligence-os/src/context/index.ts`

#### Knowledge Summary

Knowledge assets contribute through `KnowledgeIntelligenceDomain` → `ContextBuilder`, which reads workspace-declared configuration ahead of Learning-derived identity/voice (ADR-003 §2.4 precedence rule). This is the *descriptive* path — distinct from the *evidentiary* path (this stage above, "Identity derivation") that ADR-005 added.

- **File:** `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`
- **Summary:** Orchestrator for the Knowledge Intelligence pipeline.
- **Class:** `KnowledgeProcessor`
  - **Methods:**
    - `register(): void` — Registers the processor on the event bus.
    - `async process(input: KnowledgeAssetInput, rawContent: string, assetId: string): Promise<KnowledgeProcessorResult>` — Processes a knowledge asset through the full extraction pipeline.
- **Depends on (intra-repo):** `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`, `packages/intelligence-os/src/events/IntelligenceEventBus.ts`, `packages/intelligence-os/src/knowledge/FrameworkExtractor.ts`, `packages/intelligence-os/src/knowledge/KnowledgeAssetExtractor.ts`, `packages/intelligence-os/src/knowledge/KnowledgeValidator.ts`, `packages/intelligence-os/src/knowledge/PatternExtractor.ts`, `packages/intelligence-os/src/knowledge/VisualFeatureExtractor.ts`, `packages/intelligence-os/src/knowledge/VocabularyExtractor.ts`, `packages/intelligence-os/src/knowledge/types.ts`, `packages/intelligence-os/src/types/domains.ts`, `packages/intelligence-os/src/types/entities.ts`
- **Called from:** `packages/intelligence-os/src/IntelligenceOS.ts`, `packages/intelligence-os/src/knowledge/index.ts`

#### Visual Identity

Currently hard-coded to `null` in `ContextBuilder.build()` (`visualIdentity: null`) — there is no visual-identity contributor implemented yet. This is a genuine gap, not a missed cross-reference; see the "Repository Health" section of `architecture.generated.md`.

- **File:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Summary:** Milestone 2 (CognitionProvider integration layer), generalized by ADR-003 (Subject-Centric Intelligence).
- **Class:** `ContextBuilder`
  - **Methods:**
    - `async build(workspaceId: string, _taskType?: string): Promise<CognitionContext>` — Assembles the complete, immutable CognitionContext for a workspace.
- **Depends on (intra-repo):** `packages/intelligence-os/src/context/identitySynthesis.ts`, `packages/intelligence-os/src/context/voiceMapping.ts`, `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`, `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`, `packages/intelligence-os/src/types/entities.ts`, `packages/intelligence-os/src/types/subject.ts`
- **Called from:** `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, `packages/intelligence-os/src/context/index.ts`, `packages/intelligence-os/src/index.ts`


#### Identity subsystem — graph relationships

_Graph-derived relationship ledger (from the Architecture Knowledge Graph) — see `architecture.generated.json`._

The Identity subsystem's graph neighborhood: Identity, Voice, Reasoning, Positioning, Confidence, Knowledge Summary, and Visual Identity as `ContextField` nodes, plus their producing functions/classes. `visualIdentity` will show zero incoming CONTRIBUTES_TO/SYNTHESIZES edges below — that is the graph confirming, not merely asserting, the gap already called out in `.context/identity_pipeline.generated.md` and `.context/repository_health.generated.md`.

###### `packages/intelligence-os/src/context/identitySynthesis.ts` _(Module)_

- **Location:** `packages/intelligence-os/src/context/identitySynthesis.ts`
- **Outgoing:**
  - `DEPENDS_ON` → `packages/intelligence-os/src/context/confidenceMerge.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/types/entities.ts` _(Module)_
  - `USES` → `@intelligence-os/core` _(Package)_
- **Incoming:**
  - `DEPENDS_ON` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `packages/intelligence-os/src/context/voiceMapping.ts` _(Module)_

- **Location:** `packages/intelligence-os/src/context/voiceMapping.ts`
- **Outgoing:**
  - `DEPENDS_ON` → `packages/intelligence-os/src/context/confidenceMerge.ts` _(Module)_
  - `DEPENDS_ON` → `packages/intelligence-os/src/types/entities.ts` _(Module)_
  - `USES` → `@intelligence-os/core` _(Package)_
- **Incoming:**
  - `DEPENDS_ON` ← `packages/intelligence-os/src/api/CognitionProviderImpl.ts` _(Module)_
  - `DEPENDS_ON` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `DEPENDS_ON` ← `packages/intelligence-os/src/context/index.ts` _(Module)_

###### `ContextBuilder` _(Class)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`:235
- **Outgoing:**
  - `USES` → `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
- **Incoming:**
  - `USES` ← `ContextBuilder.build` _(Method)_

###### `ContextBuilder.build` _(Method)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Summary:** Assembles the complete, immutable CognitionContext for a workspace.
- **Outgoing:**
  - `BUILDS` → `CognitionContext.confidence` _(ContextField)_
  - `BUILDS` → `CognitionContext.contractVersion` _(ContextField)_
  - `BUILDS` → `CognitionContext.identity` _(ContextField)_
  - `BUILDS` → `CognitionContext.knowledge` _(ContextField)_
  - `BUILDS` → `CognitionContext.positioning` _(ContextField)_
  - `BUILDS` → `CognitionContext.provenance` _(ContextField)_
  - `BUILDS` → `CognitionContext.reasoning` _(ContextField)_
  - `BUILDS` → `CognitionContext.resolvedAt` _(ContextField)_
  - `BUILDS` → `CognitionContext.visualIdentity` _(ContextField)_
  - `BUILDS` → `CognitionContext.voice` _(ContextField)_
  - `BUILDS` → `CognitionContext.workspaceId` _(ContextField)_
  - `CALLS` → `UserIntelligenceDomain.getCurrentProfileForSubject` _(Method)_
  - `CALLS` → `WorkspaceIntelligenceDomain.getContext` _(Method)_
  - `CALLS` → `WorkspaceIntelligenceDomain.getWorkspaceLearnings` _(Method)_
  - `USES` → `ContextBuilder` _(Class)_
- **Incoming:**
  - `CALLS` ← `CognitionProviderImpl.resolveCognitionContext` _(Method)_

###### `CognitionContext.identity` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `deriveIdentityContribution` _(Function)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `SYNTHESIZES` ← `deriveIdentityContribution` _(Function)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.voice` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `deriveVoiceProfile` _(Function)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `SYNTHESIZES` ← `deriveVoiceProfile` _(Function)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.reasoning` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `CONTRIBUTES_TO` ← `IntelligenceProfile.reasoningSummary` _(ProfileField)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.positioning` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `CONTRIBUTES_TO` ← `IntelligenceProfile.positioningSummary` _(ProfileField)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.confidence` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `deriveConfidence` _(Function)_
  - `SYNTHESIZES` ← `deriveConfidence` _(Function)_

###### `CognitionContext.knowledge` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `CONTRIBUTES_TO` ← `IntelligenceProfile.knowledgeSummary` _(ProfileField)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.visualIdentity` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_

## Pipeline Stage Sequencing (graph-derived)

Each pipeline below is a hand-declared *stage ordering* (the sequence is architectural intent, not discoverable purely from CALLS edges — the stages are decoupled via the event bus, not direct method calls), cross-checked against the graph for what real CALLS/EMITS/CONSUMES/DEPENDS_ON edges exist between consecutive stages. Where no direct edge exists between two adjacent stages, that's called out explicitly rather than silently implied — it usually means the handoff is event-bus- mediated (see `.context/architecture-intelligence/event_relationships.generated.md`).

### Learning Pipeline

#### 1. `SignalExtractor`

- **→ Next stage (`EvidenceExtractor`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 2. `EvidenceExtractor`

- **→ Next stage (`ObservationBuilder`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 3. `ObservationBuilder`

- **→ Next stage (`HypothesisEngine`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 4. `HypothesisEngine`

- **→ Next stage (`LearningValidator`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 5. `LearningValidator`

- **→ Next stage (`FeedbackProcessor`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 6. `FeedbackProcessor`

- **Emits:** `intelligence.signal.extracted`, `intelligence.learning.validated`
- **Consumes:** `intelligence.artifact.feedback`, `intelligence.user.correction`, `intelligence.signal.extracted`
- **→ Next stage (`ProfileBuilder`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 7. `ProfileBuilder`

- **Emits:** `intelligence.profile.updated`

### Knowledge Pipeline

#### 1. `KnowledgeProcessor`

- **Emits:** `intelligence.signal.extracted`
- **Consumes:** `intelligence.knowledge_asset.uploaded`
- **→ Next stage (`KnowledgeValidator`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 2. `KnowledgeValidator`

- **→ Next stage (`KnowledgeIntelligenceDomain`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 3. `KnowledgeIntelligenceDomain`

- **Owns:** `intelligence.knowledge_assets`
- **→ Next stage (`ProfileBuilder`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 4. `ProfileBuilder`

- **Emits:** `intelligence.profile.updated`
- **→ Next stage (`ContextBuilder`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 5. `ContextBuilder`


### Evidence Bridge (ADR-005, Knowledge → Learning Pipeline)

#### 1. `KnowledgeAssetEvidenceAdapter`

_(class not found in graph)_

#### 2. `EvidenceExtractor`

- **→ Next stage (`ObservationBuilder`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 3. `ObservationBuilder`

- **→ Next stage (`HypothesisEngine`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 4. `HypothesisEngine`

- **→ Next stage (`LearningValidator`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 5. `LearningValidator`


### Identity Pipeline

#### 1. `ProfileBuilder`

- **Emits:** `intelligence.profile.updated`
- **→ Next stage (`ContextBuilder`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 2. `ContextBuilder`


### Cognition (request) Pipeline

#### 1. `CognitionProviderImpl`

- **→ Next stage (`ContextBuilder`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. `IntelligenceOS`).

#### 2. `ContextBuilder`

## Context Builder

Milestone 2 (CognitionProvider integration layer), generalized by ADR-003 (Subject-Centric Intelligence).

### Constructor dependencies (what it reads from)

`constructor(private readonly workspace: WorkspaceIntelligenceDomain, /** ADR-004 (Cognitive Consolidation) §8 — the one new dependency this class gained, for the `knowledge`/`reasoning`/`positioning` profile read. */ private readonly userDomain: UserIntelligenceDomain)`

### `CognitionContext` field origins (parsed from the live `return {}` in `build()`)

| Field | Can be null / fallback? | Origin expression |
|---|---|---|
| `contractVersion` | no (always populated) | `COGNITION_CONTRACT_VERSION` |
| `workspaceId` | no (always populated) | `workspaceId` |
| `resolvedAt` | no (always populated) | `new Date().toISOString()` |
| `confidence` | no (always populated) | `deriveConfidence(learnings)` |
| `voice` | no (always populated) | `voice` |
| `identity` | no (always populated) | `applyIdentityConfiguration(deriveIdentityContribution(learnings), workspaceContext.identityConfiguration)` |
| `visualIdentity` | yes | `null` |
| `provenance` | no (always populated) | `{         signalCount: learnings.length,         lastConsolidatedAt: deriveLastConsolidatedAt(learnings),       }` |
| `knowledge` | yes | `((): CognitionKnowledgeSection \| null => {         const projected = projectSynthesizedCollection(           profile?.knowledgeSummary ?? null,           v => ({ name: v.name, description: v.description }),         );...` |
| `reasoning` | yes | `((): CognitionReasoningSection \| null => {         const projected = projectSynthesizedCollection(           profile?.reasoningSummary ?? null,           v => ({ statement: v.statement }),         );         return pr...` |
| `positioning` | yes | `((): CognitionPositioningSection \| null => {         const projected = projectSynthesizedCollection(           profile?.positioningSummary ?? null,           v => ({ statement: v.statement }),         );         retur...` |

### Which modules contribute

| Module | Contributes |
|---|---|
| `context/voiceMapping.ts` (`deriveVoiceProfile`, `deriveConfidence`, `deriveLastConsolidatedAt`) | `voice` (pre-workspace-override), `confidence`, `provenance.lastConsolidatedAt` |
| `context/identitySynthesis.ts` (`deriveIdentityContribution`) | `identity` (pre-workspace-override) |
| Workspace-declared `voiceConfiguration` / `identityConfiguration` (Knowledge, ADR-003 §2.4) | overrides applied on top of the two rows above, via `applyVoiceConfiguration` / `applyIdentityConfiguration` |
| `IntelligenceProfile.knowledgeSummary` / `.reasoningSummary` / `.positioningSummary` (via `projectSynthesizedCollection`) | `knowledge`, `reasoning`, `positioning` |
| _(not implemented)_ | `visualIdentity` — hard-coded `null` |

### Null / fallback logic

A field is `null` whenever its upstream Profile field is `null` (a Subject with no confirmed Learnings/Knowledge yet) — this is a deliberate, documented "honest null" per this file's own header docblock, not an error state. `resolveCognitionContext` never throws for a new-subject case; it returns a complete `CognitionContext` shape with some sections `null`.


#### CognitionContext / IntelligenceProfile fields — graph relationships

_Graph-derived relationship ledger (from the Architecture Knowledge Graph) — see `architecture.generated.json`._

Every `CognitionContext` field (`ContextField` node) and every `IntelligenceProfile` field (`ProfileField` node), and what BUILDS/CONTRIBUTES_TO/SYNTHESIZES them. A field with an "Incoming" CONTRIBUTES_TO edge from a `ProfileField` traces one hop further back into `.context/profile_model.generated.md`; a field with no incoming edges at all besides `BUILDS` is either a pure literal (`contractVersion`, `resolvedAt`) or, like `visualIdentity`, has no implemented contributor — see `.context/repository_health.generated.md`.

Graph nodes covered: **31** (types: ContextField, ProfileField).

###### `CognitionContext.confidence` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `deriveConfidence` _(Function)_
  - `SYNTHESIZES` ← `deriveConfidence` _(Function)_

###### `CognitionContext.contractVersion` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_

###### `CognitionContext.identity` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `deriveIdentityContribution` _(Function)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `SYNTHESIZES` ← `deriveIdentityContribution` _(Function)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.knowledge` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `CONTRIBUTES_TO` ← `IntelligenceProfile.knowledgeSummary` _(ProfileField)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.positioning` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `CONTRIBUTES_TO` ← `IntelligenceProfile.positioningSummary` _(ProfileField)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.provenance` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `deriveLastConsolidatedAt` _(Function)_
  - `SYNTHESIZES` ← `deriveLastConsolidatedAt` _(Function)_

###### `CognitionContext.reasoning` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `CONTRIBUTES_TO` ← `IntelligenceProfile.reasoningSummary` _(ProfileField)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.resolvedAt` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_

###### `CognitionContext.visualIdentity` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_

###### `CognitionContext.voice` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_
  - `CONTRIBUTES_TO` ← `deriveVoiceProfile` _(Function)_
  - `CONTRIBUTES_TO` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_
  - `SYNTHESIZES` ← `deriveVoiceProfile` _(Function)_
  - `SYNTHESIZES` ← `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

###### `CognitionContext.workspaceId` _(ContextField)_

- **Location:** `packages/intelligence-os/src/context/ContextBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ContextBuilder.build` _(Method)_

###### `IntelligenceProfile.archetypeConfidence` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.archetypePrimary` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.compositeConfidence` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.constraintSummary` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.createdAt` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.expertiseDomains` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.goalSummary` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.id` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.isCurrent` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.knowledgeSummary` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Outgoing:**
  - `CONTRIBUTES_TO` → `CognitionContext.knowledge` _(ContextField)_
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.positioningSummary` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Outgoing:**
  - `CONTRIBUTES_TO` → `CognitionContext.positioning` _(ContextField)_
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.preferenceSummary` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.reasoningSummary` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Outgoing:**
  - `CONTRIBUTES_TO` → `CognitionContext.reasoning` _(ContextField)_
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.subjectType` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.updatedAt` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.userId` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.version` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.vocabularySnapshot` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.voiceSummary` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_
  - `CONTRIBUTES_TO` ← `ProfileBuilder.rebuildForSubject` _(Method)_

###### `IntelligenceProfile.workspaceId` _(ProfileField)_

- **Location:** `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`
- **Incoming:**
  - `BUILDS` ← `ProfileBuilder.rebuildForSubject` _(Method)_

## Profile Model

Stage 6 of the Learning Pipeline.

### `IntelligenceProfile` field origins (parsed from the live `newProfile` literal in `rebuildForSubject()`)

| Field | Origin expression |
|---|---|
| `id` | `crypto.randomUUID()` |
| `userId` | `subject.subjectType === 'user' ? subject.subjectId : null` |
| `workspaceId` | `subject.subjectType === 'workspace' ? subject.subjectId : null` |
| `subjectType` | `subject.subjectType` |
| `version` | `nextVersion` |
| `isCurrent` | `true` |
| `compositeConfidence` | `compositeConfidence` |
| `archetypePrimary` | `currentProfile?.archetypePrimary ?? null` |
| `archetypeConfidence` | `currentProfile?.archetypeConfidence ?? null` |
| `voiceSummary` | `summaries.voice` |
| `goalSummary` | `summaries.goals` |
| `constraintSummary` | `summaries.constraints` |
| `preferenceSummary` | `summaries.preferences` |
| `expertiseDomains` | `summaries.expertise` |
| `vocabularySnapshot` | `summaries.vocabulary` |
| `knowledgeSummary` | `summaries.knowledge` |
| `reasoningSummary` | `summaries.reasoning` |
| `positioningSummary` | `summaries.positioning` |
| `createdAt` | `new Date()` |
| `updatedAt` | `new Date()` |

### What triggers a rebuild

- `shouldRebuild(userId: string, newLearning: Learning)` — Evaluates whether a profile rebuild is needed for the given user, considering the newly created Learning and the current profile state.
- `shouldRebuildForSubject(subject: SubjectRef, newLearning: Learning)` — ADR-003 (Subject-Centric Intelligence) — evaluates whether a profile rebuild is needed for any Subject (User or Workspace), considering the newly created Learning and the current profile state.
- `shouldRebuildForSubjectFromKnowledge(subject: SubjectRef, changedKnowledgeAssetId: string)` — ADR-004 (Cognitive Consolidation) §12.2 — evaluates whether a profile rebuild is needed in response to a new/changed `isCurrent` `KnowledgeAsset` for the given Subject.

### How rebuild occurs

`rebuildForSubject(subject, changedDomains)` reads all active Learnings and current Knowledge assets for the subject plus the current profile (for version/archetype carry-forward), computes `compositeConfidence` and per-domain `summaries` (`buildDomainSummaries`), assembles the fields above, persists via `userDomain.upsertProfile(newProfile)`, and emits `intelligence.profile.updated`.

`archetypePrimary` / `archetypeConfidence` are the two fields NOT recomputed on every rebuild — they are carried forward from `currentProfile` unchanged, meaning archetype assignment has its own, separate trigger elsewhere (outside `ProfileBuilder`).

## Domain Ownership

This is the persistence boundary of IntelligenceOS: every `intelligence.*` Postgres table has exactly one owning Domain class in `packages/intelligence-os/src/domains/`, mechanically enforced by `RULE-PIPELINE-NO-DIRECT-DB` in `packages/intelligence-os/scripts/check-boundaries.mjs` (no `pipeline/`, `knowledge/`, `blueprint/`, or `context/` file may import `@supabase/supabase-js` directly).

### `ArtifactIntelligenceDomain`

- **File:** `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts`
- **Owns (declared):** intelligence.artifact_patterns, intelligence.artifact_exemplars, intelligence.feedback_events, intelligence.artifact_blueprints
- **Public API surface (6 methods):**

  - `async getPattern(artifactType: string, userId?: string, archetypeType?: string): Promise<ArtifactPattern | null>` — Loads the best available artifact pattern for a given type.
  - `async recordFeedbackEvent(event: FeedbackEvent): Promise<FeedbackEventRecord>` — Persists a FeedbackEvent from BrandOS to intelligence.feedback_events.
  - `async markSignalsExtracted(artifactId: string, userId: string): Promise<void>` — Marks the most recent unprocessed feedback_events row for an artifact as signals_extracted = true.
  - `async promoteExemplar(_input: ArtifactExemplarInput): Promise<ArtifactExemplar>` — Promotes a deployed or praised artifact to an exemplar.
  - `async persistBlueprint(blueprint: ArtifactBlueprint): Promise<void>` — Persists a blueprint for audit and feedback correlation.
  - `async countArtifactsWithNamedRecipients(userId: string): Promise<number>` — Counts persisted `artifact_blueprints` rows for a user whose `audience_calibration` was resolved for a named recipient (`AudienceCalibration.isNamedRelationship === true`) — the "external artifacts with named recipients" half of `RelationshipIntelligenceDomain`'s Phase 2 activation trigger (Contracts §J.3: "User generates ≥3 external artifacts; named recipients appear consistently").

- **Imported by (readers/writers of this domain's data, one level removed):**
  - `packages/intelligence-os/src/IntelligenceOS.ts`
  - `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`
  - `packages/intelligence-os/src/blueprint/StructurePlanner.ts`
  - `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts`
  - `packages/intelligence-os/src/domains/index.ts`
  - `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`

- **Forbidden access:** no other `domains/*.ts` file, and no `pipeline/`, `knowledge/`, `blueprint/`, or `context/` file, may hold a `SupabaseClient` or query these tables directly — all access must go through the methods above.

### `KnowledgeIntelligenceDomain`

- **File:** `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`
- **Owns (declared):** intelligence.knowledge_assets No other domain may write to this table.
- **Public API surface (7 methods):**

  - `async getAssets(filter: KnowledgeAssetFilter): Promise<KnowledgeAsset[]>` — Returns knowledge assets matching the given filter.
  - `async getCurrentAssetsForSubject(subject: SubjectRef): Promise<KnowledgeAsset[]>` — ADR-004 (Cognitive Consolidation) §2.1 — Subject-generic counterpart to `getAssets()`, mirroring the `...ForSubject` convention ADR-003 established on `UserIntelligenceDomain`.
  - `async getAssetById(id: string): Promise<KnowledgeAsset | null>` — Returns a single knowledge asset by id, or null if not found.
  - `async requireAsset(id: string): Promise<KnowledgeAsset>` — Returns an asset by id, throwing EntityNotFoundError if it doesn't exist.
  - `async ingestAsset(_input: KnowledgeAssetInput): Promise<string>` — Ingests a knowledge asset (upload → extract vocabulary/patterns/frameworks).
  - `async persistExtracted(input: KnowledgeAssetUpsertInput): Promise<KnowledgeAsset>` — Persists a fully-extracted knowledge asset (upsert by id).
  - `async upsertWorkspaceConfiguration(input: WorkspaceConfigurationInput): Promise<string>` — ADR-003 (Subject-Centric Intelligence) §2.4 — persists explicit, admin-declared workspace configuration (a persona/brand-voice override, compliance requirements) as a `KnowledgeAsset` (`ownerType: 'workspace'`, `assetType: 'reference'`), not a `Learning`.

- **Imported by (readers/writers of this domain's data, one level removed):**
  - `packages/intelligence-os/src/IntelligenceOS.ts`
  - `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`
  - `packages/intelligence-os/src/blueprint/ProjectContextBuilder.ts`
  - `packages/intelligence-os/src/domains/index.ts`
  - `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`
  - `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`
  - `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`

- **Forbidden access:** no other `domains/*.ts` file, and no `pipeline/`, `knowledge/`, `blueprint/`, or `context/` file, may hold a `SupabaseClient` or query these tables directly — all access must go through the methods above.

### `ProjectIntelligenceDomain`

- **File:** `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts`
- **Owns (declared):** intelligence.projects No other domain may write to this table.
- **Public API surface (6 methods):**

  - `async getProject(projectId: string): Promise<Project | null>` — Returns a project by its intelligence-os id, or null if not found.
  - `async getProjectByBrandosId(brandosProjectId: string): Promise<Project | null>` — Returns the intelligence project correlated to a BrandOS project id, or null if no correlation exists yet.
  - `async getActiveProjects(userId: string): Promise<Project[]>` — Lists all active projects for a user.
  - `async upsertProject(input: ProjectInput): Promise<string>` — Creates or updates an intelligence project record.
  - `async updateLifecycleState(_projectId: string, _state: Project['lifecycleState']): Promise<void>` — Transitions a project's lifecycle state.
  - `async requireProject(projectId: string): Promise<Project>` — Returns a project by id, throwing EntityNotFoundError if it doesn't exist.

- **Imported by (readers/writers of this domain's data, one level removed):**
  - `packages/intelligence-os/src/IntelligenceOS.ts`
  - `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`
  - `packages/intelligence-os/src/blueprint/ProjectContextBuilder.ts`
  - `packages/intelligence-os/src/domains/index.ts`

- **Forbidden access:** no other `domains/*.ts` file, and no `pipeline/`, `knowledge/`, `blueprint/`, or `context/` file, may hold a `SupabaseClient` or query these tables directly — all access must go through the methods above.

### `RelationshipIntelligenceDomain`

- **File:** `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts`
- **Owns (declared):** intelligence.relationships, intelligence.audience_profiles (named rows)
- **Public API surface (6 methods):**

  - `async checkActivationTrigger(userId: string, artifactDomain: ArtifactIntelligenceDomain, explicitOnboardingSignal = false): Promise<` — Evaluates whether Contracts §J.3's Phase 2 activation trigger has fired for a user: "≥3 external artifacts with named recipients exist, OR an explicit trigger from user onboarding signals the need." This closes the gap `IMPLEMENTATION_STATUS.md` flagged — "the docblock states an activation trigger, but no code anywhere counts this or flips any switch" — for the *counting* half.
  - `async getRelationship(_relationshipId: string): Promise<Relationship | null>` — Returns a named relationship by id.
  - `async getActiveRelationships(_userId: string): Promise<Relationship[]>` — Returns all active named relationships for a user.
  - `async getNamedAudienceProfile(_relationshipId: string): Promise<AudienceProfile | null>` — Returns the named audience profile for a specific relationship.
  - `async upsertRelationship(_input: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'>): Promise<Relationship>` — Creates or updates a named relationship record.
  - `async markDecayStart(_relationshipId: string): Promise<void>` — Starts the decay clock on a relationship that has gone dormant.

- **Imported by (readers/writers of this domain's data, one level removed):**
  - `packages/intelligence-os/src/IntelligenceOS.ts`
  - `packages/intelligence-os/src/domains/index.ts`

- **Forbidden access:** no other `domains/*.ts` file, and no `pipeline/`, `knowledge/`, `blueprint/`, or `context/` file, may hold a `SupabaseClient` or query these tables directly — all access must go through the methods above.

### `UserIntelligenceDomain`

- **File:** `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`
- **Owns (declared):** intelligence.profiles, intelligence.learnings, intelligence.archetypes, intelligence.hypotheses No other domain may write to these tables.
- **Public API surface (28 methods):**

  - `async getCurrentProfile(userId: string): Promise<IntelligenceProfile | null>` — Returns the current (is_current = true) intelligence profile for a user, or null if no profile has been built yet (new user, pre-onboarding).
  - `async getCurrentProfileForSubject(subject: SubjectRef): Promise<IntelligenceProfile | null>` — ADR-003 (Subject-Centric Intelligence) — returns the current (is_current = true) intelligence profile for any Subject (User or Workspace), or null if none has been built yet.
  - `async getActiveLearnings(userId: string, domain: DomainType, categories?: TaxonomyCategory[]): Promise<Learning[]>` — Returns active learnings for a user in a given domain, optionally filtered by taxonomy category.
  - `async getCurrentArchetype(userId: string): Promise<Archetype | null>` — Returns the primary archetype for a user, or null if none has been assigned yet.
  - `async getGenericAudienceProfile(userId: string, audienceType: string): Promise<import('../types/entities').AudienceProfile | null>` — Returns the generic audience profile for a given audience type.
  - `async upsertProfile(profile: IntelligenceProfile): Promise<void>` — Persists a profile version verbatim (upsert by id) — the caller (Profile Builder) is responsible for computing the next version number, the composite confidence, and the domain summaries, and for generating the row's id; this method's only job is the write.
  - `async markPreviousProfilesNonCurrent(userId: string, excludeId: string): Promise<void>` — Marks every other current profile row for a user as non-current, except the one just inserted via `upsertProfile()`.
  - `async markPreviousProfilesNonCurrentForSubject(subject: SubjectRef, excludeId: string): Promise<void>` — ADR-003 (Subject-Centric Intelligence) — marks every other current profile row for any Subject (User or Workspace) as non-current, except the one just inserted via `upsertProfile()`.
  - `async getAllActiveLearnings(userId: string): Promise<Learning[]>` — Returns every active-state Learning for a user across ALL domains (unlike `getActiveLearnings()`, which requires a single `DomainType` filter).
  - `async getAllActiveLearningsForSubject(subject: SubjectRef): Promise<Learning[]>` — ADR-003 (Subject-Centric Intelligence) — returns every active-state Learning for any Subject (User or Workspace) across all domains.
  - `async countLearningsSince(userId: string, since: Date, minConfidence: number): Promise<number>` — Counts active-state Learnings at or above a confidence floor, created since a given timestamp — the exact query `ProfileBuilder.shouldRebuild()` needs to evaluate the "> 3 high-confidence Learnings since last rebuild" trigger (Contracts B.2).
  - `async countLearningsSinceForSubject(subject: SubjectRef, since: Date, minConfidence: number): Promise<number>` — ADR-003 (Subject-Centric Intelligence) — counts active-state Learnings for any Subject (User or Workspace) at or above a confidence floor, created since a given timestamp.
  - `async insertLearning(learning: Omit<Learning, 'id' | 'createdAt' | 'updatedAt'>): Promise<Learning>` — Inserts a new validated learning.
  - `async getLatestValidatedLearning(userId: string, taxonomyCategory: TaxonomyCategory): Promise<Learning | null>` — Returns the most recent VALIDATED Learning for a user + taxonomy category, or null if none exists.
  - `async confirmLearning(learningId: string, confidence: number): Promise<void>` — Upgrades a VALIDATED learning to CONFIRMED with a boosted confidence.
  - `async findOpenHypothesis(userId: string, taxonomyCategory: TaxonomyCategory, contextScope: string): Promise<Hypothesis | null>` — Finds the most recent open (PROVISIONAL/ACCUMULATING/CHALLENGED) Hypothesis for a user + taxonomy category + context scope, or null.
  - `async findOpenHypothesisForSubject(subject: SubjectRef, taxonomyCategory: TaxonomyCategory, contextScope: string): Promise<Hypothesis | null>` — ADR-003 (Subject-Centric Intelligence) — finds the most recent open Hypothesis for any Subject (User or Workspace) + taxonomy category + context scope, or null.
  - `async createHypothesis(payload: Record<string, unknown>): Promise<Hypothesis>` — Creates a new Hypothesis row from a fully-formed insert payload (already snake_case — `HypothesisEngine` builds this from its own pure `PROVISIONAL`-initialization logic, which is business logic this domain does not duplicate).
  - `async createHypothesisForSubject(payload: Record<string, unknown>): Promise<Hypothesis>` — ADR-003 (Subject-Centric Intelligence) — see `createHypothesis()`'s docblock.
  - `async updateHypothesis(hypothesisId: string, updates: Record<string, unknown>): Promise<Hypothesis>` — Applies a partial update (already snake_case — computed by `HypothesisEngine`'s pure corroboration/contradiction logic) to an existing Hypothesis and returns the updated row.
  - `async markHypothesisPromoted(hypothesisId: string, learningId: string): Promise<void>` — Marks a Hypothesis as promoted to a Learning.
  - `async discardExpiredHypotheses(userId: string): Promise<number>` — Discards expired, non-permanent PROVISIONAL/ACCUMULATING hypotheses for a user (timeout > 30 days — Schema D.1 Stage 4).
  - `async discardExpiredHypothesesForSubject(subject: SubjectRef): Promise<number>` — ADR-003 (Subject-Centric Intelligence) — discards expired, non-permanent PROVISIONAL/ACCUMULATING hypotheses for any Subject (User or Workspace).
  - `async reviewLearning(userId: string, learningId: string, approved: boolean, reviewedBy: string): Promise<` — Transitions a FLAGGED learning to ACTIVE (approved=true) or ARCHIVED (approved=false).
  - `async reviewLearningForWorkspace(workspaceId: string, entryId: string, approved: boolean, reviewedBy: string): Promise<` — Workspace-scoped variant of `reviewLearning`, for CognitionProvider's `review()` operation, which has no userId to check ownership against.
  - `async fetchLearningForReview(learningId: string): Promise<` — Shared fetch step for both review paths — fetches by id only (no ownership filter), so the caller can distinguish not-found from wrong-owner and choose the appropriate error.
  - `async countActiveLearnings(userId: string, workspaceId?: string): Promise<number>` — Counts learnings in active states (ACTIVE, CONFIRMED, VALIDATED) for a user, optionally scoped to a workspace.
  - `async getTopTaxonomyCategories(userId: string, limit = 3): Promise<string[]>` — Returns the top N taxonomy categories by learning count for a user.

- **Imported by (readers/writers of this domain's data, one level removed):**
  - `packages/intelligence-os/src/IntelligenceOS.ts`
  - `packages/intelligence-os/src/api/CognitionProviderImpl.ts`
  - `packages/intelligence-os/src/blueprint/AudienceCalibrator.ts`
  - `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`
  - `packages/intelligence-os/src/blueprint/ProjectContextBuilder.ts`
  - `packages/intelligence-os/src/context/ContextBuilder.ts`
  - `packages/intelligence-os/src/domains/index.ts`
  - `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts`
  - `packages/intelligence-os/src/pipeline/HypothesisEngine.ts`
  - `packages/intelligence-os/src/pipeline/LearningValidator.ts`
  - `packages/intelligence-os/src/pipeline/ProfileBuilder.ts`

- **Forbidden access:** no other `domains/*.ts` file, and no `pipeline/`, `knowledge/`, `blueprint/`, or `context/` file, may hold a `SupabaseClient` or query these tables directly — all access must go through the methods above.

### `WorkspaceIntelligenceDomain`

- **File:** `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`
- **Owns (declared):** workspace-scoped intelligence (compliance constraints, shared vocabulary). Reads knowledge assets with owner_type = 'workspace'.
- **Public API surface (5 methods):**

  - `async getContext(workspaceId: string): Promise<WorkspaceContext>` — Returns the workspace intelligence context used by ConflictResolutionModel to enforce the Immutability Rule (compliance constraints are never overridden), and — ADR-003 (Subject-Centric Intelligence) §2.4 — by `context/ContextBuilder.ts` to apply explicit, admin-declared voice configuration ahead of Learning- derived voice.
  - `async enforceComplianceConstraints(_workspaceId: string, _projectIds: string[]): Promise<void>` — Enforces workspace-level compliance constraints across all active projects.
  - `async syncSharedVocabulary(_workspaceId: string): Promise<void>` — Synchronises shared vocabulary across all workspace members.
  - `async getWorkspaceLearnings(workspaceId: string, domain?: DomainType): Promise<Learning[]>` — Returns workspace-level learnings, optionally filtered by Intelligence Domain.
  - `async upsertWorkspaceLearning(input: WorkspaceLearningInput): Promise<string>` — Upserts a workspace-level inferred style learning.

- **Imported by (readers/writers of this domain's data, one level removed):**
  - `packages/intelligence-os/src/IntelligenceOS.ts`
  - `packages/intelligence-os/src/api/CognitionProviderImpl.ts`
  - `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`
  - `packages/intelligence-os/src/blueprint/ProjectContextBuilder.ts`
  - `packages/intelligence-os/src/context/ContextBuilder.ts`
  - `packages/intelligence-os/src/domains/index.ts`

- **Forbidden access:** no other `domains/*.ts` file, and no `pipeline/`, `knowledge/`, `blueprint/`, or `context/` file, may hold a `SupabaseClient` or query these tables directly — all access must go through the methods above.

### Table-level access ledger (mechanically extracted call sites)

| Table | Writers (file:line, op) | Readers (file:line, op) |
|---|---|---|
| `intelligence.archetypes` | _(none found)_ | `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:323 (select)` |
| `intelligence.artifact_blueprints` | `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts:254 (insert)` | `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts:309 (select)` |
| `intelligence.artifact_patterns` | _(none found)_ | `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts:131 (select)` |
| `intelligence.audience_profiles` | _(none found)_ | `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:350 (select)` |
| `intelligence.feedback_events` | `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts:185 (insert)`<br>`packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts:212 (update)` | _(none found)_ |
| `intelligence.hypotheses` | `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:711 (insert)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:733 (update)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:750 (update)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:784 (update)` | `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:675 (select)` |
| `intelligence.knowledge_assets` | `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts:231 (upsert)` | `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts:122 (select)`<br>`packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts:171 (select)`<br>`packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts:134 (select)` |
| `intelligence.learnings` | `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:585 (insert)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:627 (update)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:926 (update)`<br>`packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts:285 (insert)` | `packages/intelligence-os/src/api/HealthChecker.ts:23 (select)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:298 (select)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:509 (select)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:540 (select)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:606 (select)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:881 (select)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:948 (select)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:973 (select)`<br>`packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts:226 (select)` |
| `intelligence.profiles` | `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:429 (upsert)`<br>`packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:471 (update)` | `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts:274 (select)` |
| `intelligence.projects` | `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts:134 (upsert)`<br>`packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts:146 (insert)` | `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts:70 (select)`<br>`packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts:86 (select)`<br>`packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts:101 (select)` |


#### Domains — graph relationships

_Graph-derived relationship ledger (from the Architecture Knowledge Graph) — see `architecture.generated.json`._

Every `Domain` node's persistence relationships, projected from the Architecture Knowledge Graph. See `.context/domain_ownership.generated.md` (Phase 1) for the narrative version of the same facts.

Graph nodes covered: **6** (types: Domain).

###### `ArtifactIntelligenceDomain` _(Domain)_

- **Location:** `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts`:108
- **Outgoing:**
  - `OWNS` → `intelligence.artifact_blueprints` _(Table)_
  - `OWNS` → `intelligence.artifact_exemplars` _(Table)_
  - `OWNS` → `intelligence.artifact_patterns` _(Table)_
  - `OWNS` → `intelligence.feedback_events` _(Table)_
  - `PERSISTS` → `intelligence.artifact_blueprints` _(Table)_
  - `PERSISTS` → `intelligence.feedback_events` _(Table)_
  - `PERSISTS` → `intelligence.feedback_events` _(Table)_
  - `READS` → `intelligence.artifact_blueprints` _(Table)_
  - `READS` → `intelligence.artifact_patterns` _(Table)_
  - `WRITES` → `intelligence.artifact_blueprints` _(Table)_
  - `WRITES` → `intelligence.feedback_events` _(Table)_
  - `WRITES` → `intelligence.feedback_events` _(Table)_
- **Incoming:**
  - `USES` ← `ArtifactIntelligenceDomain.countArtifactsWithNamedRecipients` _(Method)_
  - `USES` ← `ArtifactIntelligenceDomain.getPattern` _(Method)_
  - `USES` ← `ArtifactIntelligenceDomain.markSignalsExtracted` _(Method)_
  - `USES` ← `ArtifactIntelligenceDomain.persistBlueprint` _(Method)_
  - `USES` ← `ArtifactIntelligenceDomain.promoteExemplar` _(Method)_
  - `USES` ← `ArtifactIntelligenceDomain.recordFeedbackEvent` _(Method)_

###### `KnowledgeIntelligenceDomain` _(Domain)_

- **Location:** `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts`:110
- **Outgoing:**
  - `OWNS` → `intelligence.knowledge_assets` _(Table)_
  - `PERSISTS` → `intelligence.knowledge_assets` _(Table)_
  - `READS` → `intelligence.knowledge_assets` _(Table)_
  - `READS` → `intelligence.knowledge_assets` _(Table)_
  - `WRITES` → `intelligence.knowledge_assets` _(Table)_
- **Incoming:**
  - `USES` ← `KnowledgeIntelligenceDomain.getAssetById` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.getAssets` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.getCurrentAssetsForSubject` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.ingestAsset` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.persistExtracted` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.requireAsset` _(Method)_
  - `USES` ← `KnowledgeIntelligenceDomain.upsertWorkspaceConfiguration` _(Method)_

###### `ProjectIntelligenceDomain` _(Domain)_

- **Location:** `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts`:62
- **Outgoing:**
  - `OWNS` → `intelligence.projects` _(Table)_
  - `PERSISTS` → `intelligence.projects` _(Table)_
  - `PERSISTS` → `intelligence.projects` _(Table)_
  - `READS` → `intelligence.projects` _(Table)_
  - `READS` → `intelligence.projects` _(Table)_
  - `READS` → `intelligence.projects` _(Table)_
  - `WRITES` → `intelligence.projects` _(Table)_
  - `WRITES` → `intelligence.projects` _(Table)_
- **Incoming:**
  - `USES` ← `ProjectIntelligenceDomain.getActiveProjects` _(Method)_
  - `USES` ← `ProjectIntelligenceDomain.getProject` _(Method)_
  - `USES` ← `ProjectIntelligenceDomain.getProjectByBrandosId` _(Method)_
  - `USES` ← `ProjectIntelligenceDomain.requireProject` _(Method)_
  - `USES` ← `ProjectIntelligenceDomain.updateLifecycleState` _(Method)_
  - `USES` ← `ProjectIntelligenceDomain.upsertProject` _(Method)_

###### `RelationshipIntelligenceDomain` _(Domain)_

- **Location:** `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts`:43
- **Outgoing:**
  - `OWNS` → `intelligence.audience_profiles` _(Table)_
  - `OWNS` → `intelligence.relationships` _(Table)_
- **Incoming:**
  - `USES` ← `RelationshipIntelligenceDomain.checkActivationTrigger` _(Method)_
  - `USES` ← `RelationshipIntelligenceDomain.getActiveRelationships` _(Method)_
  - `USES` ← `RelationshipIntelligenceDomain.getNamedAudienceProfile` _(Method)_
  - `USES` ← `RelationshipIntelligenceDomain.getRelationship` _(Method)_
  - `USES` ← `RelationshipIntelligenceDomain.markDecayStart` _(Method)_
  - `USES` ← `RelationshipIntelligenceDomain.upsertRelationship` _(Method)_

###### `UserIntelligenceDomain` _(Domain)_

- **Location:** `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`:251
- **Outgoing:**
  - `OWNS` → `intelligence.archetypes` _(Table)_
  - `OWNS` → `intelligence.hypotheses` _(Table)_
  - `OWNS` → `intelligence.learnings` _(Table)_
  - `OWNS` → `intelligence.profiles` _(Table)_
  - `PERSISTS` → `intelligence.hypotheses` _(Table)_
  - `PERSISTS` → `intelligence.hypotheses` _(Table)_
  - `PERSISTS` → `intelligence.hypotheses` _(Table)_
  - `PERSISTS` → `intelligence.hypotheses` _(Table)_
  - `PERSISTS` → `intelligence.learnings` _(Table)_
  - `PERSISTS` → `intelligence.learnings` _(Table)_
  - `PERSISTS` → `intelligence.learnings` _(Table)_
  - `PERSISTS` → `intelligence.profiles` _(Table)_
  - `PERSISTS` → `intelligence.profiles` _(Table)_
  - `READS` → `intelligence.archetypes` _(Table)_
  - `READS` → `intelligence.audience_profiles` _(Table)_
  - `READS` → `intelligence.hypotheses` _(Table)_
  - `READS` → `intelligence.learnings` _(Table)_
  - `READS` → `intelligence.learnings` _(Table)_
  - `READS` → `intelligence.learnings` _(Table)_
  - `READS` → `intelligence.learnings` _(Table)_
  - `READS` → `intelligence.learnings` _(Table)_
  - `READS` → `intelligence.learnings` _(Table)_
  - `READS` → `intelligence.learnings` _(Table)_
  - `READS` → `intelligence.profiles` _(Table)_
  - `WRITES` → `intelligence.hypotheses` _(Table)_
  - `WRITES` → `intelligence.hypotheses` _(Table)_
  - `WRITES` → `intelligence.hypotheses` _(Table)_
  - `WRITES` → `intelligence.hypotheses` _(Table)_
  - `WRITES` → `intelligence.learnings` _(Table)_
  - `WRITES` → `intelligence.learnings` _(Table)_
  - `WRITES` → `intelligence.learnings` _(Table)_
  - `WRITES` → `intelligence.profiles` _(Table)_
  - `WRITES` → `intelligence.profiles` _(Table)_
- **Incoming:**
  - `USES` ← `UserIntelligenceDomain.confirmLearning` _(Method)_
  - `USES` ← `UserIntelligenceDomain.countActiveLearnings` _(Method)_
  - `USES` ← `UserIntelligenceDomain.countLearningsSince` _(Method)_
  - `USES` ← `UserIntelligenceDomain.countLearningsSinceForSubject` _(Method)_
  - `USES` ← `UserIntelligenceDomain.createHypothesis` _(Method)_
  - `USES` ← `UserIntelligenceDomain.createHypothesisForSubject` _(Method)_
  - `USES` ← `UserIntelligenceDomain.discardExpiredHypotheses` _(Method)_
  - `USES` ← `UserIntelligenceDomain.discardExpiredHypothesesForSubject` _(Method)_
  - `USES` ← `UserIntelligenceDomain.fetchLearningForReview` _(Method)_
  - `USES` ← `UserIntelligenceDomain.findOpenHypothesis` _(Method)_
  - `USES` ← `UserIntelligenceDomain.findOpenHypothesisForSubject` _(Method)_
  - `USES` ← `UserIntelligenceDomain.getActiveLearnings` _(Method)_
  - `USES` ← `UserIntelligenceDomain.getAllActiveLearnings` _(Method)_
  - `USES` ← `UserIntelligenceDomain.getAllActiveLearningsForSubject` _(Method)_
  - `USES` ← `UserIntelligenceDomain.getCurrentArchetype` _(Method)_
  - `USES` ← `UserIntelligenceDomain.getCurrentProfile` _(Method)_
  - `USES` ← `UserIntelligenceDomain.getCurrentProfileForSubject` _(Method)_
  - `USES` ← `UserIntelligenceDomain.getGenericAudienceProfile` _(Method)_
  - `USES` ← `UserIntelligenceDomain.getLatestValidatedLearning` _(Method)_
  - `USES` ← `UserIntelligenceDomain.getTopTaxonomyCategories` _(Method)_
  - `USES` ← `UserIntelligenceDomain.insertLearning` _(Method)_
  - `USES` ← `UserIntelligenceDomain.markHypothesisPromoted` _(Method)_
  - `USES` ← `UserIntelligenceDomain.markPreviousProfilesNonCurrent` _(Method)_
  - `USES` ← `UserIntelligenceDomain.markPreviousProfilesNonCurrentForSubject` _(Method)_
  - `USES` ← `UserIntelligenceDomain.reviewLearning` _(Method)_
  - `USES` ← `UserIntelligenceDomain.reviewLearningForWorkspace` _(Method)_
  - `USES` ← `UserIntelligenceDomain.updateHypothesis` _(Method)_
  - `USES` ← `UserIntelligenceDomain.upsertProfile` _(Method)_

###### `WorkspaceIntelligenceDomain` _(Domain)_

- **Location:** `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`:101
- **Outgoing:**
  - `PERSISTS` → `intelligence.learnings` _(Table)_
  - `READS` → `intelligence.knowledge_assets` _(Table)_
  - `READS` → `intelligence.learnings` _(Table)_
  - `WRITES` → `intelligence.learnings` _(Table)_
- **Incoming:**
  - `USES` ← `WorkspaceIntelligenceDomain.enforceComplianceConstraints` _(Method)_
  - `USES` ← `WorkspaceIntelligenceDomain.getContext` _(Method)_
  - `USES` ← `WorkspaceIntelligenceDomain.getWorkspaceLearnings` _(Method)_
  - `USES` ← `WorkspaceIntelligenceDomain.syncSharedVocabulary` _(Method)_
  - `USES` ← `WorkspaceIntelligenceDomain.upsertWorkspaceLearning` _(Method)_

## Database Context

Authoritative schema: `packages/intelligence-os/src/db/schema.sql` (13 tables in the `intelligence` schema). Every table is owned by exactly one Domain class — see the "Domain Ownership" section of `architecture.generated.md` for the ownership map and live call sites.

### Tables

#### `intelligence.profiles`

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `version` | INTEGER |
| `is_current` | BOOLEAN |
| `composite_confidence` | NUMERIC(4,3) |
| `archetype_primary` | TEXT |
| `archetype_confidence` | — |
| `goal_summary` | JSONB |
| `preference_summary` | JSONB |
| `expertise_domains` | JSONB |
| `vocabulary_snapshot` | JSONB |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

#### `intelligence.archetypes`

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `archetype_type` | TEXT |
| `confidence` | NUMERIC(4,3) |
| `is_primary` | BOOLEAN |
| `evidence_summary` | JSONB |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

#### `intelligence.learnings`

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `taxonomy_category` | TEXT |
| `state` | TEXT |
| `confidence` | NUMERIC(4,3) |
| `context_scope` | TEXT |
| `context_artifact_type` | — |
| `last_confirmed_at` | TIMESTAMPTZ |
| `decay_started_at` | TIMESTAMPTZ |
| `archived_at` | TIMESTAMPTZ |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

#### `intelligence.hypotheses`

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `project_id` | UUID |
| `taxonomy_category` | TEXT |
| `stability_class` | TEXT |
| `state` | TEXT |
| `confidence` | NUMERIC(4,3) |
| `required_corroborations` | INTEGER |
| `current_corroborations` | INTEGER |
| `high_quality_contradictions` | INTEGER |
| `proposition` | JSONB |
| `context_scope` | TEXT |
| `context_artifact_type` | TEXT |
| `promoted_learning_id` | UUID |
| `expires_at` | — |
| `updated_at` | TIMESTAMPTZ |

#### `intelligence.signals`  ⚠️ no in-code `.from()` access found

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `project_id` | UUID |
| `source_type` | TEXT |
| `source_ref` | — |
| `is_quarantined` | BOOLEAN |
| `quarantine_reason` | TEXT |
| `processed_at` | — |

#### `intelligence.artifact_patterns`

| Column | Type |
|---|---|
| `id` | UUID |
| `artifact_type` | TEXT |
| `pattern_level` | TEXT |
| `confidence` | NUMERIC(4,3) |
| `sections` | JSONB |
| `exemplar_count` | INTEGER |
| `known_rejection_triggers` | JSONB |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

#### `intelligence.artifact_exemplars`  ⚠️ no in-code `.from()` access found

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `artifact_type` | TEXT |
| `source_artifact_id` | UUID |
| `structural_snapshot` | JSONB |
| `voice_snapshot` | JSONB |
| `audience_snapshot` | JSONB |
| `promoted_at` | TIMESTAMPTZ |

#### `intelligence.knowledge_assets`

| Column | Type |
|---|---|
| `id` | UUID |
| `owner_type` | TEXT |
| `user_id` | UUID |
| `project_id` | — |
| `title` | TEXT |
| `source_file_ref` | — |
| `version` | INTEGER |
| `is_current` | BOOLEAN |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

#### `intelligence.projects`

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `workspace_id` | — |
| `project_type` | TEXT |
| `lifecycle_state` | TEXT |
| `goals` | JSONB |
| `vocabulary_model` | JSONB |
| `stakeholders` | JSONB |
| `success_criteria` | JSONB |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

#### `intelligence.relationships`  ⚠️ no in-code `.from()` access found

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `name` | TEXT |
| `organization` | TEXT |
| `relationship_type` | — |
| `expertise_level` | — |
| `communication_norms` | JSONB |
| `known_sensitivities` | JSONB |
| `confidence` | NUMERIC(4,3) |
| `last_interaction_at` | TIMESTAMPTZ |
| `decay_started_at` | TIMESTAMPTZ |
| `is_active` | BOOLEAN |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

#### `intelligence.audience_profiles`

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `owner_type` | TEXT |
| `expertise_level` | TEXT |
| `communication_norms` | JSONB |
| `known_sensitivities` | JSONB |
| `confidence` | NUMERIC(4,3) |
| `is_active` | BOOLEAN |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

#### `intelligence.feedback_events`

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `artifact_id` | UUID |
| `project_id` | — |
| `edit_diff` | — |
| `created_at` | TIMESTAMPTZ |

#### `intelligence.artifact_blueprints`

| Column | Type |
|---|---|
| `id` | UUID |
| `user_id` | UUID |
| `artifact_type` | TEXT |
| `project_id` | UUID |
| `relationship_id` | — |
| `narrative_frame` | JSONB |
| `depth_spec` | JSONB |
| `voice_directives` | JSONB |
| `vocabulary_directives` | JSONB |
| `audience_calibration` | JSONB |
| `compliance_requirements` | JSONB |
| `conflicts_detected` | JSONB |
| `conflicts_resolved` | JSONB |
| `quality_score` | JSONB |
| `intelligence_profile_version` | INTEGER |
| `confidence_score` | NUMERIC |
| `created_at` | TIMESTAMPTZ |

### Migrations (applied in order)

- `002_workspace_learning_owner.sql`
- `003_knowledge_assets_visual_features.sql`
- `004_subject_centric_intelligence.sql`
- `005_cognitive_consolidation.sql`
- `006_visual_asset_type.sql`
- `007_evidence_provenance.sql`

### Health signal: schema/migration drift

A migration file is ground truth for what a column actually is in the live database; `schema.sql` is a hand-maintained consolidated mirror of all migrations and can fall behind. This checks every `alter table ... add column if not exists ...` statement across `db/migrations/*.sql` against `schema.sql`'s column list for that table.

`schema.sql` is missing the following column(s) that a migration added:

| Migration | Table | Column | Type |
|---|---|---|---|
| `003_knowledge_assets_visual_features.sql` | `knowledge_assets` | `extracted_visual_features` | JSONB |
| `007_evidence_provenance.sql` | `hypotheses` | `evidence_trail` | jsonb |

### Health signal: schema/code gap

The following tables are declared in `schema.sql` but no `.schema('intelligence').from(table)` call site was found anywhere in `packages/intelligence-os/src` — either dead schema, a not-yet-wired domain, or access via a code path this generator's regex does not recognize (verify by hand before treating as confirmed dead):

- `intelligence.signals`
- `intelligence.artifact_exemplars`
- `intelligence.relationships`


#### Tables — graph relationships

_Graph-derived relationship ledger (from the Architecture Knowledge Graph) — see `architecture.generated.json`._

Every `Table` node's incoming OWNS/READS/WRITES/PERSISTS edges — the table-centric view of the same facts `domain_relationships.generated.md` shows domain-centric.

Graph nodes covered: **12** (types: Table).

###### `intelligence.archetypes` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_

###### `intelligence.artifact_blueprints` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `ArtifactIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `ArtifactIntelligenceDomain` _(Domain)_
  - `READS` ← `ArtifactIntelligenceDomain` _(Domain)_
  - `WRITES` ← `ArtifactIntelligenceDomain` _(Domain)_

###### `intelligence.artifact_exemplars` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `ArtifactIntelligenceDomain` _(Domain)_

###### `intelligence.artifact_patterns` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `ArtifactIntelligenceDomain` _(Domain)_
  - `READS` ← `ArtifactIntelligenceDomain` _(Domain)_

###### `intelligence.audience_profiles` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `RelationshipIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_

###### `intelligence.feedback_events` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `ArtifactIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `ArtifactIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `ArtifactIntelligenceDomain` _(Domain)_
  - `WRITES` ← `ArtifactIntelligenceDomain` _(Domain)_
  - `WRITES` ← `ArtifactIntelligenceDomain` _(Domain)_

###### `intelligence.hypotheses` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_
  - `WRITES` ← `UserIntelligenceDomain` _(Domain)_
  - `WRITES` ← `UserIntelligenceDomain` _(Domain)_
  - `WRITES` ← `UserIntelligenceDomain` _(Domain)_
  - `WRITES` ← `UserIntelligenceDomain` _(Domain)_

###### `intelligence.knowledge_assets` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `KnowledgeIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `KnowledgeIntelligenceDomain` _(Domain)_
  - `READS` ← `KnowledgeIntelligenceDomain` _(Domain)_
  - `READS` ← `KnowledgeIntelligenceDomain` _(Domain)_
  - `READS` ← `WorkspaceIntelligenceDomain` _(Domain)_
  - `WRITES` ← `KnowledgeIntelligenceDomain` _(Domain)_

###### `intelligence.learnings` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `WorkspaceIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `WorkspaceIntelligenceDomain` _(Domain)_
  - `WRITES` ← `UserIntelligenceDomain` _(Domain)_
  - `WRITES` ← `UserIntelligenceDomain` _(Domain)_
  - `WRITES` ← `UserIntelligenceDomain` _(Domain)_
  - `WRITES` ← `WorkspaceIntelligenceDomain` _(Domain)_

###### `intelligence.profiles` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `UserIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `UserIntelligenceDomain` _(Domain)_
  - `READS` ← `UserIntelligenceDomain` _(Domain)_
  - `WRITES` ← `UserIntelligenceDomain` _(Domain)_
  - `WRITES` ← `UserIntelligenceDomain` _(Domain)_

###### `intelligence.projects` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `ProjectIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `ProjectIntelligenceDomain` _(Domain)_
  - `PERSISTS` ← `ProjectIntelligenceDomain` _(Domain)_
  - `READS` ← `ProjectIntelligenceDomain` _(Domain)_
  - `READS` ← `ProjectIntelligenceDomain` _(Domain)_
  - `READS` ← `ProjectIntelligenceDomain` _(Domain)_
  - `WRITES` ← `ProjectIntelligenceDomain` _(Domain)_
  - `WRITES` ← `ProjectIntelligenceDomain` _(Domain)_

###### `intelligence.relationships` _(Table)_

- **Location:** `packages/intelligence-os/src/db/schema.sql`
- **Incoming:**
  - `OWNS` ← `RelationshipIntelligenceDomain` _(Domain)_

## Event Bus

Transport: `InProcessEventBus` (`packages/intelligence-os/src/events/IntelligenceEventBus.ts`) — synchronous in-process fan-out via `Promise.allSettled` over all registered handlers for an event. Handler errors are caught and logged, never thrown to the emitter (fire-and-forget semantics). Every `emit()` call in this repo is itself `await`ed by its caller, so from the *caller's* perspective emission is synchronous/blocking; from a *handler's* perspective, a rejection never propagates back. Production swap-ins (BullMQ, Inngest) are stubbed as comments in the same file but not implemented.

Declared event types: **15** (single `intelligence.*` namespace, per `types/events.ts`).

### Event ledger

| Event | Producers (file:line) | Consumers (file:line) | Status |
|---|---|---|---|
| `intelligence.artifact.feedback` | `packages/intelligence-os/src/IntelligenceOS.ts:180` | `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts:101` | ✅ wired |
| `intelligence.blueprint.built` | `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts:203` | _(none)_ | ℹ️ emitted, observable but no in-repo consumer (expected for events meant for external consumers) |
| `intelligence.conflict.detected` | _(none)_ | _(none)_ | ⚠️ declared, never emitted or consumed |
| `intelligence.conflict.recurring` | _(none)_ | _(none)_ | ⚠️ declared, never emitted or consumed |
| `intelligence.hypothesis.created` | _(none)_ | _(none)_ | ⚠️ declared, never emitted or consumed |
| `intelligence.hypothesis.promoted` | _(none)_ | _(none)_ | ⚠️ declared, never emitted or consumed |
| `intelligence.knowledge_asset.uploaded` | `packages/intelligence-os/src/IntelligenceOS.ts:240` | `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts:100` | ✅ wired |
| `intelligence.learning.confirmed` | _(none)_ | _(none)_ | ⚠️ declared, never emitted or consumed |
| `intelligence.learning.reviewed` | `packages/intelligence-os/src/IntelligenceOS.ts:366` | _(none)_ | ℹ️ emitted, observable but no in-repo consumer (expected for events meant for external consumers) |
| `intelligence.learning.validated` | `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts:216`<br>`packages/intelligence-os/src/pipeline/FeedbackProcessor.ts:367`<br>`packages/intelligence-os/src/pipeline/FeedbackProcessor.ts:585` | _(none)_ | ℹ️ emitted, observable but no in-repo consumer (expected for events meant for external consumers) |
| `intelligence.profile.updated` | `packages/intelligence-os/src/pipeline/ProfileBuilder.ts:450` | _(none)_ | ℹ️ emitted, observable but no in-repo consumer (expected for events meant for external consumers) |
| `intelligence.project.created` | `packages/intelligence-os/src/IntelligenceOS.ts:298` | _(none)_ | ℹ️ emitted, observable but no in-repo consumer (expected for events meant for external consumers) |
| `intelligence.project.updated` | _(none)_ | _(none)_ | ⚠️ declared, never emitted or consumed |
| `intelligence.signal.extracted` | `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts:221`<br>`packages/intelligence-os/src/pipeline/FeedbackProcessor.ts:190`<br>`packages/intelligence-os/src/pipeline/FeedbackProcessor.ts:341` | `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts:114` | ✅ wired |
| `intelligence.user.correction` | `packages/intelligence-os/src/IntelligenceOS.ts:331` | `packages/intelligence-os/src/pipeline/FeedbackProcessor.ts:105` | ✅ wired |

### Fan-out

No event currently has more than one in-repo `.on()` consumer (no fan-out beyond `InProcessEventBus`'s own multi-handler-per-event capability).

### Execution order (Learning Pipeline, observed emit/on chain)

```
intelligence.artifact.feedback / intelligence.user.correction   (consumer → IntelligenceOS)
        │  FeedbackProcessor.register() handlers
        ▼
intelligence.signal.extracted        (emitted by FeedbackProcessor, KnowledgeProcessor)
        │  FeedbackProcessor also self-subscribes to this event
        ▼
intelligence.learning.validated       (emitted by FeedbackProcessor after LearningValidator promotes)
        ▼
intelligence.profile.updated          (emitted by ProfileBuilder.rebuildForSubject / rebuild)
```

`intelligence.hypothesis.created`, `intelligence.hypothesis.promoted`, `intelligence.learning.confirmed`, `intelligence.conflict.detected`, `intelligence.conflict.recurring`, and `intelligence.project.updated` are declared in the type union with no in-repo emit site found by this generator — see the ledger above and `.context/repository_health.generated.md` for the corresponding finding.


#### Events — graph relationships

_Graph-derived relationship ledger (from the Architecture Knowledge Graph) — see `architecture.generated.json`._

Every `Event` node's EMITS/CONSUMES edges. An event with an "Incoming" section but no "Outgoing" listed elsewhere pointing back to it is declared but structurally dead — cross-check against `.context/event_bus.generated.md` / `.context/repository_health.generated.md`.

Graph nodes covered: **15** (types: Event).

###### `intelligence.artifact.feedback` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `CONSUMES` ← `FeedbackProcessor` _(Class)_
  - `EMITS` ← `IntelligenceOS` _(Class)_

###### `intelligence.blueprint.built` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `EMITS` ← `BlueprintBuilder` _(Class)_

###### `intelligence.conflict.detected` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
_(no matching edges found)_

###### `intelligence.conflict.recurring` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
_(no matching edges found)_

###### `intelligence.hypothesis.created` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
_(no matching edges found)_

###### `intelligence.hypothesis.promoted` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
_(no matching edges found)_

###### `intelligence.knowledge_asset.uploaded` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `CONSUMES` ← `KnowledgeProcessor` _(Class)_
  - `EMITS` ← `IntelligenceOS` _(Class)_

###### `intelligence.learning.confirmed` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
_(no matching edges found)_

###### `intelligence.learning.reviewed` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `EMITS` ← `IntelligenceOS` _(Class)_

###### `intelligence.learning.validated` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `EMITS` ← `FeedbackProcessor` _(Class)_
  - `EMITS` ← `FeedbackProcessor` _(Class)_
  - `EMITS` ← `FeedbackProcessor` _(Class)_

###### `intelligence.profile.updated` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `EMITS` ← `ProfileBuilder` _(Class)_

###### `intelligence.project.created` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `EMITS` ← `IntelligenceOS` _(Class)_

###### `intelligence.project.updated` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
_(no matching edges found)_

###### `intelligence.signal.extracted` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `CONSUMES` ← `FeedbackProcessor` _(Class)_
  - `EMITS` ← `KnowledgeProcessor` _(Class)_
  - `EMITS` ← `FeedbackProcessor` _(Class)_
  - `EMITS` ← `FeedbackProcessor` _(Class)_

###### `intelligence.user.correction` _(Event)_

- **Location:** `packages/intelligence-os/src/types/events.ts`
- **Incoming:**
  - `CONSUMES` ← `FeedbackProcessor` _(Class)_
  - `EMITS` ← `IntelligenceOS` _(Class)_

## API Contract

### HTTP routes (`packages/intelligence-os/src/api/http/server.ts`)

All routes are hosted from the one `createCognitionHttpServer()` factory — both the `apps/api/src/server.ts` long-running process and the `apps/api/api/cognition.ts` Vercel Function entrypoint dispatch into this exact same handler.

| Method | Path | Handler | Downstream |
|---|---|---|---|
| POST | `/v1/cognition/resolve` | `CognitionProviderImpl.resolveCognitionContext` | `packages/intelligence-os/src/api/CognitionProviderImpl.ts` |
| POST | `/v1/cognition/observe` | `CognitionProviderImpl.observe` | `packages/intelligence-os/src/api/CognitionProviderImpl.ts` |
| POST | `/v1/cognition/review` | `CognitionProviderImpl.review` | `packages/intelligence-os/src/api/CognitionProviderImpl.ts` |
| GET | `/v1/cognition/summary` | `CognitionProviderImpl.summarizeCognition` | `packages/intelligence-os/src/api/CognitionProviderImpl.ts` |
| GET | `/v1/cognition/health` | `CognitionProviderImpl.checkHealth / HealthChecker` | `packages/intelligence-os/src/api/HealthChecker.ts` |
| POST | `/v1/knowledge/ingest` | `IntelligenceOS.ingestKnowledgeAsset` | `packages/intelligence-os/src/IntelligenceOS.ts` |
| POST | `/v1/workspace-configuration` | `IntelligenceOS.ingestWorkspaceConfiguration` | `packages/intelligence-os/src/IntelligenceOS.ts` |
| POST | `/v1/intelligence/feedback` | `IntelligenceOS.recordFeedbackEvent` | `packages/intelligence-os/src/IntelligenceOS.ts` |
| POST | `/v1/intelligence/correction` | `IntelligenceOS.recordCorrection` | `packages/intelligence-os/src/IntelligenceOS.ts` |

### `IIntelligenceProvider` — the platform's consumer-facing contract

The platform's public provider contract — Epic 2 (Platform Publication), E2-2.

#### `interface IIntelligenceProvider`


| Method | Params | Returns |
|---|---|---|
| `buildBlueprint` | `request: ArtifactRequest` | `Promise<ArtifactBlueprint>` |
| `recordFeedbackEvent` | `event: FeedbackEvent` | `Promise<void>` |
| `ingestKnowledgeAsset` | `asset: KnowledgeAssetInput, rawContent?: string` | `Promise<string>` |
| `ingestWorkspaceConfiguration` | `input: WorkspaceConfigurationInput` | `Promise<string>` |
| `upsertProject` | `input: ProjectInput` | `Promise<string>` |
| `reviewLearning` | `userId: string, learningId: string, approved: boolean, reviewedBy: string,` | `Promise<void>` |
| `getBrandSummary` | `params: { userId: string; workspaceId?: string }` | `Promise<IntelligenceSummary>` |
| `recordCorrection` | `input: UserCorrectionInput` | `Promise<void>` |

### `@platform/cognition-contract` — cross-platform contract types

#### `packages/cognition-contract/src/CognitionContext.ts`

- **interface `VoiceProfile`** — The answer to "how does this brand sound." Prompt-ready expression of tone, cadence, audience, and constraints.
- **interface `IdentityContribution`** — The answer to "who is this brand" as it applies to a single generation: the stable, learned expression patterns — narrative habits, argument style, named frameworks — that persist across outputs.
- **interface `VisualIdentityProjection`** — The style-relevant visual attributes needed by rendering and presentation — a projection for BrandOS's rendering needs, not a general design system.
- **interface `CognitionProvenance`** — Minimal, diagnostic-only metadata for observability and debugging.
- **interface `CognitionKnowledgeSection`** — ADR-004 (Cognitive Consolidation) — recurring themes and named frameworks a workspace's cognition has retained, from both Knowledge (uploaded reference material) and Experience (corroborated behavioral patterns).
- **interface `CognitionReasoningSection`** — ADR-004 (Cognitive Consolidation) — conclusions a workspace's cognition has reached beyond direct recall (analytical/evaluative frameworks, strategic and decision-making patterns), from both Knowledge and Experience.
- **interface `CognitionPositioningSection`** — ADR-004 (Cognitive Consolidation) — how a workspace stands relative to its market or category.
- **interface `CognitionContext`** — The complete, immutable cognitive picture of a workspace at the moment of resolution.
- **interface `CognitionRequest`** — Input to resolveCognitionContext().
- **interface `ObservationInput`** — A report of what happened — what was generated, how it scored, in what workspace — with no interpretation attached.
- **interface `CognitionSummary`** — A display-ready summary of a workspace's cognition, intended for direct presentation in BrandOS UI surfaces (e.g.
- **interface `CognitionHealth`** — Whether IntelligenceOS is currently able to serve requests, so BrandOS can apply its own degraded-mode handling.
- **interface `CognitionReviewDecision`** — A human decision about previously surfaced cognitive material (e.g.
- **type `CognitionConfidence`** — A single, honest signal of how much the rest of a CognitionContext should be trusted.

#### `packages/cognition-contract/src/CognitionProvider.ts`

- **interface `CognitionProvider`**


#### Routes — graph relationships & reachability

_Graph-derived relationship ledger (from the Architecture Knowledge Graph) — see `architecture.generated.json`._

Every `HttpApi` node's direct CALLS edge, plus its full CALLS-reachability set (everything downstream of the handler that a change to the route could ripple into).

Graph nodes covered: **9** (types: HttpApi).

###### `GET /v1/cognition/health` _(HttpApi)_

- **Location:** `packages/intelligence-os/src/api/http/server.ts`:248
- **Outgoing:**
  - `CALLS` → `HealthChecker.check` _(Method)_

###### `GET /v1/cognition/summary` _(HttpApi)_

- **Location:** `packages/intelligence-os/src/api/http/server.ts`:237
- **Outgoing:**
  - `CALLS` → `CognitionProviderImpl.summarizeCognition` _(Method)_

###### `POST /v1/cognition/observe` _(HttpApi)_

- **Location:** `packages/intelligence-os/src/api/http/server.ts`:223
- **Outgoing:**
  - `CALLS` → `CognitionProviderImpl.observe` _(Method)_

###### `POST /v1/cognition/resolve` _(HttpApi)_

- **Location:** `packages/intelligence-os/src/api/http/server.ts`:212
- **Outgoing:**
  - `CALLS` → `CognitionProviderImpl.resolveCognitionContext` _(Method)_

###### `POST /v1/cognition/review` _(HttpApi)_

- **Location:** `packages/intelligence-os/src/api/http/server.ts`:230
- **Outgoing:**
  - `CALLS` → `CognitionProviderImpl.review` _(Method)_

###### `POST /v1/intelligence/correction` _(HttpApi)_

- **Location:** `packages/intelligence-os/src/api/http/server.ts`:343
- **Outgoing:**
  - `CALLS` → `IntelligenceOS.recordCorrection` _(Method)_

###### `POST /v1/intelligence/feedback` _(HttpApi)_

- **Location:** `packages/intelligence-os/src/api/http/server.ts`:327
- **Outgoing:**
  - `CALLS` → `IntelligenceOS.recordFeedbackEvent` _(Method)_

###### `POST /v1/knowledge/ingest` _(HttpApi)_

- **Location:** `packages/intelligence-os/src/api/http/server.ts`:260
- **Outgoing:**
  - `CALLS` → `IntelligenceOS.ingestKnowledgeAsset` _(Method)_

###### `POST /v1/workspace-configuration` _(HttpApi)_

- **Location:** `packages/intelligence-os/src/api/http/server.ts`:309
- **Outgoing:**
  - `CALLS` → `IntelligenceOS.ingestWorkspaceConfiguration` _(Method)_

##### Full downstream CALLS-reachability per route

###### `GET /v1/cognition/health`

- `HealthChecker.check` _(Method)_

###### `GET /v1/cognition/summary`

- `CognitionProviderImpl.summarizeCognition` _(Method)_

###### `POST /v1/cognition/observe`

- `CognitionProviderImpl.observe` _(Method)_

###### `POST /v1/cognition/resolve`

- `CognitionProviderImpl.resolveCognitionContext` _(Method)_
- `ContextBuilder.build` _(Method)_
- `UserIntelligenceDomain.getCurrentProfileForSubject` _(Method)_
- `WorkspaceIntelligenceDomain.getContext` _(Method)_
- `WorkspaceIntelligenceDomain.getWorkspaceLearnings` _(Method)_

###### `POST /v1/cognition/review`

- `CognitionProviderImpl.review` _(Method)_

###### `POST /v1/intelligence/correction`

- `IntelligenceOS.recordCorrection` _(Method)_

###### `POST /v1/intelligence/feedback`

- `IntelligenceOS.recordFeedbackEvent` _(Method)_

###### `POST /v1/knowledge/ingest`

- `IntelligenceOS.ingestKnowledgeAsset` _(Method)_

###### `POST /v1/workspace-configuration`

- `IntelligenceOS.ingestWorkspaceConfiguration` _(Method)_

## Runtime Model

Per ADR-002 ("apps runtime layer"): `packages/*` is the pure, environment-agnostic SDK; `apps/*` owns everything environment-specific (server bootstrap, deployment config, `.env`). Enforced mechanically by `RULE-IOS-ISOLATION` in `packages/intelligence-os/scripts/check-boundaries.mjs`.

### Process entrypoints

#### `apps/api/src/server.ts`

Traditional long-running Node HTTP server entrypoint (`pnpm dev:api`). Reads env, constructs `IntelligenceOS`, hosts `createCognitionHttpServer()`.

> Milestone 4 (Monorepo Runtime Separation) — the traditional, long-running Node process entrypoint for the IntelligenceOS API.

#### `apps/api/api/cognition.ts`

Vercel Node Function entrypoint. Reuses the exact same `createCognitionHttpServer` by emitting a synthetic `'request'` event rather than reimplementing routing.

> Vercel Node Function entrypoint for the IntelligenceOS API — the production deployment target at https://intelligence.saurabhtiwariai.com (see vercel.json's rewrite from /v1/cognition/* to this function, and ADR-002 for why the routes stay unprefixed).

#### `apps/demo/src/index.ts`

Standalone integration-validation client — proves IntelligenceOS is consumable purely over HTTP, independent of BrandOS.

> Milestone 4 (Monorepo Runtime Separation) — integration validation client.

#### `apps/playground/src/index.ts`

Scaffold for a future interactive developer playground (not yet a functioning application).

> Scaffold only — deliberately not a full application.

### Required environment variables (derived from real call sites)

| Variable | Referenced in |
|---|---|
| `COGNITION_API_KEY` | `apps/api/api/cognition.ts`, `apps/api/src/server.ts` |
| `INTELLIGENCE_OS_API_KEY` | `apps/demo/src/index.ts` |
| `INTELLIGENCE_OS_API_URL` | `apps/demo/src/index.ts` |
| `PORT` | `apps/api/src/server.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | `apps/api/api/cognition.ts`, `apps/api/src/server.ts` |
| `SUPABASE_URL` | `apps/api/api/cognition.ts`, `apps/api/src/server.ts` |

### Event bus runtime

Default: `InProcessEventBus` — synchronous, in-memory, single-process. Swap-in points for `BullMQEventBus` (task queues) or `InngestEventBus` (serverless) are documented as comments in `packages/intelligence-os/src/events/IntelligenceEventBus.ts` but not implemented — the `IntelligenceEventBus` interface is the extension point.

### Persistence runtime

Supabase Postgres, `intelligence` schema. A `SupabaseClient` is constructed once (in `apps/api`, or the demo/playground app) and injected into `IntelligenceOS`'s constructor, which passes it down to each Domain class — never constructed inside `packages/intelligence-os/src`.


#### Process entrypoints — graph reachability

_Graph-derived relationship ledger (from the Architecture Knowledge Graph) — see `architecture.generated.json`._

Every process entrypoint's full DEPENDS_ON reachability set — everything that process transitively pulls in at boot. Complements `.context/runtime_model.generated.md` (Phase 1, which lists entrypoints and env vars) with the graph-derived reachability those entrypoints actually have.

##### `apps/api/src/server.ts`

- **Cross-package dependencies (declared in `@intelligence-os/api/package.json`):** `@intelligence-os/core`, `@supabase/supabase-js`
- **Intra-repo relative-import reachability (DEPENDS_ON):** 0 module(s) — expected: this file only imports the cross-package surface listed above, never a relative path into another package’s internals, per ADR-002 isolation.

##### `apps/api/api/cognition.ts`

- **Cross-package dependencies (declared in `@intelligence-os/api/package.json`):** `@intelligence-os/core`, `@supabase/supabase-js`
- **Intra-repo relative-import reachability (DEPENDS_ON):** 0 module(s) — expected: this file only imports the cross-package surface listed above, never a relative path into another package’s internals, per ADR-002 isolation.

##### `apps/demo/src/index.ts`

- **Cross-package dependencies (declared in `@intelligence-os/demo/package.json`):** `@platform/cognition-contract`
- **Intra-repo relative-import reachability (DEPENDS_ON):** 0 module(s) — expected: this file only imports the cross-package surface listed above, never a relative path into another package’s internals, per ADR-002 isolation.

##### `apps/playground/src/index.ts`

- **Cross-package dependencies (declared in `@intelligence-os/playground/package.json`):** `@intelligence-os/core`
- **Intra-repo relative-import reachability (DEPENDS_ON):** 0 module(s) — expected: this file only imports the cross-package surface listed above, never a relative path into another package’s internals, per ADR-002 isolation.

##### HttpApi routes hosted (both process entrypoints share these)

- `GET /v1/cognition/health` (`packages/intelligence-os/src/api/http/server.ts:248`)
- `GET /v1/cognition/summary` (`packages/intelligence-os/src/api/http/server.ts:237`)
- `POST /v1/cognition/observe` (`packages/intelligence-os/src/api/http/server.ts:223`)
- `POST /v1/cognition/resolve` (`packages/intelligence-os/src/api/http/server.ts:212`)
- `POST /v1/cognition/review` (`packages/intelligence-os/src/api/http/server.ts:230`)
- `POST /v1/intelligence/correction` (`packages/intelligence-os/src/api/http/server.ts:343`)
- `POST /v1/intelligence/feedback` (`packages/intelligence-os/src/api/http/server.ts:327`)
- `POST /v1/knowledge/ingest` (`packages/intelligence-os/src/api/http/server.ts:260`)
- `POST /v1/workspace-configuration` (`packages/intelligence-os/src/api/http/server.ts:309`)

## Execution Paths

For every HTTP route: the graph-derived CALLS-reachability set (mechanical, from `architecture_knowledge_graph.generated.json`), then — for the three routes the mission calls out by name — a curated end-to-end narrative chain that fills in the event-bus-mediated hops the CALLS graph doesn't connect directly. The curated chains are cross-checked against `pipeline_relationships.generated.md` and `event_relationships.generated.md`, not invented independently.

### `GET /v1/cognition/health`

**Graph-derived CALLS reachability (1 node(s)):**

- `HealthChecker.check` _(Method)_

### `GET /v1/cognition/summary`

**Graph-derived CALLS reachability (1 node(s)):**

- `CognitionProviderImpl.summarizeCognition` _(Method)_

### `POST /v1/cognition/observe`

**Graph-derived CALLS reachability (1 node(s)):**

- `CognitionProviderImpl.observe` _(Method)_

### `POST /v1/cognition/resolve`

**Graph-derived CALLS reachability (5 node(s)):**

- `CognitionProviderImpl.resolveCognitionContext` _(Method)_
- `ContextBuilder.build` _(Method)_
- `UserIntelligenceDomain.getCurrentProfileForSubject` _(Method)_
- `WorkspaceIntelligenceDomain.getContext` _(Method)_
- `WorkspaceIntelligenceDomain.getWorkspaceLearnings` _(Method)_

**Curated end-to-end narrative:**

```
HTTP: POST /v1/cognition/resolve
  ↓
CognitionProviderImpl.resolveCognitionContext()
  ↓
ContextBuilder.build()
  ↓
UserIntelligenceDomain.getCurrentProfileForSubject() (read current IntelligenceProfile)
  ↓
voiceMapping.ts / identitySynthesis.ts (derive voice/identity/confidence from Learnings)
  ↓
CognitionContext (returned to caller)
```

### `POST /v1/cognition/review`

**Graph-derived CALLS reachability (1 node(s)):**

- `CognitionProviderImpl.review` _(Method)_

### `POST /v1/intelligence/correction`

**Graph-derived CALLS reachability (1 node(s)):**

- `IntelligenceOS.recordCorrection` _(Method)_

**Curated end-to-end narrative:**

```
HTTP: POST /v1/intelligence/correction
  ↓
IntelligenceOS.recordCorrection()
  ↓
ObservationBuilder (build Observation from correction input)
  ↓
SignalExtractor (event-bus-triggered)
  ↓
HypothesisEngine
  ↓
LearningValidator → intelligence.learning.validated
  ↓
ProfileBuilder.rebuildForSubject() → intelligence.profile.updated
```

### `POST /v1/intelligence/feedback`

**Graph-derived CALLS reachability (1 node(s)):**

- `IntelligenceOS.recordFeedbackEvent` _(Method)_

### `POST /v1/knowledge/ingest`

**Graph-derived CALLS reachability (1 node(s)):**

- `IntelligenceOS.ingestKnowledgeAsset` _(Method)_

**Curated end-to-end narrative:**

```
HTTP: POST /v1/knowledge/ingest
  ↓
IntelligenceOS.ingestKnowledgeAsset()
  ↓
KnowledgeIntelligenceDomain (persist raw asset)
  ↓
KnowledgeProcessor.process() (event-bus-triggered by intelligence.knowledge_asset.uploaded)
  ↓
VocabularyExtractor / FrameworkExtractor / PatternExtractor / VisualFeatureExtractor
  ↓
KnowledgeValidator
  ↓
KnowledgeIntelligenceDomain (persist extracted knowledge)
  ↓
ProfileBuilder.rebuildForSubject() (next profile rebuild picks up the new knowledge)
  ↓
ContextBuilder.build() → CognitionContext.knowledge
  ↓
Prompt / artifact-generation consumer (outside this repo — IntelligenceOS ends at the resolved CognitionContext)
```

### `POST /v1/workspace-configuration`

**Graph-derived CALLS reachability (1 node(s)):**

- `IntelligenceOS.ingestWorkspaceConfiguration` _(Method)_

## Information Flow

For every `CognitionContext` field: a backward trace (via incoming CONTRIBUTES_TO / SYNTHESIZES / BUILDS / READS / WRITES / EMITS edges) from the field back toward whatever originates it — a Profile field, a producing function, ultimately a Table or Event where the data first entered the system. Layer 0 is the field itself; each subsequent layer is one hop further back.

### `CognitionContext.confidence`

**Origin expression (from `ContextBuilder.build()`):** `deriveConfidence(learnings)`

**Field**: `CognitionContext.confidence` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_, `deriveConfidence` _(Function)_

### `CognitionContext.contractVersion`

**Origin expression (from `ContextBuilder.build()`):** `COGNITION_CONTRACT_VERSION`

**Field**: `CognitionContext.contractVersion` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_

### `CognitionContext.identity`

**Origin expression (from `ContextBuilder.build()`):** `applyIdentityConfiguration(deriveIdentityContribution(learnings), workspaceContext.identityConfiguration)`

**Field**: `CognitionContext.identity` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_, `deriveIdentityContribution` _(Function)_, `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

### `CognitionContext.knowledge`

**Origin expression (from `ContextBuilder.build()`):** `((): CognitionKnowledgeSection \| null => {         const projected = projectSynthesizedCollection(           profile?.knowledgeSummary ?? null,           v => ({ name: v.name, description: v.description }),         );         return projected ? { themes: projected.items, confidence: projected.confid…`

**Field**: `CognitionContext.knowledge` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_, `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_, `IntelligenceProfile.knowledgeSummary` _(ProfileField)_
**Layer 2 back**: `ProfileBuilder.rebuildForSubject` _(Method)_

### `CognitionContext.positioning`

**Origin expression (from `ContextBuilder.build()`):** `((): CognitionPositioningSection \| null => {         const projected = projectSynthesizedCollection(           profile?.positioningSummary ?? null,           v => ({ statement: v.statement }),         );         return projected ? { statements: projected.items, confidence: projected.confidence, hasC…`

**Field**: `CognitionContext.positioning` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_, `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_, `IntelligenceProfile.positioningSummary` _(ProfileField)_
**Layer 2 back**: `ProfileBuilder.rebuildForSubject` _(Method)_

### `CognitionContext.provenance`

**Origin expression (from `ContextBuilder.build()`):** `{         signalCount: learnings.length,         lastConsolidatedAt: deriveLastConsolidatedAt(learnings),       }`

**Field**: `CognitionContext.provenance` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_, `deriveLastConsolidatedAt` _(Function)_

### `CognitionContext.reasoning`

**Origin expression (from `ContextBuilder.build()`):** `((): CognitionReasoningSection \| null => {         const projected = projectSynthesizedCollection(           profile?.reasoningSummary ?? null,           v => ({ statement: v.statement }),         );         return projected ? { conclusions: projected.items, confidence: projected.confidence, hasConf…`

**Field**: `CognitionContext.reasoning` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_, `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_, `IntelligenceProfile.reasoningSummary` _(ProfileField)_
**Layer 2 back**: `ProfileBuilder.rebuildForSubject` _(Method)_

### `CognitionContext.resolvedAt`

**Origin expression (from `ContextBuilder.build()`):** `new Date().toISOString()`

**Field**: `CognitionContext.resolvedAt` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_

### `CognitionContext.visualIdentity`

**Origin expression (from `ContextBuilder.build()`):** `null`

**Field**: `CognitionContext.visualIdentity` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_

### `CognitionContext.voice`

**Origin expression (from `ContextBuilder.build()`):** `voice = applyVoiceConfiguration(deriveVoiceProfile(learnings), workspaceContext.voiceConfiguration)`

**Field**: `CognitionContext.voice` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_, `deriveVoiceProfile` _(Function)_, `packages/intelligence-os/src/context/ContextBuilder.ts` _(Module)_

### `CognitionContext.workspaceId`

**Origin expression (from `ContextBuilder.build()`):** `workspaceId`

**Field**: `CognitionContext.workspaceId` _(ContextField)_
**Layer 1 back**: `ContextBuilder.build` _(Method)_

## Repository Health

All findings below are mechanically derived from the file-level import graph, stub-marker scan, and event/table ledgers — re-run generation after any change to see whether a finding has been resolved.

### 1. Cyclic dependencies (file-level import graph)

None found. The file-level relative-import graph across all parsed packages is acyclic.

### 2. Orphaned modules (zero in-repo importers)

Package barrel files (`index.ts`) and the four app entrypoints are *expected* to have zero in-repo importers (they are entered via `package.json` `main`/`exports` or process boot, not a relative import) and are excluded below.

No unexpected orphans found — every non-entrypoint, non-barrel file is imported by at least one other file.

### 3. Stub / not-yet-activated code paths

Detected via this repository's own conventions for "not really implemented": `PhaseNotImplementedError` and `DomainNotActivatedError` throw sites.

| File:line | Marker | Class |
|---|---|---|
| `packages/intelligence-os/src/domains/ArtifactIntelligenceDomain.ts:232` | `PhaseNotImplementedError` | `ArtifactIntelligenceDomain` |
| `packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts:198` | `PhaseNotImplementedError` | `KnowledgeIntelligenceDomain` |
| `packages/intelligence-os/src/domains/ProjectIntelligenceDomain.ts:164` | `PhaseNotImplementedError` | `ProjectIntelligenceDomain` |
| `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts:120` | `DomainNotActivatedError` | `RelationshipIntelligenceDomain` |
| `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts:128` | `DomainNotActivatedError` | `RelationshipIntelligenceDomain` |
| `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts:138` | `DomainNotActivatedError` | `RelationshipIntelligenceDomain` |
| `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts:148` | `DomainNotActivatedError` | `RelationshipIntelligenceDomain` |
| `packages/intelligence-os/src/domains/RelationshipIntelligenceDomain.ts:156` | `DomainNotActivatedError` | `RelationshipIntelligenceDomain` |
| `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts:192` | `PhaseNotImplementedError` | `WorkspaceIntelligenceDomain` |
| `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts:203` | `PhaseNotImplementedError` | `WorkspaceIntelligenceDomain` |
| `packages/intelligence-os/src/errors.ts:26` | `PhaseNotImplementedError` | — |

### 4. Event-bus gaps

Declared in `types/events.ts` but never emitted anywhere in this repository:

- `intelligence.conflict.detected`
- `intelligence.conflict.recurring`
- `intelligence.hypothesis.created`
- `intelligence.hypothesis.promoted`
- `intelligence.learning.confirmed`
- `intelligence.project.updated`

See `.context/event_bus.generated.md` for the full producer/consumer ledger.

### 5. Schema/code gaps

See `.context/database_context.generated.md` §"Health signal" for tables declared in `schema.sql` with no detected `.from()` call site.

### 6. Duplicate-pipeline check

Heuristic: more than one class across `pipeline/`, `knowledge/`, and `blueprint/` implementing the same method name family can indicate parallel/duplicate pipelines. No duplication was found — each pipeline stage (`SignalExtractor`, `ObservationBuilder`, `HypothesisEngine`, `LearningValidator`, `ProfileBuilder` for Learning; `VocabularyExtractor`, `FrameworkExtractor`, `PatternExtractor`, `VisualFeatureExtractor`, `KnowledgeValidator` for Knowledge) is a distinct, singly-defined class with no overlapping responsibility per its own header docblock.

### Summary

- Cycles: 0
- Unexpected orphans: 0
- Stub markers: 11
- Events declared but never emitted: 6
