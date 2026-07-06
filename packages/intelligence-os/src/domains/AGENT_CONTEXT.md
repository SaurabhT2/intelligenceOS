# AGENT_CONTEXT.md — `packages/intelligence-os/src/domains`

## Purpose

The persistence boundary. Six classes, each owning a disjoint set of `intelligence.*` Postgres tables, and each the *only* code in the entire repository permitted to read or write those tables. This is the single most important boundary in the codebase — more of the system's long-term integrity depends on this directory's discipline holding than on any other.

## Responsibilities

| Class | Owns (tables) | Sprint activated |
|---|---|---|
| `UserIntelligenceDomain` | `profiles`, `learnings`, `archetypes`, generic rows in `audience_profiles` | Reads: Sprint 0/1. Writes (`upsertProfile`, `insertLearning`): defined but not yet called from outside the Learning Pipeline — see Common Implementation Mistakes below. Also the intended owner of visual-modality `Learning`s (color/typography/mood/motion) per ADR-001 — these are `taxonomyCategory` values on the same table, not a separate domain. |
| `ProjectIntelligenceDomain` | `projects` | Sprint 0, fully live (reads and writes). |
| `ArtifactIntelligenceDomain` | `artifact_patterns`, `artifact_exemplars`, `feedback_events`, `artifact_blueprints` | Pattern reads + feedback/blueprint writes: Sprint 0/1. `promoteExemplar()`: stub. |
| `KnowledgeIntelligenceDomain` | `knowledge_assets` | Reads: Sprint 1. `ingestAsset()`: stub — see Sprint 3 note below. |
| `WorkspaceIntelligenceDomain` | workspace-scoped knowledge assets, compliance constraints | Partial by design. `getContext()` and `enforceComplianceConstraints()` live; `syncSharedVocabulary()` is a Phase 2 stub. |
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
  getCurrentArchetype(userId: string): Promise<Archetype | null>;
  getGenericAudienceProfile(userId: string): Promise<AudienceProfile | null>;
  upsertProfile(profile: IntelligenceProfile): Promise<void>;
  insertLearning(learning: Omit<Learning, 'id'|'createdAt'|'updatedAt'>): Promise<Learning>;
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
  promoteExemplar(input: ArtifactExemplarInput): Promise<ArtifactExemplar>; // stub
  persistBlueprint(blueprint: ArtifactBlueprint): Promise<void>;
}

class KnowledgeIntelligenceDomain {
  getAssets(filter: KnowledgeAssetFilter): Promise<KnowledgeAsset[]>;
  getAssetById(id: string): Promise<KnowledgeAsset | null>;
  requireAsset(id: string): Promise<KnowledgeAsset>; // throws EntityNotFoundError
  ingestAsset(input: KnowledgeAssetInput): Promise<string>; // stub — throws PhaseNotImplementedError
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

- **Writing to an `intelligence.*` table from outside `domains/`.** This is the rule the directory exists to enforce, and it currently has real, known violations elsewhere in the codebase worth knowing about before you compound them: `pipeline/HypothesisEngine.ts`, `pipeline/LearningValidator.ts`, and `pipeline/ProfileBuilder.ts` each hold their own `SupabaseClient` and write to `intelligence.hypotheses`, `intelligence.learnings`, and `intelligence.profiles` directly, bypassing `UserIntelligenceDomain` even though it defines `insertLearning()` and `upsertProfile()` for exactly this purpose. `knowledge/KnowledgeProcessor.ts` does the same against `intelligence.knowledge_assets`, bypassing `KnowledgeIntelligenceDomain`. **Do not write a sixth instance of this pattern.** If you're touching any of those four files, the correct fix is routing the write through the owning domain (adding a method there if one doesn't exist yet), not adding a new direct-write call site elsewhere. See Gap Analysis G-2.
- **Assuming a domain method is real because its name sounds basic.** `RelationshipIntelligenceDomain.getActiveRelationships()` reads like the simplest possible method and throws unconditionally. Always check the docblock or `package_inventory.generated.md` before calling a domain method you haven't called before.
- **Returning a raw Supabase row shape instead of mapping to the domain's entity type.** Every domain file defines a private row interface and a `mapToX()` function — new query methods should follow this same map-at-the-boundary pattern rather than leaking `snake_case` database columns into the rest of the codebase.
- **Forgetting `is_current: true` filtering on tables that version rows** (`profiles`, `knowledge_assets`). `KnowledgeIntelligenceDomain.getAssets()` defaults to `is_current = true` unless the caller explicitly passes `isCurrent: false` — match this convention in any new versioned-row query.

## Testing expectations

- Every domain method needs at least one test against a mocked `SupabaseClient` exercising the real path, and (where applicable) one exercising the stub path's thrown error type.
- Mock shape: chain `.schema('intelligence').from('<table>').select()/.upsert()/.eq()/.maybeSingle()` etc. — see `createMockSupabase` in `tests/integration/intelligence-os.test.ts` for the established pattern; new domain tests should reuse or extend that factory rather than building a new mock shape from scratch.
- A new domain method should be exercised by at least one of: a focused unit test, the relevant pipeline's unit tests (if it's consumed there), or `tests/integration/intelligence-os.test.ts` (if it's reachable from a public `IntelligenceOS` method).
