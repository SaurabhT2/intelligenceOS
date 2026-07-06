# Changelog — @intelligence-os/core

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
