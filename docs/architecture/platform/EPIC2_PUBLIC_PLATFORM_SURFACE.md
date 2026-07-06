# EPIC2_PUBLIC_PLATFORM_SURFACE.md
**IntelligenceOS — Public Platform Surface, maintained as Epic 2 progresses**

> Everything listed below is exported from one of this platform's two packages and is safe for any consumer to depend on. **Everything not listed here is internal** — it may change shape or disappear between minor versions without notice, even if you can technically reach it via a deep import. If you find yourself needing something that isn't listed, that's a signal to request it be added to the public surface deliberately, not to reach past `index.ts`.
>
> Last updated: Session 5 (Epic 2). Re-check this file any time a package's `index.ts` changes.

---

## `@intelligence-os/shared-types`

Pure contract types. Zero runtime dependencies, zero side effects — importing this package adds nothing to a bundle at runtime.

### Exported DTOs

| Export | File | Purpose |
|---|---|---|
| `ArtifactRequest` | `ArtifactRequest.ts` | Input to `buildBlueprint()` |
| `ArtifactType` | `ArtifactRequest.ts` | Open string union — see file for the seeded values; accepts any string |
| `AudienceReference` | `ArtifactRequest.ts` | Optional audience-targeting input on `ArtifactRequest` |
| `ArtifactBlueprint` | `ArtifactBlueprint.ts` | The complete result of `buildBlueprint()` — the platform's one public result type, including Epic 2's `degraded`, `confidenceScore`, `buildDurationMs` |
| `BlueprintSection`, `NarrativeFrame`, `DepthSpecification`, `VoiceDirectives`, `VocabularyDirectives`, `AudienceCalibration`, `ComplianceRequirement`, `DetectedConflict`, `ConflictResolution` | `ArtifactBlueprint.ts` | Nested types composing `ArtifactBlueprint` |
| `FeedbackEvent` | `FeedbackEvent.ts` | Input to `recordFeedbackEvent()` |
| `FeedbackEventType` | `FeedbackEvent.ts` | Union of `FeedbackEvent.eventType` values (`'accepted' \| 'edited' \| 'rejected' \| 'deployed' \| 'explicit_feedback'`) |
| `EditDiff` | `FeedbackEvent.ts` | Nested type on `FeedbackEvent` for `eventType: 'edited'` |
| `VocabularyChange` | `FeedbackEvent.ts` | Nested type on `FeedbackEvent` for vocabulary-correction feedback |
| `IntelligenceSummary` | `IntelligenceSummary.ts` | Return type of `getBrandSummary()` |

**Stability:** the highest-blast-radius package in the repository — a breaking change here breaks every consumer simultaneously. See `CHANGELOG.md` for the versioning policy in practice.

---

## `@intelligence-os/core`

The SDK. Everything below is exported from `packages/intelligence-os/src/index.ts` — that file is the actual source of truth; this table is kept in sync with it, not the reverse.

### Concrete classes & the provider contract

| Export | File | Purpose |
|---|---|---|
| `IntelligenceOS` | `IntelligenceOS.ts` | The root engine class. Construct with `IntelligenceOSConfig`. Implements `IIntelligenceProvider` directly. |
| `IntelligenceOSConfig` | `IntelligenceOS.ts` | Constructor config: `{ supabase: SupabaseClient; eventBus?: IntelligenceEventBus }` |
| `IIntelligenceProvider` | `IIntelligenceProvider.ts` | **(Epic 2 / E2-2)** The platform's published provider contract — `buildBlueprint`, `recordFeedbackEvent`, `ingestKnowledgeAsset`, `upsertProject`, `reviewLearning`, `getBrandSummary`. Deliberately excludes `.eventBus`. Program against this instead of the concrete class if you want to depend on an interface (e.g. for DI). |
| `IntelligenceOSProvider` | `compat/IntelligenceOSProvider.ts` | **(Epic 2 / E2-4)** `IIntelligenceProvider`-typed adapter wrapping an `IntelligenceOS` instance. `new IntelligenceOSProvider(instance)` or `IntelligenceOSProvider.fromConfig(config)`. `.underlying` reaches back to the concrete instance (e.g. for `.eventBus`). |

### Events

