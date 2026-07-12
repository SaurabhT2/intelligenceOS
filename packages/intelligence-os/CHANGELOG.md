# Changelog — @intelligence-os/core

## 0.3.0 — Completion Mission (independent ADR-003 audit, verified and closed)

Minor version bump per `IIntelligenceProvider.ts`'s own stability note ("pre-1.0, a minor [bump]" for a contract change) — `ingestWorkspaceConfiguration` was added to the interface. Purely additive: every existing implementer (`IntelligenceOS`, and by extension `IntelligenceOSProvider`) already had this method, so no existing consumer's code stops compiling.

### Added
- `IIntelligenceProvider.ingestWorkspaceConfiguration(input)` — promoted from a concrete-class-only method on `IntelligenceOS`, closing the independent ADR-003 Compliance Audit's finding D-4 (a real, tested method with zero reachable callers). `IntelligenceOSProvider` gained the corresponding delegating method.
- `POST /v1/workspace-configuration` HTTP route (`api/http/server.ts`), wired via a new optional `ingestWorkspaceConfiguration` method on `KnowledgeIngestPort`, following the existing `/v1/knowledge/ingest` optional-port precedent exactly (501 when the host app doesn't configure it). Both `apps/api` deployment targets (`src/server.ts`, `api/cognition.ts`) already pass the concrete `IntelligenceOS` instance as this port, so both picked up the new route automatically.
- `WorkspaceConfigurationInput.identityConfiguration` / `WorkspaceContext.identityConfiguration` — a Knowledge-sourced input to identity synthesis, symmetric with the existing `voiceConfiguration` field. `ContextBuilder` gained `applyIdentityConfiguration()`, applied with the same authority (Knowledge outranks Learning-derived identity on every field it declares) `applyVoiceConfiguration()` already has for voice. Closes the audit's finding D-3 (identity synthesis previously drew only from Experience/`Learning`, despite ADR-003 §2.3's own text naming Knowledge and Experience as both required inputs).

### Fixed
- `context/observationToWorkspaceLearning.ts` — deleted. Unimported dead code; ADR-003 §8's addendum had already (incorrectly) claimed this file was deleted (audit finding D-1). The claim is now true.

### Removed
- None. All changes in this release are additive or dead-code removal.

## 0.2.1 — Completion Mission (Session 6, post-Epic-2 architectural completion pass)

No public API signature changes — every constructor touched in this release (`FeedbackProcessor`, `HypothesisEngine`, `LearningValidator`, `ProfileBuilder`, `KnowledgeProcessor`) is internal and not exported from `src/index.ts`. Released as a patch version because real, externally-observable behavior changed even though the TypeScript surface didn't.

### Fixed
- **`intelligence.hypotheses`/`intelligence.learnings`/`intelligence.profiles`/`intelligence.knowledge_assets` writes now correctly route through their owning domain** (Gap Analysis G-2). Previously, `pipeline/HypothesisEngine.ts`, `pipeline/LearningValidator.ts`, `pipeline/ProfileBuilder.ts`, and `knowledge/KnowledgeProcessor.ts` each held a private `SupabaseClient` and wrote past `UserIntelligenceDomain`/`KnowledgeIntelligenceDomain`. No behavior change for callers of `IntelligenceOS`'s public methods — this is an internal integrity fix, not a functional one; the data written is identical, only the code path changed. A related instance in `pipeline/FeedbackProcessor.ts` (a direct write to `intelligence.feedback_events`) was found and fixed in the same pass.
- **`persistBlueprint()`'s header docblock corrected.** This method was already fully implemented and already called by `BlueprintBuilder.build()` — a stale Sprint 0 comment incorrectly described it as an unimplemented stub. No code behavior changed; this is a documentation-only fix, called out here because the audit that preceded this release initially repeated the same stale claim before verifying against the method body directly.

