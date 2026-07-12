# AGENT_CONTEXT.md — `packages/intelligence-os/src/domains`

## Purpose

The persistence boundary. Six classes, each owning a disjoint set of `intelligence.*` Postgres tables, and each the *only* code in the entire repository permitted to read or write those tables. This is the single most important boundary in the codebase — more of the system's long-term integrity depends on this directory's discipline holding than on any other.

## Completion Mission update (post-Epic-2 session)

Gap Analysis G-2 resolved: `UserIntelligenceDomain.upsertProfile()`/`insertLearning()` are now real (previously documented-but-unused stubs), and both gained real callers — `pipeline/ProfileBuilder.ts` and `pipeline/LearningValidator.ts` respectively. `UserIntelligenceDomain` also gained a full Hypothesis CRUD surface (`findOpenHypothesis`/`createHypothesis`/`updateHypothesis`/`markHypothesisPromoted`/`discardExpiredHypotheses`) — added here rather than as a seventh domain, since hypotheses are pipeline-internal precursors to Learnings with no independent product concept of their own (see `UserIntelligenceDomain.ts`'s header docblock for the full reasoning). `KnowledgeIntelligenceDomain` gained `persistExtracted()`, now called by `knowledge/KnowledgeProcessor.ts`. `ArtifactIntelligenceDomain` gained `markSignalsExtracted()`, now called by `pipeline/FeedbackProcessor.ts` (a second instance of the same anti-pattern, found and fixed alongside the three originally-flagged ones). `pipeline/`, `knowledge/`, `blueprint/`, and `context/` no longer hold a `SupabaseClient` anywhere — mechanically enforced by RULE-PIPELINE-NO-DIRECT-DB in `packages/intelligence-os/scripts/check-boundaries.mjs`. See `docs/IMPLEMENTATION_STATUS.md` for the full session entry.

Also corrected this session: this file's own table below previously, incorrectly, listed `WorkspaceIntelligenceDomain.enforceComplianceConstraints()` as live. It is a stub (`PhaseNotImplementedError`, Phase 2) — verify against the source file, not this table, when in doubt; see the note left in `WorkspaceIntelligenceDomain.ts` itself.

## Responsibilities

| Class | Owns (tables) | Sprint activated |
|---|---|---|
| `UserIntelligenceDomain` | `profiles`, `learnings`, `archetypes`, `hypotheses`, generic rows in `audience_profiles` | Reads: Sprint 0/1. Writes (`upsertProfile`, `insertLearning`, hypothesis CRUD, `confirmLearning`): real, called from the Learning Pipeline (`pipeline/`) as of the Completion Mission session. Also the intended owner of visual-modality `Learning`s (color/typography/mood/motion) per ADR-001 — these are `taxonomyCategory` values on the same table, not a separate domain. |
| `ProjectIntelligenceDomain` | `projects` | Sprint 0, fully live (reads and writes). |
| `ArtifactIntelligenceDomain` | `artifact_patterns`, `artifact_exemplars`, `feedback_events`, `artifact_blueprints` | Pattern reads + feedback/blueprint writes: Sprint 0/1, real (`persistBlueprint()` is real, not a stub — despite an earlier version of this table's claim; also persists `degraded`/`confidenceScore` as of the Completion Mission session). `markSignalsExtracted()`: real, new this session. `promoteExemplar()`, `updatePatternFromExemplar()`: stubs. |
| `KnowledgeIntelligenceDomain` | `knowledge_assets` | Reads: Sprint 1. `persistExtracted()`: real, new this session — the actual write path (`knowledge/KnowledgeProcessor.ts` calls it). `ingestAsset()`: intentional stub, not the real upload entry point — see Sprint 3 note below. |
| `WorkspaceIntelligenceDomain` | workspace-scoped knowledge assets, compliance constraints | Partial by design. `getContext()` and `getWorkspaceLearnings()`/`upsertWorkspaceLearning()` live; `enforceComplianceConstraints()` and `syncSharedVocabulary()` are both Phase 2 stubs (see Gap Analysis G-6 — the activation trigger for this domain's governance surface is not yet evaluated anywhere). |
| `RelationshipIntelligenceDomain` | `relationships`, named rows in `audience_profiles` | Fully inert. Every method throws `DomainNotActivatedError`. Activates per Contracts §J.3 trigger (≥3 external artifacts with named recipients, or an onboarding signal) — not yet met. |

Each file's own header docblock is the authoritative, up-to-date statement of which of its methods are real (✓) vs. stubbed (✗) — read the file you're about to touch before trusting this table's summary.

## Allowed dependencies

- `@supabase/supabase-js` (`SupabaseClient` type, injected via constructor — never constructed here).
- `../types/entities`, `../types/domains` (the internal entity and domain-input/filter types).
- `../errors` (`DatabaseError`, `EntityNotFoundError`, `DomainNotActivatedError`, `PhaseNotImplementedError`).
- `@intelligence-os/shared-types`, but only for the two domains that need it: `ArtifactIntelligenceDomain` imports `FeedbackEvent` and `ArtifactBlueprint` because those are the shapes it persists.

## Forbidden dependencies

- **Another domain class.** No domain imports another domain. If `ArtifactIntelligenceDomain` ever needs data that `UserIntelligenceDomain` owns, that composition happens one layer up (in `blueprint/` or `pipeline/`, which are allowed to hold multiple domain references), never by one domain reaching into another's table.
- **Anything from `blueprint/`, `pipeline/`, or `knowledge/`.** Dependency direction is strictly one-way: those three pipelines depend on domains; domains never depend on a pipeline.
- **`process.env` or any direct credential/config read.** The Supabase client always arrives via constructor injection from `IntelligenceOS.ts`.

## Public interfaces

Representative methods (see each file for the complete, current list — and remember `package_inventory.generated.md` tracks real-vs-stub status mechanically, so check there before assuming a signature below is live):

```ts
class UserIntelligenceDomain {
  getCurrentProfile(userId: string): Promise<IntelligenceProfile | null>;
  getActiveLearnings(userId: string, filter?: ...): Promise<Learning[]>;
  getAllActiveLearnings(userId: string): Promise<Learning[]>; // new — all domains, for ProfileBuilder
  countLearningsSince(userId: string, since: Date, minConfidence: number): Promise<number>; // new
  getCurrentArchetype(userId: string): Promise<Archetype | null>;
  getGenericAudienceProfile(userId: string): Promise<AudienceProfile | null>;
  upsertProfile(profile: IntelligenceProfile): Promise<void>;
  markPreviousProfilesNonCurrent(userId: string, excludeId: string): Promise<void>; // new
  insertLearning(learning: Omit<Learning, 'id'|'createdAt'|'updatedAt'>): Promise<Learning>;
  getLatestValidatedLearning(userId: string, category: TaxonomyCategory): Promise<Learning | null>; // new
  confirmLearning(learningId: string, confidence: number): Promise<void>; // new
  findOpenHypothesis(userId: string, category: TaxonomyCategory, contextScope: string): Promise<Hypothesis | null>; // new
  createHypothesis(payload: Record<string, unknown>): Promise<Hypothesis>; // new
  updateHypothesis(hypothesisId: string, updates: Record<string, unknown>): Promise<Hypothesis>; // new
  markHypothesisPromoted(hypothesisId: string, learningId: string): Promise<void>; // new
  discardExpiredHypotheses(userId: string): Promise<number>; // new
}

class ProjectIntelligenceDomain {
  getProject(projectId: string): Promise<Project | null>;
  getProjectByBrandosId(externalProjectId: string): Promise<Project | null>;
  getActiveProjects(userId: string): Promise<Project[]>;
  upsertProject(input: ProjectInput): Promise<string>;
  updateLifecycleState(projectId: string, state: ...): Promise<void>;
  requireProject(projectId: string): Promise<Project>; // throws EntityNotFoundError
}

class ArtifactIntelligenceDomain {
  getPattern(artifactType: ArtifactType, scope: ...): Promise<ArtifactPattern | null>;
  recordFeedbackEvent(event: FeedbackEvent): Promise<FeedbackEventRecord>;
  markSignalsExtracted(artifactId: string, userId: string): Promise<void>; // new
  promoteExemplar(input: ArtifactExemplarInput): Promise<ArtifactExemplar>; // stub
  persistBlueprint(blueprint: ArtifactBlueprint): Promise<void>; // real — see table above
}

class KnowledgeIntelligenceDomain {
  getAssets(filter: KnowledgeAssetFilter): Promise<KnowledgeAsset[]>;
  getAssetById(id: string): Promise<KnowledgeAsset | null>;
  requireAsset(id: string): Promise<KnowledgeAsset>; // throws EntityNotFoundError
  persistExtracted(input: KnowledgeAssetUpsertInput): Promise<KnowledgeAsset>; // new — real write path
  ingestAsset(input: KnowledgeAssetInput): Promise<string>; // intentional stub — throws PhaseNotImplementedError
}

class WorkspaceIntelligenceDomain {
  getContext(workspaceId: string): Promise<WorkspaceContext>;
  enforceComplianceConstraints(workspaceId: string, ...): Promise<ComplianceRequirement[]>;
  syncSharedVocabulary(workspaceId: string): Promise<void>; // stub
}

class RelationshipIntelligenceDomain {
  // every method throws DomainNotActivatedError — see file for the full inert surface
}
```

## Common implementation mistakes

- **Writing to an `intelligence.*` table from outside `domains/`.** This is the rule the directory exists to enforce. It was violated in four places (`pipeline/HypothesisEngine.ts`, `pipeline/LearningValidator.ts`, `pipeline/ProfileBuilder.ts`, `knowledge/KnowledgeProcessor.ts`) plus one more found in the same pass (`pipeline/FeedbackProcessor.ts`'s own `feedback_events` update) — all five are fixed as of the Completion Mission session, and RULE-PIPELINE-NO-DIRECT-DB now catches a regression of this pattern automatically for `pipeline/`, `knowledge/`, `blueprint/`, and `context/`. **The rule itself doesn't change**: if you're adding a new write anywhere in the codebase, it goes through the domain that owns the table (adding a method there if one doesn't exist yet), never a fresh `SupabaseClient` reaching around it.
- **Assuming a domain method is real because its name sounds basic.** `RelationshipIntelligenceDomain.getActiveRelationships()` reads like the simplest possible method and throws unconditionally. Always check the docblock or `package_inventory.generated.md` before calling a domain method you haven't called before.
- **Returning a raw Supabase row shape instead of mapping to the domain's entity type.** Every domain file defines a private row interface and a `mapToX()` function — new query methods should follow this same map-at-the-boundary pattern rather than leaking `snake_case` database columns into the rest of the codebase.
- **Forgetting `is_current: true` filtering on tables that version rows** (`profiles`, `knowledge_assets`). `KnowledgeIntelligenceDomain.getAssets()` defaults to `is_current = true` unless the caller explicitly passes `isCurrent: false` — match this convention in any new versioned-row query.

## Testing expectations

- Every domain method needs at least one test against a mocked `SupabaseClient` exercising the real path, and (where applicable) one exercising the stub path's thrown error type.
- Mock shape: chain `.schema('intelligence').from('<table>').select()/.upsert()/.eq()/.maybeSingle()` etc. — see `createMockSupabase` in `tests/integration/intelligence-os.test.ts` for the established pattern; new domain tests should reuse or extend that factory rather than building a new mock shape from scratch.
- A new domain method should be exercised by at least one of: a focused unit test, the relevant pipeline's unit tests (if it's consumed there), or `tests/integration/intelligence-os.test.ts` (if it's reachable from a public `IntelligenceOS` method).