| Export | File | Purpose |
|---|---|---|
| `InProcessEventBus` | `events/IntelligenceEventBus.ts` | Default event bus implementation (in-process, fire-and-forget handlers) |
| `IntelligenceEventBus` (type) | `events/IntelligenceEventBus.ts` | The interface, for swapping in a different transport (e.g. a queue-backed bus) at Sprint 4 |
| `IntelligenceEventType` | `types/events.ts` | Union of all 14 event-type strings. As of Session 5, all 14 share the `intelligence.*` namespace — see `IMPLEMENTATION_STATUS.md` Decision 13. |
| `IntelligenceEventPayload<T>` | `types/events.ts` | Conditional type mapping an event type string to its payload shape, e.g. `IntelligenceEventPayload<'intelligence.blueprint.built'>` |
| `FeedbackEventPayload`, `KnowledgeAssetPayload`, `ProjectPayload`, `UserCorrectionPayload`, `ProfileUpdatedPayload`, `BlueprintBuiltPayload`, `RecurringConflictPayload`, `LearningReviewedPayload`, `BaseEventPayload` | `types/events.ts` | The same 9 payload contracts, each also importable directly by name (added Session 5 for ergonomics — no need to write out the conditional-type lookup just to type a handler parameter) |

### Errors (catchable by class)

| Export | Purpose |
|---|---|
| `IntelligenceOSError` | Base class for everything below |
| `PhaseNotImplementedError` | Thrown by a not-yet-built capability |
| `DomainNotActivatedError` | Thrown when a feature-flagged domain hasn't been activated |
| `EntityNotFoundError` | Thrown when an id-based lookup finds nothing |
| `ValidationError` | Thrown on malformed input |
| `DatabaseError` | Thrown when a Supabase call fails unexpectedly (not the fail-soft, degraded-instead-of-throwing paths — see `ArtifactBlueprint.degraded`) |

### Input types

| Export | Purpose |
|---|---|
| `ProjectInput` | Input to `upsertProject()` |
| `KnowledgeAssetInput` | Input to `ingestKnowledgeAsset()` |
| `WorkspaceLearningInput` | Input to `WorkspaceIntelligenceDomain.upsertWorkspaceLearning()` (E1-2) |

### Observability & pipeline-result types

Exported so a consumer can inspect a pipeline run's outcome (e.g. for logging or metrics) without needing internal pipeline classes. None of these are required for the core `buildBlueprint`/`recordFeedbackEvent`/`ingestKnowledgeAsset`/`upsertProject` flow — they're for consumers who want deeper visibility.

| Export | File | Purpose |
|---|---|---|
| `PipelineRunResult`, `PipelineStageError` | `pipeline/types.ts` | Learning-pipeline run outcome (Sprint 2) |
| `KnowledgeProcessorResult`, `KnowledgeStageError`, `KnowledgeAssetLifecycleState`, `VocabularyExtractionResult`, `FrameworkExtractionResult`, `PatternExtractionResult`, `ValidationResult` | `knowledge/types.ts` | Knowledge-pipeline run outcome (Sprint 3) |
| `VisualFeatureExtractionResult`, `ExtractedColor`, `ExtractedTypography`, `ExtractedLayout`, `ExtractedMood` | `knowledge/VisualFeatureExtractor.ts` | Visual intelligence extraction result (E1-4) |

### Compatibility utilities

| Export | File | Purpose |
|---|---|---|
| `toLegacyClassification` | `utils/classificationCompat.ts` | A–C classification backward-compat shim (E1-5, transition only — see that file's own docblock for the deprecation expectations) |

### What's intentionally internal (do not depend on these, even though some are technically reachable)

- Every domain class (`UserIntelligenceDomain`, `ProjectIntelligenceDomain`, etc.) — access these through `IntelligenceOS`/`IIntelligenceProvider`'s methods, never directly.
- Every pipeline/blueprint internal class (`BlueprintBuilder`, `ProjectContextBuilder`, `AudienceCalibrator`, `StructurePlanner`, `NarrativePlanner`, `ConflictResolutionModel`, `FeedbackProcessor`, `KnowledgeProcessor`, `HypothesisEngine`, `LearningValidator`, `ProfileBuilder`) and everything under any `internal/` subdirectory.
- Anything in `types/entities.ts` or `types/domains.ts` not specifically listed above as an exported input type.
- `scripts/check-boundaries.mjs` and its `.d.mts` declarations — maintainer/CI tooling, not part of the SDK, deliberately excluded from the published `files` array.

---

## How this file is kept honest

`packages/intelligence-os/src/index.ts` and `packages/shared-intelligence-types/src/index.ts` are the actual source of truth — both carry a header comment pointing back to this file. If the two ever disagree, the `index.ts` files win; treat the disagreement as a bug in this document and fix this file, not the other way around.