### Added
- `UserIntelligenceDomain`: `getAllActiveLearnings()`, `countLearningsSince()`, `markPreviousProfilesNonCurrent()`, `getLatestValidatedLearning()`, `confirmLearning()`, `findOpenHypothesis()`, `createHypothesis()`, `updateHypothesis()`, `markHypothesisPromoted()`, `discardExpiredHypotheses()`.
- `KnowledgeIntelligenceDomain`: `persistExtracted()`.
- `ArtifactIntelligenceDomain`: `markSignalsExtracted()`.
- `ArtifactBlueprint.degraded` and `.confidenceScore` are now persisted to `intelligence.artifact_blueprints` (schema migration required before this is observable against a live database — see `docs/IMPLEMENTATION_STATUS.md`, migration #4). `buildDurationMs` remains unpersisted by deliberate choice (Decision 15).
- `FeedbackProcessor` now subscribes to `intelligence.user.correction` (previously only `intelligence.artifact.feedback`) and routes it through a new `processCorrection()` method to `LearningValidator.maybeConfirm()` — a previously fully-implemented but uncalled capability. Note: there is still no public method to *emit* this event (`IntelligenceOS.recordCorrection()` does not exist yet); this release connects the handler side only.
- `scripts/check-boundaries.mjs`: new `RULE-PIPELINE-NO-DIRECT-DB` check, exported as `checkNoDirectDb()` / `DOMAIN_OWNERSHIP_RESTRICTED_DIRS`.

### Behavior change (non-breaking, but worth flagging for anyone testing against this package)
- `POST /v1/knowledge/ingest` (via `createCognitionHttpServer`, when the host app passes a `KnowledgeIngestPort`) now works end-to-end when wired by a consuming host app — see `apps/api`'s own changes. This package's HTTP server code itself did not change; only the two example host apps in this monorepo (`apps/api`) now actually wire the optional third argument that was always supported.

## 0.2.0 — Epic 2 (Platform Publication)

### Breaking
- Package renamed from `@brandos/intelligence-os` to `@intelligence-os/core` (Gap Analysis G-1). There was no published consumer of the old name yet, so this is a rename, not a deprecation cycle.
- All 5 "consumer → Intelligence OS" event type strings renamed from the `brandos.*` namespace to `intelligence.*`, unifying all 14 event types under one namespace (Gap Analysis G-1):
  - `brandos.artifact.feedback` → `intelligence.artifact.feedback`
  - `brandos.knowledge_asset.uploaded` → `intelligence.knowledge_asset.uploaded`
  - `brandos.project.created` → `intelligence.project.created`
  - `brandos.project.updated` → `intelligence.project.updated`
  - `brandos.user.correction` → `intelligence.user.correction`

  If you have any code subscribing to these event type strings, update it to the new names. There was no live external subscriber at the time of this change.
- `intelligence.blueprint.built`'s payload was promoted from the generic `BaseEventPayload` fallback to a dedicated `BlueprintBuiltPayload` (`{ userId, entityId, entityType: 'blueprint', occurredAt, processingMs, artifactType }`). If you were reading undeclared fields off this payload via the old fallback's index signature, they're now explicitly typed — no runtime shape change, but `unknown`-typed reads of `processingMs`/`artifactType` are now properly typed `number`/`string`.

### Added
- `IIntelligenceProvider` — the platform's published provider contract (E2-2). `IntelligenceOS` now `implements` it directly.
- `IntelligenceOSProvider` (E2-4) — an `IIntelligenceProvider`-typed adapter over `IntelligenceOS`, for consumers who want to depend on the interface (e.g. for dependency injection) rather than the concrete class. Construct via `new IntelligenceOSProvider(existingInstance)` or `IntelligenceOSProvider.fromConfig(config)`.
- `ArtifactBlueprint.degraded`, `.confidenceScore`, `.buildDurationMs` now populated on every blueprint `buildBlueprint()` returns (the fields themselves are defined in `@intelligence-os/shared-types`; this release is what actually computes and fills them in).
- `scripts/check-boundaries.mjs` — standalone platform boundary-validation tool (RULE-IOS-ISOLATION, RULE-SIT-ISOLATION). Run via `pnpm run check:boundaries`.
- Package is now genuinely publishable: `publishConfig` pointing at compiled `dist/`, a `build` script, `sideEffects: false`, and no `private: true`.

### Fixed
- Four pre-existing `noImplicitAny` TypeScript errors in the domain layer (`KnowledgeIntelligenceDomain`, `ProjectIntelligenceDomain`, `UserIntelligenceDomain`, `WorkspaceIntelligenceDomain`), surfaced by a newer installed TypeScript patch version than the one the code was last verified against. Unrelated to Epic 2's scope but blocking a clean `pnpm -r typecheck` baseline before this session's changes could be verified against it.

## 0.1.0

Initial Epic 1 implementation. `IntelligenceOS` with `buildBlueprint`, `recordFeedbackEvent`, `ingestKnowledgeAsset`, `upsertProject`, `reviewLearning`, `getBrandSummary`, and the event-driven learning pipeline.
