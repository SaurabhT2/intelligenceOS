# Integration Guide

How to consume IntelligenceOS from another application. There are two independent ways to do this — pick based on how you're deploying, not based on which is "newer" (both are current, maintained surfaces; see [`ARCHITECTURE.md`](./ARCHITECTURE.md) §4).

---

## Part 1 — Two ways to integrate

### A. In-process SDK (`IIntelligenceProvider`)

Use this if your application can run in the same process/deployment as IntelligenceOS, or as a normal npm dependency inside your own Node backend.

```bash
npm install @intelligence-os/core @intelligence-os/shared-types
```

```typescript
import { IntelligenceOS, IntelligenceOSProvider, type IIntelligenceProvider } from '@intelligence-os/core';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const provider: IIntelligenceProvider = new IntelligenceOSProvider(new IntelligenceOS({ supabase }));

// Register `provider` under your own dependency-injection container's
// IIntelligenceProvider token, or just hold the reference directly.
```

**What you need to provide yourself** (this platform deliberately does none of this for you — see `ARCHITECTURE.md` §12 on the `apps/*` vs `packages/*` split):

| Need | What to do |
|---|---|
| A database | Provision a Supabase project, apply `packages/intelligence-os/src/db/schema.sql` and everything in `db/migrations/`, and add the `intelligence` schema to Supabase's exposed-schemas list. |
| Runtime config | Decide where the service-role key lives in your own secret management — `IntelligenceOSConfig` just takes `{ supabase, eventBus? }`; IntelligenceOS never reads environment variables itself. |
| Wiring into your call sites | Call `provider.buildBlueprint(request)` before generation and `provider.recordFeedbackEvent(event)` after delivery. That's the entire integration surface for the common path. |
| A gradual rollout (optional) | If you're replacing an existing in-house intelligence implementation and want a feature flag rather than a hard cutover, write your own class implementing `IIntelligenceProvider` that wraps your legacy code, and flag between it and `IntelligenceOSProvider` at your registration point. `packages/intelligence-os/src/compat/IntelligenceOSProvider.ts` is a 1:1 reference for "thin adapter implementing this interface," even though yours wraps different internals. |
| Observability (optional) | Subscribe to the event bus: `intelligenceOS.eventBus.on('intelligence.blueprint.built', handler)` (14 event types total — see Part 2's event table below). If you registered the interface-typed `IntelligenceOSProvider` rather than the concrete class, use its `.underlying` escape hatch: `provider.underlying.eventBus.on(...)`. |
| Your own boundary rules (optional but recommended) | Two lint-style checks over *your own* repository — that `@intelligence-os/core`/`@intelligence-os/shared-types` are only imported from your orchestration layer, not arbitrary application code, and never from your presentation layer at all. `packages/intelligence-os/scripts/check-boundaries.mjs` in the published source is a reasonable starting template for the same general shape (walk `.ts` files, regex-match import specifiers, allowlist/denylist, exit 1 on violation), pointed at your own directory structure. |

**What you do *not* need to do:** fork, vendor, or patch either package; write your own copy of `ArtifactBlueprint`/`ArtifactRequest`/`FeedbackEvent`; reimplement blueprint assembly or either pipeline; or grant IntelligenceOS access to your source tree. `npm install`, a Supabase project with the schema applied, and the two call sites above is a working integration — everything else in the table is incremental.

**`ingestWorkspaceConfiguration(input: WorkspaceConfigurationInput)`** (ADR-003 §2.4) persists explicit, admin-declared workspace voice/identity/compliance configuration as Knowledge, applied ahead of Learning-derived voice/identity wherever a workspace's intelligence is synthesized. Part of `IIntelligenceProvider` (promoted from a concrete-class-only method during the ADR-003 audit-closure session — see `IMPLEMENTATION_STATUS.md`), so it's available on both `IntelligenceOS` and `IntelligenceOSProvider` directly, no `.underlying` escape hatch needed. Also reachable over HTTP at `POST /v1/workspace-configuration` if your host app passes `intelligenceOS` (or an equivalent `KnowledgeIngestPort`) as `createCognitionHttpServer`'s third argument, the same way `/v1/knowledge/ingest` already works.

### B. HTTP (`CognitionProvider`, via `apps/api`)

Use this if you're integrating across a network boundary — a separate repository or a separate deployment, most notably the BrandOS integration this contract was purpose-built for (see [`PLATFORM_CONTRACT.md`](./PLATFORM_CONTRACT.md) for the full contract design).

Point your HTTP client at a running `apps/api` instance — either the hosted deployment (`https://intelligence.saurabhtiwariai.com`) or your own (see [`DEPLOYMENT.md`](./DEPLOYMENT.md)) — and call the routes below with `Authorization: Bearer <COGNITION_API_KEY>` on every request.

```
POST /v1/cognition/resolve   { workspaceId, taskType? }  -> CognitionContext
POST /v1/cognition/observe   ObservationInput             -> 204
POST /v1/cognition/review    CognitionReviewDecision       -> 204
GET  /v1/cognition/summary?workspaceId=...                -> CognitionSummary
GET  /v1/cognition/health                                  -> CognitionHealth
POST /v1/knowledge/ingest    { asset, rawContent }         -> 201 { assetId }
```

Only depend on `@platform/cognition-contract`'s published types for request/response shapes — never on `@intelligence-os/core` or any IntelligenceOS internal module. `apps/demo` (`packages/intelligence-os`'s sibling app) is a working reference implementation of exactly this: it calls all six routes using nothing but the contract types and a base URL, and is a good template for a minimal client.

