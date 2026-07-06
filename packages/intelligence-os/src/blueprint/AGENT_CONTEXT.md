# AGENT_CONTEXT.md — `packages/intelligence-os/src/blueprint`

## Purpose

The Blueprint Pipeline: assembles everything a generation system needs before it writes a single word of an artifact. Five classes plus two private internal helpers, orchestrated by `BlueprintBuilder.build()`, implementing the single most important guarantee in this codebase — `buildBlueprint()` always returns a usable result, for any user, including one IntelligenceOS has never seen before.

## Responsibilities

| Class | Responsibility |
|---|---|
| `ProjectContextBuilder` | Assemble project + workspace + project-scoped learnings + project-scoped knowledge assets into a single `ProjectContext`. Returns a documented empty/default context when `projectId` is absent. |
| `AudienceCalibrator` | Resolve a generic (Phase 1) audience profile for the request, falling back to system defaults when none exists. |
| `StructurePlanner` | Pick the section structure and depth for the artifact, following the priority order `user_calibrated` pattern → `archetype` pattern → `universal` pattern → hardcoded `FALLBACK_SECTIONS`. |
| `NarrativePlanner` | Synchronously assemble voice and vocabulary directives from already-loaded data (profile, project context, audience calibration) — does no I/O of its own. Per ADR-001, this is also the intended integration point for visual guidance (`VisualDirectives`, a sibling type to `VoiceDirectives`/`VocabularyDirectives`) once a visual-feature extractor exists — not a new pipeline step. |
| `ConflictResolutionModel` | Resolve every conflict `detectConflictions()` (in `internal/conflictDetection.ts`) detects, via the fixed authority ordering and the four named override rules (COMPLIANCE, WORKSPACE, RECIPIENT, PROJECT). |
| `BlueprintBuilder` | The orchestrator. Fetches Step 1's four inputs in parallel (each independently fail-soft), runs Steps 2–6 in sequence, assembles the final `ArtifactBlueprint`, and persists + emits an event (both fire-and-forget). |
| `internal/defaults.ts`, `internal/conflictDetection.ts` | Private helpers: hardcoded fallback structures/profiles, and the conflict-detection logic `BlueprintBuilder` calls between Steps 3 and 5. Not exported from `blueprint/index.ts` — nothing outside this directory should import from `internal/` directly. |

## Allowed dependencies

- `../domains/UserIntelligenceDomain`, `../domains/ProjectIntelligenceDomain`, `../domains/ArtifactIntelligenceDomain`, `../domains/KnowledgeIntelligenceDomain`, `../domains/WorkspaceIntelligenceDomain` — **always through their public methods, never through a raw query.**
- `@intelligence-os/shared-types` for every output shape (`BlueprintSection`, `NarrativeFrame`, `AudienceCalibration`, `DepthSpecification`, `ComplianceRequirement`, `DetectedConflict`, `ConflictResolution`, `ArtifactBlueprint`, `ArtifactRequest`).
- `../events/IntelligenceEventBus` (`BlueprintBuilder` only, to emit `intelligence.blueprint.built`).
- `../errors`.

## Forbidden dependencies

- **`@supabase/supabase-js`, anywhere in this directory.** This is the one rule stated explicitly in multiple files' own header comments: every class in `blueprint/` is forbidden from issuing a direct Supabase query. If new data is needed, add a method to the owning domain and call that — this directory has, refreshingly, zero known violations of this rule as of this writing; keep it that way.
- **`pipeline/` or `knowledge/` internals.** This pipeline only *reads* the output of the other two (Learnings via `UserIntelligenceDomain`, Knowledge Assets via `KnowledgeIntelligenceDomain`) — it never imports a pipeline-internal class like `HypothesisEngine` or `KnowledgeAssetExtractor` directly.
- **`RelationshipIntelligenceDomain`.** Not yet wired into `BlueprintBuilder`'s constructor — Phase 1 audience calibration is intentionally generic-only (see `AudienceCalibrator`'s and `RelationshipIntelligenceDomain`'s own docs). Don't add this dependency without checking whether the activation trigger has actually been met.

