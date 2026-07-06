# AGENT_CONTEXT.md — `packages/intelligence-os`

## Purpose

The engine. Everything that turns accumulated user context into a Blueprint, and everything that turns feedback and uploads back into accumulated context. This is the package a consumer depends on; everything inside it except the public surface curated by `index.ts` is an implementation detail.

This is a **package-root** context file. Seven sub-areas inside this package (`domains/`, `pipeline/`, `blueprint/`, `knowledge/`, `events/`, `db/`, and `compat/`, added at Epic 2) are large and bounded enough to warrant their own `AGENT_CONTEXT.md` — see the individual files for `domains/`, `pipeline/`, `blueprint/`, and `knowledge/` in particular, since those carry the most boundary-sensitive rules. This file covers the package as a whole: `IntelligenceOS.ts`, `IIntelligenceProvider.ts`, `index.ts`, `errors.ts`, and `types/`.

## Responsibilities

- `IntelligenceOS.ts` — construct the six domain stores and three pipeline orchestrators from a single `IntelligenceOSConfig`, and expose the platform's public methods plus an event-bus accessor. Formally `implements IIntelligenceProvider` (Epic 2) — a compile-time guarantee the two never drift apart.
- `IIntelligenceProvider.ts` (Epic 2 / E2-2) — the platform's published provider contract: every method a consumer's core logic should depend on, deliberately excluding `.eventBus` (see that file's docblock for why, and `compat/AGENT_CONTEXT.md` for the adapter that implements it independently of the concrete class).
- `index.ts` — curate the public export surface. Nothing outside this file's export list should be considered stable or importable by a consumer. See `docs/EPIC2_PUBLIC_PLATFORM_SURFACE.md` for the maintained, annotated list.
- `errors.ts` — the typed error hierarchy every domain and pipeline throws from: `IntelligenceOSError` (base), `PhaseNotImplementedError`, `DomainNotActivatedError`, `EntityNotFoundError`, `ValidationError`, `DatabaseError`.
- `types/entities.ts`, `types/domains.ts`, `types/events.ts` — internal type definitions not exported wholesale; `index.ts` cherry-picks what a consumer actually needs.

## Allowed dependencies

- `@intelligence-os/shared-types` (the contract package — renamed from `@brandos/shared-intelligence-types` at Epic 2 per Gap Analysis G-1; the rename is complete, not pending).
- `@supabase/supabase-js`, used only as a `SupabaseClient` type/instance passed in from outside via `IntelligenceOSConfig` — this package never creates its own client or reads connection credentials itself.
- Node's built-in `crypto.randomUUID()`.

## Forbidden dependencies

- No HTTP client, no LLM SDK, no queue client (`bullmq`, `inngest`, etc.) — every extractor and classifier in this package is deterministic, in-process pattern matching by design (see bootstrap §12). If a feature genuinely needs one of these, that's a deliberate architectural decision requiring design review, not an incidental dependency to add.
- No environment-variable reads (`process.env.*`) anywhere in `src/`. Configuration arrives exclusively through `IntelligenceOSConfig` at construction time — this keeps the package fully testable without environment setup and keeps secrets (the Supabase service-role key) entirely in the consumer's control.
- **No dependency, anywhere in `src/`, on any consumer application's package or source tree.** This was always true in spirit (the package was always meant to be consumed, not to depend on its consumer) but Epic 2 made it a checked rule — `scripts/check-boundaries.mjs` (RULE-IOS-ISOLATION) scans for it. `compat/` is not exempt; an adapter directory is exactly where this kind of dependency would be tempting to add "just this once."

## Public interfaces

```ts
interface IIntelligenceProvider {  // Epic 2 / E2-2 — the published contract
  buildBlueprint(request: ArtifactRequest): Promise<ArtifactBlueprint>;
  recordFeedbackEvent(event: FeedbackEvent): Promise<void>;
  ingestKnowledgeAsset(asset: KnowledgeAssetInput, rawContent?: string): Promise<string>;
  upsertProject(input: ProjectInput): Promise<string>;
  reviewLearning(userId: string, learningId: string, approved: boolean, reviewedBy: string): Promise<void>;
  getBrandSummary(params: { userId: string; workspaceId?: string }): Promise<IntelligenceSummary>;
}

class IntelligenceOS implements IIntelligenceProvider {
  constructor(config: IntelligenceOSConfig); // { supabase: SupabaseClient; eventBus?: IntelligenceEventBus }
  readonly domains: { user, project, artifact, knowledge, relationship, workspace };
  // ...every IIntelligenceProvider method, plus:
  get eventBus(): IntelligenceEventBus;  // deliberately not part of IIntelligenceProvider — see that file
}
```

Everything else exported from `index.ts` (`InProcessEventBus`, `IntelligenceOSProvider`, the error classes, the event-type union, `ProjectInput`/`KnowledgeAssetInput`, the pipeline/knowledge result types) exists to support calling that surface correctly — to catch errors by class, subscribe to events, swap in an interface-typed adapter, or inspect a pipeline run's result for observability. None of it is meant to be the primary way a consumer interacts with Intelligence OS.

## Common implementation mistakes

- **Changing an `IIntelligenceProvider` method's signature without treating it as a deliberate, versioned breaking change.** That file's own docblock states this; `IntelligenceOS implements IIntelligenceProvider` means TypeScript will refuse to compile if the two drift apart, which is the point — don't "fix" the resulting compile error by removing the `implements` clause instead of reconciling the two deliberately.
- **Constructing a domain or pipeline class directly from outside this package**, bypassing `IntelligenceOS`'s constructor wiring. There should be exactly one place (`IntelligenceOS.ts`) that knows how the six domains and three pipelines get assembled.
- **Reading `process.env` inside a new file** because it's the path of least resistance for a quick config value. It breaks the package's zero-setup testability — route configuration through `IntelligenceOSConfig` instead, even if that means a slightly more verbose constructor.
- **Throwing a plain `Error` instead of one of the typed errors in `errors.ts`.** Consumers catch by class (`instanceof PhaseNotImplementedError`, etc.) — a plain `Error` is invisible to that pattern and will be handled as an unexpected failure instead of an expected, documented one.

## Testing expectations

- Package-level: `pnpm typecheck` and `pnpm test` (vitest) must both pass with zero setup — no `.env`, no live Supabase instance, no network access. Every test mocks `SupabaseClient` (see the domain/pipeline-specific `AGENT_CONTEXT.md` files for the exact mock shape each area needs).
- A change to `IntelligenceOS.ts`'s constructor or public methods should always be exercised by `tests/integration/intelligence-os.test.ts` — that file is the canonical "does the whole system still work end-to-end" check and should be updated in the same PR as any public-surface change, not in a follow-up.
- New top-level files in this package root (rare — most growth should happen inside the seven sub-areas) should get a matching test file directly under `tests/integration/` or `tests/unit/`, not nested inside an existing pipeline's test subfolder.