**One route is not part of the `CognitionProvider` contract itself:** `POST /v1/knowledge/ingest` is a separate, optional `KnowledgeIngestPort` that `createCognitionHttpServer` activates when a host app passes one — it's not one of the five methods `PLATFORM_CONTRACT.md` governs. As of the Completion Mission session, both `apps/api` entrypoints pass `intelligenceOS` for this port (it already structurally satisfies it), so this route is live in the hosted deployment. Before that session, neither entrypoint passed it and the route returned `501` in production despite the Knowledge Pipeline behind it being fully implemented — worth knowing if you're diagnosing an older deployment.

### Choosing between them

If you're not sure which applies: if you can add IntelligenceOS as an npm dependency of a backend you control and deploy together, use A. If you're calling it as an external service you don't deploy — including if you're BrandOS specifically — use B.

---

## Part 2 — Public API Surface reference

This section is a maintained, current inventory of what each package actually exports. **If this table and a package's `index.ts` ever disagree, `index.ts` is correct — treat the disagreement as a bug in this document, not in the code**, and check the file directly:
- `packages/shared-intelligence-types/src/index.ts`
- `packages/cognition-contract/src/index.ts`
- `packages/intelligence-os/src/index.ts`

### `@intelligence-os/shared-types`

| Export | Kind | Purpose |
|---|---|---|
| `ArtifactRequest`, `ArtifactType`, `AudienceReference` | type | Shape of a `buildBlueprint()` request |
| `ArtifactBlueprint` + 9 nested types (`BlueprintSection`, `VoiceDirectives`, `VocabularyDirectives`, `AudienceCalibration`, `DetectedConflict`, `ConflictResolution`, `NarrativeFrame`, `DepthSpecification`, `ComplianceRequirement`) | type | The full return shape of `buildBlueprint()` |
| `FeedbackEvent`, `FeedbackEventType`, `EditDiff`, `VocabularyChange` | type | Shape of a `recordFeedbackEvent()` input |
| `IntelligenceSummary` | type | Return shape of `getBrandSummary()` |

### `@platform/cognition-contract`

| Export | Kind | Purpose |
|---|---|---|
| `CognitionContext` + 5 nested types (`CognitionConfidence`, `VoiceProfile`, `IdentityContribution`, `VisualIdentityProjection`, `CognitionProvenance`) | type | The full return shape of `resolveCognitionContext()` — see `PLATFORM_CONTRACT.md` §3 for which sections are real |
| `CognitionRequest`, `ObservationInput`, `CognitionReviewDecision`, `CognitionSummary`, `CognitionHealth` | type | The other 4 methods' request/response shapes |
| `CognitionProvider` | type | The 5-method interface itself |
| `COGNITION_CONTRACT_VERSION` | value | Current contract semver (`"1.0.0"`) |
| `createDegradedCognitionContext` | function | Pure data construction for the fallback shape both sides of the contract use — the only runtime logic in this package |

### `@intelligence-os/core`

**Root surface:**