## Public interfaces

```ts
class ProjectContextBuilder {
  constructor(project: ProjectIntelligenceDomain, workspace: WorkspaceIntelligenceDomain, knowledge: KnowledgeIntelligenceDomain, user: UserIntelligenceDomain);
  build(projectId: string | undefined, userId: string): Promise<ProjectContext>;
}

class AudienceCalibrator {
  constructor(userDomain: UserIntelligenceDomain);
  calibrate(request: ArtifactRequest): Promise<AudienceCalibratorResult>;
}

class StructurePlanner {
  constructor(artifactDomain: ArtifactIntelligenceDomain);
  plan(request: ArtifactRequest, archetype: Archetype | null): Promise<StructurePlan>;
}

class NarrativePlanner {
  plan(/* profile, projectContext, audienceCalibration — all pre-loaded, no I/O */): NarrativePlan;
}

class ConflictResolutionModel {
  resolve(conflicts: DetectedConflict[]): ConflictResolution[];
}

class BlueprintBuilder {
  constructor(domains: BlueprintBuilderDomains, bus: IntelligenceEventBus);
  build(request: ArtifactRequest): Promise<ArtifactBlueprint>;
}
```

`blueprint/index.ts` is the curated export list for this directory — `internal/` is deliberately not part of it.

## Common implementation mistakes

- **Letting any single failed fetch in Step 1 propagate as an exception.** Every one of the four Step 1 fetches in `BlueprintBuilder.build()` must degrade to a documented default (`null`, `[]`, or a default object from `internal/defaults.ts`) rather than reject. If you add a fifth parallel fetch, give it the same `.catch(() => default)` treatment immediately — don't leave it for a follow-up.
- **Issuing a direct Supabase call "just this once" inside a planner class** because adding a new domain method feels like overhead for a one-off need. This is the exact rule this directory currently keeps perfectly — the first violation here would be a meaningful regression, not a minor shortcut.
- **Adding a new conflict-resolution rule without placing it correctly in the authority ordering**, or without deciding whether it needs to be a named override rule (like COMPLIANCE/WORKSPACE/RECIPIENT/PROJECT) versus a plain authority-level comparison. Check `ConflictResolutionModel.resolve()` and the ordering constant it uses before adding a new conflict type — get the ordering wrong and a lower-authority source can silently win over a higher one.
- **Overriding a workspace compliance requirement for any reason**, including an explicit user correction. The Immutability Rule (compliance always wins) has no exception in this codebase — if a new feature seems to need one, that's a sign the feature needs workspace-admin involvement, not a code change here.
- **Forgetting the Transparency Rule** — a significant departure from the user's normal expectation should produce a human-readable note on the `ConflictResolution`, not just a silent resolution. If you add a new resolution path that can meaningfully surprise the user, attach that note.

## Testing expectations

- `tests/unit/blueprint/` has one file per planner class that has interesting branching logic (`AudienceCalibrator`, `ConflictResolutionModel`, `NarrativePlanner`, `StructurePlanner`) — `ProjectContextBuilder` currently has no dedicated unit test and is exercised only via `tests/integration/blueprint.test.ts`; a new contributor adding meaningful logic to `ProjectContextBuilder` should add the missing unit test file rather than relying solely on the integration test's coverage.
- `tests/integration/blueprint.test.ts` is the right place to add a new end-to-end scenario (e.g., "brand-new user, no project, no audience" or "conflicting compliance vs. user-correction") — it should assert on the final `ArtifactBlueprint` shape, not on intermediate planner outputs.
- Every new fail-soft fallback path needs an explicit test that forces the failure and asserts the documented default is used — don't rely on a happy-path test to incidentally cover the fallback branch.
- A new named conflict-resolution rule needs a test asserting it fires in the right priority position relative to the existing four rules, not just that it fires at all in isolation.
