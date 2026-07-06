# Changelog — @intelligence-os/shared-types

## 0.2.0 — Epic 2 (Platform Publication)

### Breaking
- Package renamed from `@brandos/shared-intelligence-types` to `@intelligence-os/shared-types` (Gap Analysis G-1). There was no published consumer of the old name yet, so this is a rename, not a deprecation cycle.

### Added
- `ArtifactBlueprint` gained three fields: `degraded` (boolean), `confidenceScore` (0–1), `buildDurationMs` (number). All three are additive and required on every blueprint `@intelligence-os/core` returns going forward — see `ArtifactBlueprint.ts`'s docblock for exact semantics. Not yet persisted to the `artifact_blueprints` audit table (see `@intelligence-os/core`'s known gaps); returned to the caller only.

## 0.1.0

Initial Epic 1 implementation. `ArtifactRequest`, `ArtifactBlueprint`, `FeedbackEvent`, `IntelligenceSummary` and their nested types.
