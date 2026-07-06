# @intelligence-os/shared-types

Contract types for [Intelligence OS](https://www.npmjs.com/package/@intelligence-os/core) — the request, response, and event DTOs any consumer needs to call Intelligence OS and interpret its results.

**Zero runtime dependencies.** This package exports TypeScript types and interfaces only — no functions, no classes, no side effects. Importing it adds nothing to your bundle at runtime.

## Install

```bash
npm install @intelligence-os/shared-types
```

## What's exported

| Type | Purpose |
|---|---|
| `ArtifactRequest`, `ArtifactType`, `AudienceReference` | What you send in to `buildBlueprint()` |
| `ArtifactBlueprint`, `BlueprintSection`, `NarrativeFrame`, `DepthSpecification`, `VoiceDirectives`, `VocabularyDirectives`, `AudienceCalibration`, `ComplianceRequirement`, `DetectedConflict`, `ConflictResolution` | The structured result `buildBlueprint()` returns |
| `FeedbackEvent`, `EditDiff` | What you send in to `recordFeedbackEvent()` |
| `IntelligenceSummary` | What `getBrandSummary()` returns |

See each file under `src/` for full field-level documentation — every type carries a docblock explaining its fields and the reasoning behind any non-obvious shape decisions.

## Stability

These types are the integration boundary between Intelligence OS and every consumer at once. A breaking change here breaks everyone simultaneously, so changes are treated conservatively — additive fields are preferred over restructuring, and any genuinely breaking change gets a CHANGELOG entry and a version bump that signals it. See [`@intelligence-os/core`](../intelligence-os/README.md)'s README for the platform's overall versioning policy.

## Relationship to `@intelligence-os/core`

This package has no dependency on `@intelligence-os/core` — it's intentionally the other way around. You can depend on `@intelligence-os/shared-types` alone if you only need to type your own data against Intelligence OS's contracts (for example, to type a database column or an API payload) without taking on the full SDK.