| Export | Kind | Purpose |
|---|---|---|
| `IntelligenceOS`, `IntelligenceOSConfig` | class, type | The root class and its constructor config |
| `IIntelligenceProvider` | type | The in-process provider contract (§Part 1.A) |
| `IntelligenceOSProvider` | class | Interface-typed adapter over `IntelligenceOS` |
| `InProcessEventBus`, `IntelligenceEventBus` | class, type | The default event bus and its interface |
| `IntelligenceOSError`, `PhaseNotImplementedError`, `DomainNotActivatedError`, `EntityNotFoundError`, `ValidationError`, `DatabaseError` | class | The typed error hierarchy — catch `IntelligenceOSError` to catch all of them |
| `IntelligenceEventType`, `IntelligenceEventPayload<T>` | type | The 14-member event type union and its conditional payload lookup |
| `FeedbackEventPayload`, `KnowledgeAssetPayload`, `ProjectPayload`, `UserCorrectionPayload`, `ProfileUpdatedPayload`, `BlueprintBuiltPayload`, `RecurringConflictPayload`, `LearningReviewedPayload`, `BaseEventPayload` | type | The 9 individual payload interfaces, for typing a handler directly |
| `ProjectInput`, `KnowledgeAssetInput`, `WorkspaceLearningInput`, `WorkspaceConfigurationInput` | type | Inputs to `upsertProject()`, `ingestKnowledgeAsset()`, workspace-scoped learning writes, and `ingestWorkspaceConfiguration()` (ADR-003 §2.4 — see below) |
| `PipelineRunResult`, `PipelineStageError` | type | Learning Pipeline run diagnostics, for observability consumers |
| `KnowledgeProcessorResult`, `KnowledgeStageError`, `KnowledgeAssetLifecycleState`, `VocabularyExtractionResult`, `FrameworkExtractionResult`, `PatternExtractionResult`, `ValidationResult` | type | Knowledge Pipeline run diagnostics |
| `VisualFeatureExtractionResult`, `ExtractedColor`, `ExtractedTypography`, `ExtractedLayout`, `ExtractedMood` | type | Visual-intelligence extraction results (see `ADR-001`) |
| `toLegacyClassification` | function | Backward-compat A–C classification shim (transition utility only) |

**Milestone 2 (CognitionProvider) surface** — re-exported here so a consumer only needs to depend on `@intelligence-os/core`, not on `@platform/cognition-contract` directly, to get both the implementation and the types it satisfies:

| Export | Kind | Purpose |
|---|---|---|
| `CognitionProviderImpl`, `CognitionProviderImplDeps` | class, type | The concrete `CognitionProvider` implementation and its constructor deps — obtain an instance via `IntelligenceOS.asCognitionProvider()` rather than constructing this directly |
| `HealthChecker` | class | Backs `checkHealth()` |
| `createCognitionHttpServer`, `CognitionHttpServerOptions` | function, type | Builds (but does not start) an `http.Server` exposing the 5 HTTP routes; used by both `apps/api` entrypoints (see `DEPLOYMENT.md`) |
| `ContextBuilder` | class | Assembles a `CognitionContext` from the domains — the one module allowed to do so |
| `CognitionProvider`, `CognitionContext`, `CognitionRequest`, `ObservationInput`, `CognitionReviewDecision`, `CognitionSummary`, `CognitionHealth`, `CognitionConfidence`, `VoiceProfile`, `IdentityContribution`, `VisualIdentityProjection`, `CognitionProvenance` | type | Re-exported from `@platform/cognition-contract` |
| `COGNITION_CONTRACT_VERSION`, `createDegradedCognitionContext` | value, function | Re-exported from `@platform/cognition-contract` |

**Optional HTTP port, exported via the `http/server` module but not the root `index.ts`:**

| Export | Where | Purpose |
|---|---|---|
| `KnowledgeIngestPort` | `@intelligence-os/core`'s `api/http/server` module | Optional third argument to `createCognitionHttpServer`. When supplied, activates `POST /v1/knowledge/ingest` (asset in, `{ assetId }` out), reusing `IntelligenceOS.ingestKnowledgeAsset()`. Deliberately not part of `CognitionProvider` itself (knowledge ingestion is a different concern — a write, not a cognition read/observe operation). As of the Completion Mission session, both `apps/api` entrypoints pass `intelligenceOS` here (it already structurally satisfies the port) — see `IMPLEMENTATION_STATUS.md` for when this changed. |

**What's intentionally internal and never exported:** anything under `domains/`, `pipeline/`, `blueprint/`, `knowledge/`, `context/observationToWorkspaceLearning.ts`, `context/voiceMapping.ts`, or `dev/`. If you find yourself needing one of these, that's a signal to request a new method on `IIntelligenceProvider` or `CognitionProvider` rather than an internal import — see `ARCHITECTURE.md` §11, Rule 7.

### Event types (14, single `intelligence.*` namespace)

Subscribable via `intelligenceOS.eventBus.on(type, handler)`. Full payload shapes are the 9 payload interfaces listed above (some event types share a payload shape — `BaseEventPayload` covers several with no dedicated fields yet).

| Event | Emitted by |
|---|---|
| `intelligence.artifact.feedback` | `recordFeedbackEvent()` |
| `intelligence.knowledge_asset.uploaded` | `ingestKnowledgeAsset()` |
| `intelligence.project.created` | `upsertProject()` |
| `intelligence.project.updated` | Project update paths |
| `intelligence.user.correction` | The correction-override path (§9 of `ARCHITECTURE.md`) |
| `intelligence.profile.updated` | `ProfileBuilder`, on a profile rebuild |
| `intelligence.blueprint.built` | `BlueprintBuilder.build()`, on successful assembly |
| `intelligence.learning.recurring_conflict` | Conflict detection, when a conflict repeats |
| `intelligence.learning.reviewed` | `reviewLearning()` |
