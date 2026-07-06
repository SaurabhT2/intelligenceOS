# AGENT_CONTEXT.md — `packages/shared-intelligence-types`

## Purpose

Defines the integration boundary. Every type a calling system needs to send a request into IntelligenceOS or receive a result back lives here, and only here. This package has no runtime logic — it compiles to nothing; it exists purely to give both sides of the boundary a single, shared, versioned vocabulary.

## Responsibilities

- Define `ArtifactRequest` — the input to `IntelligenceOS.buildBlueprint()` (`ArtifactRequest.ts`).
- Define `ArtifactBlueprint` and every sub-type it's composed of — `BlueprintSection`, `NarrativeFrame`, `AudienceCalibration`, `DepthSpecification`, `ComplianceRequirement`, `DetectedConflict`, `ConflictResolution` — the output of `buildBlueprint()` (`ArtifactBlueprint.ts`).
- Define `FeedbackEvent` and its sub-types `EditDiff`, `VocabularyChange` — the input to `IntelligenceOS.recordFeedbackEvent()` (`FeedbackEvent.ts`).
- Re-export everything from a single `index.ts` so consumers never need to know which file a type physically lives in.

This package does **not** define anything pipeline-internal (no `Signal`, `Observation`, `Hypothesis` — those live in `intelligence-os/src/types/` and `intelligence-os/src/pipeline/types.ts`, and are never exported across the boundary).

## Allowed dependencies

- None at runtime. `devDependencies` only contains `typescript`.

## Forbidden dependencies

- `@supabase/supabase-js` or any database client — this package must remain usable by a calling system with zero knowledge of how IntelligenceOS persists anything.
- Any import from `intelligence-os` — dependency direction is one-way (`intelligence-os` depends on this package; never the reverse). If you find yourself wanting to import something from `intelligence-os` into this package, the type belongs in `intelligence-os/src/types/` instead, or it's a sign the boundary itself needs to move.
- Anything pipeline-internal (`Signal`, `Observation`, `Hypothesis`, `RebuildDecision`, taxonomy/stability internals). These are intentionally not part of the contract — a calling system should never need to reason about confidence ceilings or corroboration thresholds to use IntelligenceOS correctly.

## Public interfaces

```ts
// ArtifactRequest.ts
export type ArtifactType = /* open string union, see file for current values */;
export interface AudienceReference { relationshipId?: string; audienceType?: /* ... */; }
export interface ArtifactRequest {
  userId: string;
  workspaceId?: string;
  projectId?: string;
  artifactType: ArtifactType;
  audienceRef?: AudienceReference;
  hints?: { urgency?: 'high' | 'standard'; recipientName?: string; topicOverride?: string };
}

// ArtifactBlueprint.ts — the platform's one public result type for blueprint
// generation (Epic 2 deliberately did not introduce a second, consumer-side
// alias type — see this file's own docblock for why).
export interface ArtifactBlueprint {
  id: string;
  userId: string;
  artifactType: ArtifactType;
  projectId: string | null;
  sections: BlueprintSection[];
  narrativeFrame: NarrativeFrame;
  depthSpec: DepthSpecification;
  voiceDirectives: VoiceDirectives;
  vocabularyDirectives: VocabularyDirectives;
  audienceCalibration: AudienceCalibration;
  complianceRequirements: ComplianceRequirement[];
  conflictsDetected: DetectedConflict[];
  conflictsResolved: ConflictResolution[];
  intelligenceProfileVersion: number;
  createdAt: Date;
  degraded: boolean;          // Epic 2 / E2-1-T1 — see ArtifactBlueprint.ts docblock
  confidenceScore: number;    // Epic 2 / E2-1-T1 — 0–1
  buildDurationMs: number;    // Epic 2 / E2-1-T1
}

// FeedbackEvent.ts
export interface FeedbackEvent {
  userId: string;
  artifactId: string;
  artifactType: ArtifactType;
  projectId?: string;
  blueprintId?: string;       // correlates feedback to the blueprint used
  eventType: 'accepted' | 'edited' | 'rejected' | 'deployed' | 'explicit_feedback';
  editDiff?: EditDiff;
  explicitReason?: string;
}
```

Treat every exported type here as a stability-critical public API — more so than almost anything in `intelligence-os` itself, because a breaking change here breaks every consumer at once, not just internal callers. **Epic 2 note:** the field shapes above were corrected to match the actual implementation in `ArtifactRequest.ts` / `ArtifactBlueprint.ts` / `FeedbackEvent.ts` — earlier revisions of this file showed an aspirational shape (`blueprintRef`, `outcome`, `contextFlags`, `depthSpecification`, `detectedConflicts`, `resolutions`) drafted before Epic 1 implementation reconciled the design. The source files are always the ground truth; this block is kept in sync with them, not the reverse.

## Common implementation mistakes

- **Adding a field "just for this one caller's convenience."** Every field added here is a permanent commitment across the integration boundary. If a field is specific to one calling system's needs rather than a genuine property of an artifact request/blueprint/feedback event, it likely belongs in that system's own code, passed alongside the IntelligenceOS types rather than merged into them.
- **Reaching for a placeholder escape hatch (`[key: string]: unknown`) instead of defining the real shape.** Several sub-types in `ArtifactBlueprint.ts` originally shipped with this pattern as a stand-in before their owning component (`NarrativePlanner`, `StructurePlanner`, `ConflictResolutionModel`) existed. Those have since been filled in with concrete shapes — don't reintroduce the pattern for a new field just to defer a design decision; define the real shape, even narrowly, from the start.
- **Importing this package's types into `intelligence-os` and then re-exporting them under a different name.** `intelligence-os/src/index.ts` imports directly from this package where it needs these types (e.g. `ArtifactRequest`, `ArtifactBlueprint`, `FeedbackEvent` inside `IntelligenceOS.ts`) — there's no need for an intermediate re-export layer.

## Testing expectations

- No runtime behavior, so no unit tests of this package's own code are needed or expected.
- Type-level correctness is enforced by `pnpm typecheck`, which the `intelligence-os` package's own type errors will surface immediately if a shape here changes incompatibly — that cross-package type error *is* this package's test suite. Don't add a `tests/` directory here; if you need to validate something at runtime, that validation belongs in the `intelligence-os` code that consumes the type, not in this package.
