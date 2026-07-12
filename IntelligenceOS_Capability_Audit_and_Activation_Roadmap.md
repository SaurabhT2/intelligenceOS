# IntelligenceOS — Capability Audit & Activation Roadmap

**Audit basis:** full source tree at `IntelligenceOS_Portable.zip` (monorepo: `packages/intelligence-os`, `packages/shared-intelligence-types`, `packages/cognition-contract`, `apps/api`, `apps/demo`, `apps/playground`, plus `docs/`).
**Method:** every claim below traces to a specific file/line, not to the architecture documents alone. Where documentation and code disagree, the code is treated as ground truth and the disagreement is logged in §10.

---

## 1. Executive Summary

**Overall platform maturity: mid-stage, unusually well self-documented, architecturally disciplined but with one systemic boundary violation.**

IntelligenceOS is a small (~115 source files, ~6,500 lines in the core package), single-tenant-per-call TypeScript SDK, not a deployed "platform" in the infrastructure sense. It has no LLM calls, no vector store, no embeddings, no OCR, and no knowledge graph in the sense those terms are normally used in RAG systems — this is not that kind of system. It is a **deterministic, rule-based intelligence-accumulation engine**: it turns feedback events and uploaded documents into structured "Learnings" via heuristic pattern-matching, and assembles that accumulated state into an "ArtifactBlueprint" that a separate generation system (originally "BrandOS", now abstracted away) uses to steer content generation.

Two things distinguish this codebase from a typical mid-maturity repo:

1. **It is close to fully self-describing.** Nearly every directory carries an `AGENT_CONTEXT.md` stating its responsibilities, its allowed/forbidden dependencies, its real-vs-stub method list, and its own known violations — including a `GAP_ANALYSIS.md` that pre-emptively documents most of what an external audit would otherwise have to discover. This dramatically de-risks activation work: the team already knows where the bodies are buried.
2. **It has one significant, repeated architectural violation that is fully acknowledged in-repo but not yet fixed:** three Learning-Pipeline classes and one Knowledge-Pipeline class hold their own `SupabaseClient` and write directly to tables that a domain class already claims sole ownership of (`GAP_ANALYSIS.md` G-2). This is the single highest-leverage fix in the repository — small, bounded, already-scoped by the team, and blocking nothing structurally except code-review confidence.

**Production readiness:** Two of three pipelines (Blueprint, Learning) are functionally complete and tested against mocked infrastructure only — **391/391 unit tests pass, but zero integration tests have run against a live Supabase instance**, and three schema migrations are written but unapplied. The Knowledge pipeline is complete but deliberately heuristic-only (no LLM/embeddings) by explicit design choice, not oversight. Two full domains (`RelationshipIntelligenceDomain`, most of `WorkspaceIntelligenceDomain`'s governance surface) are structurally wired in but intentionally inert, gated on triggers nothing in the codebase currently checks.

**Biggest strengths:**
- A genuinely enforced one-way dependency graph (domains → pipelines/blueprint/knowledge → api), checked by a real CI-able script (`check-boundaries.mjs`), not just convention.
- A fail-soft design discipline in the Blueprint pipeline: every external fetch degrades to a documented default rather than throwing, verified by 17 dedicated tests.
- A clean, versioned, publishable contract boundary (`@intelligence-os/shared-types`, `@platform/cognition-contract`) that a second consumer application beyond the original one could adopt without touching this repo's internals.

**Biggest missing capabilities (from a RAG/knowledge-platform lens, useful context even though this system isn't trying to be one):**
- No embeddings, no vector store, no semantic search, no RAG retrieval anywhere in the codebase. Knowledge extraction is 100% regex/heuristic pattern matching over raw text — deliberately, not by oversight (see §3, §9).
- No knowledge graph — "Knowledge Graph" appears only as an aspirational label in one target-architecture document (§10) and maps, in reality, to the same flat `knowledge_assets` table `KnowledgeIntelligenceDomain` owns.
- No visual/image understanding beyond text-layer signals (hex codes, font-family declarations) in documents — true pixel/image analysis is explicitly deferred (E1-4 decision record).
- No multi-tenancy/workspace isolation enforcement beyond row-scoping — `WorkspaceIntelligenceDomain.enforceComplianceConstraints()` is a stub.

**Major risks:**
- G-2 (domain-boundary bypass) risks becoming permanent architectural debt the longer it's left, because it's the exact pattern a new contributor is most likely to copy under time pressure — the codebase's own `AGENT_CONTEXT.md` files say this explicitly.
- Zero live-database validation. Every "✅ passing" claim in the repo's own status doc is qualified with "against mocked Supabase" — the actual schema, RLS policies, and three pending migrations have never been exercised end-to-end.
- `RelationshipIntelligenceDomain`'s and `WorkspaceIntelligenceDomain.syncSharedVocabulary()`'s activation triggers are documented but nothing in the code evaluates them (G-6) — these capabilities will silently never activate until someone writes the trigger-check.

**Recommended implementation order** (detail in §11):
1. Fix G-2 (route the four bypassing write-paths through their owning domains) — smallest, highest-integrity-value change available.
2. Apply the three pending schema migrations to a real Supabase project and run the five blocked live-integration tests.
3. Implement the `RelationshipIntelligenceDomain` / workspace-vocabulary activation-trigger checks (G-6), or explicitly re-scope them as "not yet triggered by design" if that's still the intended state.
4. Add the `persistExtracted()` domain method and `getBrandSummary`-equivalent read paths the domain docblocks already anticipate by name.
5. Only then consider net-new capability (embeddings/semantic search) — that is a deliberate architectural upgrade, not an activation, per the codebase's own "Forbidden Dependencies" rules in `knowledge/AGENT_CONTEXT.md`.

---

## 2. Platform Architecture

### 2.1 What this actually is

There is no running "platform" in this repository in the sense of a deployed multi-service system. There is:
- **One SDK package** (`@intelligence-os/core`, at `packages/intelligence-os/`) — a library a host application constructs with a Supabase client and calls methods on.
- **One contract package** (`@intelligence-os/shared-types`) — pure types, no runtime code, defining the request/response shapes for the SDK's four original methods.
- **A second, narrower contract package** (`@platform/cognition-contract`) — the 5-method interface a specific external consumer ("BrandOS") calls, added later (Milestone 2+) as a scoped adapter layer over the same underlying domains.
- **Two thin HTTP hosts** (`apps/api/src/server.ts` for a persistent Node process, `apps/api/api/cognition.ts` for Vercel serverless) that expose the SDK's `CognitionProvider` surface over 5-6 HTTP routes. Neither contains business logic — both are pure transport wiring around `createCognitionHttpServer()`, which itself lives inside the SDK package.
- **Two throwaway apps**: `apps/demo` (a scriptable HTTP client that exercises all 5 routes for smoke-testing a deployment) and `apps/playground` (an unimplemented scaffold that only proves the workspace resolves the core package as a dependency — explicitly documented as not a real app yet).

### 2.2 Runtime flow (the real one, as implemented)

There are two independent entry surfaces into the same underlying state, not one:

**Surface A — the original 6-method `IIntelligenceProvider` contract** (`IntelligenceOS` class, `userId`-scoped):
```
Host app
  → new IntelligenceOS({ supabase, eventBus? })
      constructs 6 domains + 3 pipeline orchestrators, synchronously, in the constructor
  → buildBlueprint(request)         → BlueprintBuilder.build()          [Blueprint Pipeline]
  → recordFeedbackEvent(event)      → persists, then bus.emit()         [triggers Learning Pipeline async]
  → ingestKnowledgeAsset(asset, raw)→ KnowledgeProcessor.process()      [Knowledge Pipeline, runs synchronously today]
  → upsertProject(input)            → ProjectIntelligenceDomain
  → reviewLearning(...)             → UserIntelligenceDomain.reviewLearning()
  → getBrandSummary(...)            → parallel reads across UserIntelligenceDomain
```

**Surface B — the `CognitionProvider` contract** (`workspaceId`-scoped, added Milestone 2, used by the HTTP hosts):
```
HTTP request → createCognitionHttpServer() → CognitionProviderImpl
  → resolveCognitionContext() → ContextBuilder.build() → WorkspaceIntelligenceDomain.getWorkspaceLearnings()
  → observe()                 → deriveWorkspaceLearningFromObservation() → WorkspaceIntelligenceDomain.upsertWorkspaceLearning()
  → review()                  → UserIntelligenceDomain.reviewLearningForWorkspace()
  → summarizeCognition()      → same getWorkspaceLearnings() read, reshaped
  → checkHealth()             → HealthChecker (pings intelligence.learnings via count query)
```

These two surfaces are **not the same code path**. Surface A is `userId`-first with an optional `workspaceId` narrowing; Surface B is `workspaceId`-only with no `userId` at all, and as a direct consequence `resolveCognitionContext()` always returns `identity: null` and `visualIdentity: null` — the real identity/archetype and visual-feature capabilities exist (Surface A can reach them) but Surface B **cannot honestly reach them** without a workspace→user resolution that does not exist yet. This is documented candidly in `ContextBuilder.ts`'s own header, not hidden.

### 2.3 Bootstrap sequence

`IntelligenceOS`'s constructor is the entire bootstrap: it builds all 6 domain instances first (each taking the shared `SupabaseClient`), then wires the 3 pipeline orchestrators from references to those domain instances, then calls `.register()` on `FeedbackProcessor` and `KnowledgeProcessor` to subscribe them to the in-process event bus. `CognitionProviderImpl` (Surface B) is **not** built eagerly — it's constructed lazily on first call to `.asCognitionProvider()`, specifically so that callers who only need Surface A never pay for it. There is no separate "startup script," no health-check-gated readiness probe, and no dependency-injection container — this is plain constructor composition, by design (`AGENT_CONTEXT.md`, "exactly one place that knows how the six domains and three pipelines get assembled").

### 2.4 Dependency graph (enforced, not aspirational)

```
domains/  ──────────────────────────────► (owns intelligence.* tables, no outward deps except @supabase/supabase-js)
   ▲              ▲              ▲
   │              │              │
pipeline/     blueprint/     knowledge/    (each reads domains only, one-way; pipeline/blueprint/knowledge never import each other)
   ▲              ▲              ▲
   └──────────────┴──────────────┘
                  │
                api/, context/, compat/     (the only externally-callable surface; delegates only, no business logic)
```

This is mechanically enforced by `packages/intelligence-os/scripts/check-boundaries.mjs` (RULE-IOS-ISOLATION / RULE-SIT-ISOLATION): any file under `src/` importing anything other than a relative path, `@intelligence-os/shared-types`, `@supabase/supabase-js`, or a Node built-in fails the check. As of the last recorded run (`IMPLEMENTATION_STATUS.md`, Session 5) this passes with 0 violations. It does **not**, however, check the domains/ ownership rule described in §2.5 below — that violation is invisible to this script because it's about which *table* a file touches, not which *package* it imports (see G-2).

### 2.5 The one real architectural crack

Despite the enforced package-level isolation, **domain-level table ownership is violated in four files**: `pipeline/HypothesisEngine.ts`, `pipeline/LearningValidator.ts`, `pipeline/ProfileBuilder.ts` (writing to `intelligence.hypotheses`, `intelligence.learnings`, `intelligence.profiles`), and `knowledge/KnowledgeProcessor.ts` (writing to `intelligence.knowledge_assets`). Each holds its own `SupabaseClient` and issues raw `.schema('intelligence').from(...)` calls, bypassing `UserIntelligenceDomain` and `KnowledgeIntelligenceDomain`, which already define the corresponding write methods (`insertLearning()`, `upsertProfile()`) — currently unused stubs specifically *because* of this bypass. Verified directly in source (§7, §9 have the exact call sites).

---

## 3. Capability Inventory

Legend: ✅ = real/implemented and reachable · 🟡 = partial or reachable only via one path · ⛔ = stub (throws a typed "not implemented" error) · ⚫ = fully inert (structurally present, throws unconditionally) · N/A = does not exist in this codebase.

| Capability | Exists | Prod Ready | Reachable | API | Internal Only | Dormant | Missing | Notes |
|---|---|---|---|---|---|---|---|---|
| Knowledge Ingestion (upload → structured asset) | ✅ | 🟡 | ✅ (`ingestKnowledgeAsset`, `/v1/knowledge/ingest`) | ✅ | — | — | — | Synchronous in Phase 1; event also emitted for future async consumers. |
| Document Parsing | 🟡 | 🟡 | ✅ | — | ✅ | — | Real parsing (PDF/DOCX/etc.) | `KnowledgeAssetExtractor` normalizes **already-decoded raw text** into an `ExtractionJob`; it does not parse binary formats itself — the caller must supply `rawContent` as text. |
| OCR | N/A | — | — | — | — | — | ✅ Missing | No OCR anywhere. `VisualFeatureExtractor` reads *text-layer* signals (hex codes, font names) already present in a document's text, not pixels. |
| Image Understanding | 🟡 | ⛔ | 🟡 | — | ✅ | — | ✅ (pixel analysis) | `VisualFeatureExtractor` extracts color/typography/layout/mood from textual declarations only. True pixel/image analysis explicitly deferred (E1-4 decision record, ADR-001). |
| Chunking | 🟡 | — | — | — | ✅ | — | ✅ (real chunking) | No text-chunking module exists for retrieval purposes. `PatternExtractor` identifies structural sections (headings/sequencing) — a related but distinct concept from RAG-style chunking. |
| Metadata Extraction | ✅ | ✅ | ✅ | — | ✅ | — | — | `KnowledgeAssetExtractor.createJob()`; also asset-level metadata persisted with the asset. |
| Embedding Generation | N/A | — | — | — | — | — | ✅ Missing | No embeddings anywhere; explicitly forbidden by design (`knowledge/AGENT_CONTEXT.md`: "no LLM SDK... every extractor is deterministic, in-process pattern matching by design"). |
| Vector Storage | N/A | — | — | — | — | — | ✅ Missing | No vector column, no pgvector, no external vector DB reference anywhere in `schema.sql` or code. |
| Knowledge Graph | N/A (label only) | — | — | — | — | — | ✅ Missing (as normally understood) | The term appears once, in `INTELLIGENCE_PLATFORM_IMPLEMENTATION.md` §3, mapped onto the existing flat `knowledge/` + `domains/KnowledgeIntelligenceDomain` — no graph structure, edges, or relationship traversal exists in the schema or code. |
| Workspace Knowledge | 🟡 | 🟡 | ✅ | ✅ (`resolveCognitionContext`) | — | — | — | `WorkspaceIntelligenceDomain.getWorkspaceLearnings()`/`getContext()` live; `syncSharedVocabulary()` is a stub. |
| Brand Knowledge (voice/identity) | ✅ (userId path) / 🟡 (workspace path) | ✅ / 🟡 | ✅ | ✅ | — | — | — | Full identity/archetype resolution only reachable via Surface A (`userId`); Surface B (`workspaceId`-only) gets `identity: null` by design — see §2.2. |
| Retrieval (of stored Learnings/patterns/assets) | ✅ | ✅ | ✅ | ✅ | — | — | — | Plain relational queries via each domain — not semantic retrieval. |
| Semantic Search | N/A | — | — | — | — | — | ✅ Missing | No embeddings → no semantic search possible. All lookups are exact/relational (e.g., `artifactType` + `scope`, `is_current = true`). |
| Memory (durable, decaying signal storage) | 🟡 | 🟡 | ✅ | — | ✅ | — | 🟡 (decay) | Realized as the Learning Pipeline's `Signal → Observation → Hypothesis → Learning → Profile` chain, not a dedicated `memory/` module (target architecture doc's `memory/` folder does not exist in code — §10). No explicit decay/expiry job found (`HypothesisEngine.discardExpired()` exists as a method but no scheduler calls it — see §7). |
| Cognition (context assembly for generation) | ✅ | 🟡 | ✅ (`resolveCognitionContext`) | ✅ | — | — | — | `ContextBuilder` — real, but workspace-scoped-only limitation above applies. |
| Brand Identity | ✅ | ✅ | ✅ (Surface A only) | ✅ | — | 🟡 (Surface B) | — | `getCurrentArchetype()` real; not reachable from `CognitionProvider` surface. |
| Learning (turning feedback into durable knowledge) | ✅ | 🟡 | ✅ | — | ✅ (triggered via event) | — | — | Full 5-stage pipeline implemented; violates domain-ownership boundary (G-2) in 3 of its 5 classes. |
| Feedback Loop | ✅ | 🟡 | ✅ (`recordFeedbackEvent`, `/v1/cognition/observe`) | ✅ | — | — | — | Two independent feedback paths (Surface A's `FeedbackEvent`→pipeline; Surface B's `ObservationInput`→direct `WorkspaceIntelligenceDomain.upsertWorkspaceLearning`, bypassing the Learning Pipeline entirely — deliberate, see `CognitionProviderImpl.observe()` docblock). |
| Ranking / Relevance | 🟡 | 🟡 | ✅ | — | ✅ | — | — | Confined to `StructurePlanner`'s priority-ordered fallback (`user_calibrated` → `archetype` → `universal` → hardcoded) and `HypothesisEngine`'s corroboration thresholds — not a general ranking capability. |
| Search APIs | N/A | — | — | — | — | — | ✅ Missing | No `/search` endpoint or equivalent exists; all 6 HTTP routes are fixed-shape resolve/observe/review/summarize/health/ingest, not query endpoints. |
| Context Assembly | ✅ | 🟡 | ✅ | ✅ | — | — | — | `ContextBuilder` (Surface B), `BlueprintBuilder` (Surface A) — two separate assemblers over the same domains. |
| Prompt Enrichment | 🟡 | 🟡 | ✅ | ✅ | — | — | — | Output is structured directive data (`VoiceProfile`, `VocabularyDirectives`, `NarrativeFrame`) for a *calling* prompt compiler to consume — this system does not itself construct or send a prompt. |
| Workspace Isolation | 🟡 | ⛔ | 🟡 | — | ✅ | — | ✅ (compliance enforcement) | Row-level `workspace_id` scoping is real; `enforceComplianceConstraints()` (the actual governance logic) is a stub. |
| Multi-tenancy | ✅ (schema-level) | 🟡 | ✅ | — | ✅ | — | — | RLS + schema isolation (`intelligence` schema, never `public`) confirmed in `schema.sql`; no live-DB test has verified RLS policies actually behave correctly (never run against real Postgres). |
| Relationship Intelligence (named-recipient audience modeling) | ⚫ | ⚫ | ⚫ | — | — | ✅ | — | Every method throws `DomainNotActivatedError` unconditionally. Structurally wired (class exists, is constructed in `IntelligenceOS`'s constructor) but never callable. |
| Visual → Learning Promotion | ⛔ | ⛔ | ⛔ | — | — | ✅ | ✅ | Extraction (`VisualFeatureExtractor`) is real; the step that would turn an extracted visual feature into a durable `Learning` row does not exist anywhere (ADR-001 §5, tracked, not implemented). |
| Health Check | ✅ | ✅ | ✅ (`/v1/cognition/health`) | ✅ | — | — | — | Minimal — one `count` query against `intelligence.learnings`. |
| Event Bus / Observability | ✅ | ✅ | ✅ (`IntelligenceOS.eventBus`) | — | ✅ | — | — | In-process only; `BullMQEventBus`/`InngestEventBus` exist only as commented-out sketches — no distributed bus implemented. |

---

## 4. Pipeline Discovery

### 4.1 Blueprint Pipeline (Surface A read path — "before generation")

```
ArtifactRequest
   ↓
Step 1 (parallel, each independently fail-soft):
   Profile fetch ─┐
   Project context ─┤ (ProjectContextBuilder: project + workspace + scoped learnings + scoped assets)
   Audience calibration ─┤ (AudienceCalibrator)
   Archetype fetch ─┘
   ↓
Step 2: StructurePlanner  → section structure & depth (fallback chain: user_calibrated → archetype → universal → hardcoded FALLBACK_SECTIONS)
   ↓
Step 3: NarrativePlanner  → voice + vocabulary directives, synchronous, no I/O (also the ADR-001 integration point for a future VisualDirectives, not yet added)
   ↓
Step 4: detectConflictions() (internal/conflictDetection.ts)
   ↓
Step 5: ConflictResolutionModel → resolves via fixed authority order (COMPLIANCE > WORKSPACE > RECIPIENT > PROJECT)
   ↓
Step 6: BlueprintBuilder assembles ArtifactBlueprint, persists (ArtifactIntelligenceDomain.persistBlueprint — currently a stub, see §7), emits `intelligence.blueprint.built`
   ↓
ArtifactBlueprint (returned to caller)
```
**Status per stage:** all 6 stages implemented and reachable, production-grade fail-soft behavior (tested), **except** persistence at the end of Step 6, which is a documented stub — the blueprint is computed and returned correctly but never durably saved to `artifact_blueprints` today (see §7 for exact evidence).

### 4.2 Learning Pipeline (Surface A write path — "after feedback")

```
FeedbackEvent → IntelligenceOS.recordFeedbackEvent()
   ↓ (persist to feedback_events — real, via ArtifactIntelligenceDomain)
   ↓ (bus.emit 'intelligence.artifact.feedback' — async, fire-and-forget)
SignalExtractor.extractFromFeedback()      → Signal[] (quarantine gate applied: role_play/hypothetical/emotional_state discarded)
   ↓
ObservationBuilder.build()                 → Observation (confidence-ceiling applied by source quality)
   ↓
HypothesisEngine.process()                 → Hypothesis (PROVISIONAL → ACCUMULATING → VALIDATED/DISCARDED/REJECTED)
   ↓                                          ⚠ writes directly to intelligence.hypotheses — bypasses UserIntelligenceDomain (G-2)
LearningValidator.evaluate()               → promotes Hypothesis → persisted Learning once corroboration threshold crossed
   ↓                                          ⚠ writes directly to intelligence.learnings — bypasses UserIntelligenceDomain (G-2)
ProfileBuilder.shouldRebuild()/.rebuild()   → versions + persists IntelligenceProfile
   ↓                                          ⚠ writes directly to intelligence.profiles — bypasses UserIntelligenceDomain (G-2)
PipelineRunResult (per-signal errors collected, one failure doesn't abort the run — tested behavior)
```
**Status per stage:** fully implemented, fully reachable (triggered automatically on every `recordFeedbackEvent()` call), well-tested for the happy path and the quarantine gate — but 3 of 5 stages violate the domain-ownership rule (G-2), and `HypothesisEngine`, `LearningValidator`, `ProfileBuilder` have **no dedicated unit test file**, exercised only indirectly via one integration test (confirmed: `AGENT_CONTEXT.md` for `pipeline/` states this explicitly, and the test directory listing confirms no `HypothesisEngine.test.ts`/`LearningValidator.test.ts`/`ProfileBuilder.test.ts` exist).

### 4.3 Knowledge Pipeline ("Onboarding Intelligence" — asset upload)

```
KnowledgeAssetInput + rawContent → IntelligenceOS.ingestKnowledgeAsset()
   ↓ (synchronous in Phase 1 — Sprint 4 intended to move this behind the event bus, not yet done)
KnowledgeAssetExtractor.createJob()        → ExtractionJob
   ↓
Stage 1–4 (parallel): VocabularyExtractor · FrameworkExtractor · PatternExtractor · VisualFeatureExtractor
   ↓ (all heuristic/deterministic — no LLM call anywhere, by design)
Stage 5: KnowledgeValidator.validate()      → corroboration/duplicate check against existing assets
   ↓
Stage 6: KnowledgeProcessor.persistAsset()  → writes to intelligence.knowledge_assets
   ↓                                          ⚠ direct SupabaseClient write — bypasses KnowledgeIntelligenceDomain (G-2)
KnowledgeProcessorResult (assetId + per-stage errors)
   ↓
bus.emit('intelligence.knowledge_asset.uploaded')
```
**Status per stage:** fully implemented and reachable via two paths (`IntelligenceOS.ingestKnowledgeAsset()` and the optional `/v1/knowledge/ingest` HTTP route, only active when a `KnowledgeIngestPort` is supplied to `createCognitionHttpServer` — confirmed not wired in `apps/api/src/server.ts`/`apps/api/api/cognition.ts`, so **this HTTP route currently returns 501 in both real deployments**, even though the underlying capability is fully implemented — a textbook example of exactly the "trace beyond the 501" instruction this audit was given). Visual extraction is Stage 4 but its output is never promoted into a `Learning` (§3, §7).

---

## 5. API Surface Audit

| Endpoint | Handler | Service | Status | Notes |
|---|---|---|---|---|
| `POST /v1/cognition/resolve` | `createCognitionHttpServer` | `CognitionProviderImpl.resolveCognitionContext` → `ContextBuilder` | **Production** | Degrades to `createDegradedCognitionContext()` on any fetch failure — never 5xxs for missing data. |
| `POST /v1/cognition/observe` | same | `CognitionProviderImpl.observe` → `WorkspaceIntelligenceDomain.upsertWorkspaceLearning` | **Production** | Fire-and-forget; persistence failures logged, swallowed, never returned to caller. |
| `POST /v1/cognition/review` | same | `CognitionProviderImpl.review` → `UserIntelligenceDomain.reviewLearningForWorkspace` | **Production** | Errors propagate (by design — human-triggered action, not fire-and-forget). |
| `GET /v1/cognition/summary` | same | `CognitionProviderImpl.summarizeCognition` | **Production** | Reuses the same workspace-learnings read as `/resolve`; several `CognitionSummary` fields (`keywords`) are always `null` — no honest workspace-scoped source exists yet. |
| `GET /v1/cognition/health` | same | `HealthChecker.check` | **Production** | Minimal (one `count` query); returns 503 on failure, never throws. |
| `POST /v1/knowledge/ingest` | same | `IntelligenceOS.ingestKnowledgeAsset` (via optional `KnowledgeIngestPort`) | **Returns 501 in both current deployments** (`apps/api/src/server.ts` and `apps/api/api/cognition.ts` never pass a `KnowledgeIngestPort` to `createCognitionHttpServer()`) | **Real capability exists and is fully implemented** (§4.3) — this is purely a missing 2-line wiring gap in the two host files, not a missing capability. Activation: pass `intelligenceOS` (which already satisfies `KnowledgeIngestPort`'s shape) as the third argument to `createCognitionHttpServer()` in both host files. |
| `IntelligenceOS.buildBlueprint()` | n/a (in-process SDK call, not HTTP) | `BlueprintBuilder` | **Production** | Not exposed over HTTP by either host app — only reachable by a consumer that imports `@intelligence-os/core` directly, not by a `CognitionProvider`-only consumer. |
| `IntelligenceOS.reviewLearning()` / `.getBrandSummary()` / `.upsertProject()` | n/a | respective domains | **Production, SDK-only** | Same as above — not exposed over either HTTP host; only reachable in-process. |

**Not registered anywhere (no route, no SDK export path beyond internal use):** none found — every implemented capability is reachable from at least one of the two surfaces once the one wiring gap above is closed.

---

## 6. Service Inventory

| Service/Class | Purpose | Implementation Completeness | Callers | Runtime Registration | Production Readiness |
|---|---|---|---|---|---|
| `UserIntelligenceDomain` | Owns `profiles`, `learnings`, `archetypes`, generic `audience_profiles` | Reads: complete. Writes (`upsertProfile`, `insertLearning`): **defined but unused** — the intended callers (pipeline classes) bypass them (G-2). | `BlueprintBuilder`, `CognitionProviderImpl`, `IntelligenceOS.reviewLearning/getBrandSummary` | Constructed in `IntelligenceOS` constructor | Reads: ✅. Writes: 🟡 dead code today. |
| `ProjectIntelligenceDomain` | Owns `projects` | Fully live, reads+writes | `IntelligenceOS.upsertProject`, `ProjectContextBuilder` | Constructor | ✅ |
| `ArtifactIntelligenceDomain` | Owns `artifact_patterns`, `artifact_exemplars`, `feedback_events`, `artifact_blueprints` | Pattern reads + feedback writes complete; `promoteExemplar()` and blueprint-persistence call site both stub/unused | `StructurePlanner`, `IntelligenceOS.recordFeedbackEvent`, `BlueprintBuilder` | Constructor | 🟡 |
| `KnowledgeIntelligenceDomain` | Owns `knowledge_assets` | Reads complete; `ingestAsset()` a deliberate stub (real path is `KnowledgeProcessor`, which itself bypasses this domain on write — G-2) | `ProjectContextBuilder`, `NarrativePlanner` (reads) | Constructor | 🟡 |
| `WorkspaceIntelligenceDomain` | Workspace-scoped learnings + compliance | `getContext()`/`getWorkspaceLearnings()`/`upsertWorkspaceLearning()` live; `enforceComplianceConstraints()` and `syncSharedVocabulary()` stubs | `ContextBuilder`, `CognitionProviderImpl`, `BlueprintBuilder` | Constructor | 🟡 |
| `RelationshipIntelligenceDomain` | Named-recipient relationship modeling | 100% inert — every method throws `DomainNotActivatedError` | none (not yet wired into `BlueprintBuilder`) | Constructed but unused | ⚫ Not activated; trigger condition never checked anywhere (G-6) |
| `SignalExtractor` / `ObservationBuilder` / `HypothesisEngine` / `LearningValidator` / `ProfileBuilder` | Learning Pipeline stages | All complete and reachable | `FeedbackProcessor` | `FeedbackProcessor.register()` in constructor | 🟡 — functionally live, G-2 violation in 3 of 5 |
| `KnowledgeAssetExtractor` / `VocabularyExtractor` / `FrameworkExtractor` / `PatternExtractor` / `VisualFeatureExtractor` / `KnowledgeValidator` | Knowledge Pipeline stages | All complete | `KnowledgeProcessor` | `KnowledgeProcessor.register()` in constructor | 🟡 — functionally live, G-2 violation in the orchestrator's persistence step |
| `BlueprintBuilder` + 5 planner classes | Blueprint assembly | Complete, zero known Supabase-boundary violations (only pipeline/knowledge violate) | `IntelligenceOS.buildBlueprint` | Constructor | ✅ — the cleanest pipeline in the repo |
| `ContextBuilder` | Assembles `CognitionContext` for Surface B | Complete for what it can honestly reach (workspace-only scope) | `CognitionProviderImpl` | Constructed in `CognitionProviderImpl` | ✅ within its documented scope limitation |
| `CognitionProviderImpl` | Implements `CognitionProvider` | Complete, thin-adapter as designed | `createCognitionHttpServer`, both HTTP hosts | `IntelligenceOS.asCognitionProvider()`, lazy | ✅ |
| `HealthChecker` | DB reachability check | Minimal but complete | `CognitionProviderImpl.checkHealth` | Constructed alongside `CognitionProviderImpl` | ✅ |
| `InProcessEventBus` | Pub/sub for pipeline triggers | Complete; distributed alternatives (`BullMQEventBus`/`InngestEventBus`) are commented-out sketches only | `IntelligenceOS`, `FeedbackProcessor`, `KnowledgeProcessor`, `BlueprintBuilder` | Default in `IntelligenceOSConfig` | ✅ for single-process use; ⚫ no distributed implementation exists |

---

## 7. Dormant Capability Analysis

This is the section the brief marks as most important. Every entry below is a specific, cited finding, not a general impression.

1. **`ArtifactIntelligenceDomain.persistBlueprint()` is a stub — `BlueprintBuilder` computes a complete blueprint every time but the persistence step at the end of Step 6 throws `PhaseNotImplementedError`.** Confirmed at `domains/ArtifactIntelligenceDomain.ts:190`. The blueprint is still correctly returned to the caller (persistence isn't on the critical path for the return value), but nothing durable is saved — every generated blueprint is currently ephemeral. **Activation:** implement the `upsert` against `artifact_blueprints` using the same row-mapping pattern every other domain method already uses; the table and columns already exist in `schema.sql`.

2. **`UserIntelligenceDomain.upsertProfile()` and `.insertLearning()` are stubs, but the capabilities they'd back are fully live anyway** — via the G-2 bypass. This is the mirror image of a normal "dormant capability": the domain's *public, documented* write path is dead code, while the *same* capability is reachable through an undocumented back door in `pipeline/`. A new engineer calling `UserIntelligenceDomain.insertLearning()` directly (the officially sanctioned way) would get an exception; the pipeline gets the real behavior by going around it.

3. **`KnowledgeIntelligenceDomain.ingestAsset()` is a stub for the same reason** — the real path is `KnowledgeProcessor.process()`, called directly from `IntelligenceOS.ingestKnowledgeAsset()`, which bypasses this domain method entirely and writes with its own `SupabaseClient` (§9 has the exact line).

4. **The Knowledge HTTP route (`/v1/knowledge/ingest`) returns 501 in both live deployments, but the capability behind it is 100% implemented and already used successfully via the SDK path.** Confirmed: neither `apps/api/src/server.ts` nor `apps/api/api/cognition.ts` passes a third (`KnowledgeIngestPort`) argument to `createCognitionHttpServer()`. This is the exact "parser exists but endpoint missing" pattern called out in the brief's own examples. **Activation: pass `intelligenceOS` as the third argument in both files — `IntelligenceOS` already structurally satisfies `KnowledgeIngestPort` (`ingestKnowledgeAsset(asset, rawContent?): Promise<string>`), no new code required beyond the two call sites.**

5. **`HypothesisEngine.discardExpired(userId)` exists as a real method but nothing calls it.** Grep across the entire repository turns up its definition and its `AGENT_CONTEXT.md`-documented interface, but no scheduler, cron entry, or event handler invokes it. This is the closest thing in the codebase to a genuine "expiry/decay" job for stale hypotheses, and it is currently 100% dormant — not stubbed, just never triggered.

6. **`RelationshipIntelligenceDomain` is wired into `IntelligenceOS`'s constructor (a live object exists) but is 100% behaviorally inert** — every method throws `DomainNotActivatedError` unconditionally, and (per G-6) nothing anywhere counts "≥3 external artifacts with named recipients" or checks the onboarding-signal trigger that's supposed to flip it on. This capability cannot ever activate on its own; someone has to write the trigger-check first.

7. **`WorkspaceIntelligenceDomain.syncSharedVocabulary()` and `.enforceComplianceConstraints()` are both stubs** gating an entire governance/compliance layer that `ConflictResolutionModel`'s COMPLIANCE-first authority ordering assumes exists upstream. The conflict-resolution *logic* is fully built and tested; the thing that's supposed to feed it real compliance requirements from workspace policy is not.

8. **Visual feature extraction is complete (Stage 4, `VisualFeatureExtractor`) but visual→Learning promotion does not exist anywhere.** Extracted colors/typography/layout/mood are computed on every knowledge-asset ingest and then... go nowhere. Per ADR-001 §5 this is tracked as intentional remaining work, not a bug, but it means an entire class of extracted signal is currently discarded after computation.

9. **Distributed event bus classes (`BullMQEventBus`, `InngestEventBus`) exist only as commented-out code sketches inside `events/IntelligenceEventBus.ts`.** Not a partial implementation — literally comments describing what the class would look like. If IntelligenceOS is ever run across more than one process, this is 0% built today despite reading, at a glance, like an interface with multiple implementations.

10. **`db/queries/` — six files, all empty.** Nothing imports from this directory. The team's own Gap Analysis (G-5) already flags this as an open decision (delete vs. populate) rather than a bug — included here for completeness, not as new information.

---

## 8. Capability Dependency Graph

```
Knowledge Ingestion (real, sync)
   ↓
Document/Text Normalization (KnowledgeAssetExtractor — real)
   ↓
┌─ Vocabulary Extraction (real, heuristic)
├─ Framework Extraction (real, heuristic)
├─ Pattern Extraction (real, heuristic)
└─ Visual Feature Extraction (real, text-signals only) ── dead end: no promotion path to Learning (Gap #8)
   ↓ (all four converge)
Knowledge Validation (real)
   ↓
Persisted Knowledge Asset ⚠ (via bypass write, Gap #3/#4-of-G-2, not through KnowledgeIntelligenceDomain)
   ↓
Read by: ProjectContextBuilder, NarrativePlanner  →  feeds Blueprint Pipeline

Feedback Event (real)
   ↓
Signal Extraction → Observation Building → Hypothesis Engine → Learning Validation → Profile Rebuild
   ↓ (three of these stages write via bypass, Gap #2/#3, not through UserIntelligenceDomain)
Persisted Learning / Profile
   ↓
Read by: BlueprintBuilder (Surface A) and ContextBuilder (Surface B, workspace-scoped subset only)

Learning + Knowledge Assets + Project Context + Audience Calibration
   ↓
Blueprint Assembly (real, fail-soft, well-tested)
   ↓
ArtifactBlueprint ⚠ (never persisted — Gap #1, ArtifactIntelligenceDomain.persistBlueprint stub)
   ↓
[consumed by external generation system — out of scope for this repo]

Relationship Intelligence — prerequisite (activation trigger check) does not exist → fully blocked, not just dormant
Workspace Compliance Enforcement — prerequisite (enforceComplianceConstraints implementation) does not exist → ConflictResolutionModel's COMPLIANCE rule has no real upstream data source yet
```

**Key prerequisite relationships:**
- Blueprint Assembly is fully independent of the Learning/Knowledge pipelines being "complete" — it consumes whatever exists (including nothing, for a new user) via documented fallbacks. This is a genuine strength: the highest-value capability doesn't block on the others.
- The Learning Pipeline's domain-boundary fix (G-2) is a prerequisite for trusting `UserIntelligenceDomain` as the actual source of truth — right now it is not, the pipeline's direct writes are.
- Relationship Intelligence and full Workspace Compliance are both blocked one level higher than "implementation" — they're blocked on a *trigger/decision* that hasn't been made, not on missing code inside the classes themselves.

---

## 9. Maturity Assessment

| Capability | Maturity | Rationale |
|---|---|---|
| Blueprint Assembly | 85% | All 6 stages implemented, fail-soft-tested, zero boundary violations. Missing: persistence of the result (−10%), Relationship/audience calibration still generic-only (−5%). |
| Learning Pipeline (Signal→Profile) | 60% | Fully implemented and triggers automatically, but 3/5 stages violate the domain-ownership boundary (a real architectural debt, not cosmetic) and 3/5 classes have zero dedicated unit tests. |
| Knowledge Ingestion/Extraction | 70% | Complete, deterministic, well-tested extractors; capped below 80% because it's heuristic-only by design (no semantic understanding) and its orchestrator also violates the domain boundary. |
| Knowledge Ingestion HTTP exposure | 40% | The capability is 70%-mature (above) but the HTTP route serving it is unwired in both real deployments — 501 today. |
| Visual Feature Extraction | 55% | Real extraction of text-layer visual signals; capped because true pixel analysis is deferred and the promotion-to-Learning step (the part that would make it *matter* downstream) doesn't exist. |
| Cognition Context Assembly (Surface B) | 65% | Real, tested, degrades safely — but structurally cannot surface identity/visualIdentity from a workspace-only scope, which is close to half of `CognitionContext`'s documented fields. |
| Workspace Knowledge / Compliance | 35% | Read path (`getContext`) is real; the two capabilities workspace intelligence is supposed to be *for* (compliance enforcement, vocabulary sync) are both stubs. |
| Relationship Intelligence | 5% | Structurally present (class exists, constructed), 0% behaviorally reachable, and its activation trigger is unimplemented — this is lower than a typical "10% stub" because there's no code path that could ever flip it on today. |
| Memory / Learning Durability | 45% | The accumulation half (Signal→Learning) works; the decay half (`discardExpired`) is written but never called — a memory system that only grows and never forgets is a materially different (and riskier) system than the one documented. |
| Multi-tenancy / Workspace Isolation | 55% | Schema-level RLS and scoping is real and reviewed (the team's own note about catching and fixing an RLS bug in the original spec is a good sign); never verified against a live database. |
| Event Bus / Observability | 50% (in-process) / 0% (distributed) | Solid single-process implementation; the distributed variants referenced in code comments are pure sketches. |
| Search / Retrieval | 30% | Real relational lookups exist for every domain; there is no semantic search, no ranking beyond fixed fallback priority, and no query-style API at all — this repository doesn't attempt retrieval in the sense the audit brief's example capability list implies. |
| Embeddings / RAG | 0% | Genuinely absent, and forbidden by the codebase's own stated rules without a deliberate design review first. |

---

## 10. Documentation vs Reality

The repository's own `docs/architecture/platform/INTELLIGENCE_PLATFORM_IMPLEMENTATION.md` and `INTELLIGENCE_PLATFORM_ARCHITECTURE.md` describe a **target** package layout that includes dedicated `cognition/` and `memory/` modules ("identity resolution, style projection, confidence calculation" and "consolidated signal storage, decay, repository interface," respectively). **Neither directory exists in the actual `src/` tree.** The responsibilities those documents assign to `cognition/` and `memory/` were, in practice, absorbed into `context/` (thin, real) and split across `UserIntelligenceDomain`/`pipeline/` (real, but boundary-violating per G-2) instead. This is not a regression — the actual implementation route (documented candidly in `ContextBuilder.ts`'s own header and the Milestone reports) was a deliberate, reasoned simplification — but a reader who takes the target-architecture document as current fact will go looking for two directories that were never built as described.

Similarly, that same document's `CognitionProvider` interface sketch (`resolveCognitionContext(workspaceId, taskType?)`, `review(workspaceId, entryId, approved, reviewedBy)`, `summarizeCognition(workspaceId, personaId?)`, `healthCheck()`) **differs from the real, implemented contract** in `packages/cognition-contract/src/CognitionProvider.ts` (`resolveCognitionContext(request: CognitionRequest)`, `review(decision: CognitionReviewDecision)`, `summarizeCognition(workspaceId: string)` with no `personaId`, `checkHealth()` not `healthCheck()`). The real, shipped contract is the one actually implemented by `CognitionProviderImpl` and consumed by the HTTP server — treat the architecture document's interface sketch as superseded, not current.

| Documented capability | Reality |
|---|---|
| Dedicated `cognition/` module (identity resolution, style projection) | **Different than designed.** Absorbed into `context/ContextBuilder` + existing `UserIntelligenceDomain`/`WorkspaceIntelligenceDomain` reads. No `cognition/` directory exists. |
| Dedicated `memory/` module (storage, retrieval, decay) | **Different than designed.** Split across `pipeline/` (accumulation, with the G-2 boundary violation) and domain tables. Decay (`discardExpired`) exists as an orphaned method, never wired to anything — so even the *implemented substitute* for `memory/`'s decay responsibility is itself dormant (§7, item 5). |
| `CognitionProvider.review(workspaceId, entryId, approved, reviewedBy)` (4 positional args) | **Obsolete/superseded documentation.** Real interface takes one `CognitionReviewDecision` object. |
| `CognitionProvider.summarizeCognition(workspaceId, personaId?)` | **Obsolete/superseded documentation.** Real interface has no `personaId` parameter — `CognitionProviderImpl.summarizeCognition()` confirms single-argument usage. |
| `CognitionProvider.healthCheck()` | **Obsolete/superseded documentation.** Real method name is `checkHealth()` throughout the contract package and every caller. |
| "`brandos.*` event namespace" (GAP_ANALYSIS.md's original G-1 finding) | **Implemented as documented — resolved.** Verified: `package.json` scopes are `@intelligence-os/*`, all 14 event-type strings use the `intelligence.*` prefix; remaining `brandos`-adjacent identifiers (`brandosProjectId` field, `brandos_project_id` column) are legitimate external-ID references, not namespace leakage, and are separately, correctly flagged by the team itself as a low-priority follow-up rename (not yet done, correctly still open). |
| G-2 (domain boundary bypass) | **Confirmed still open.** Directly verified in source: all four cited files still hold their own `SupabaseClient` and write past their owning domain. |
| G-3 (no README anywhere) | **Resolved, verified.** Root and per-package READMEs exist. |
| G-4 (stale test coverage thresholds / missing pipeline unit tests) | **Confirmed still open.** `HypothesisEngine`/`LearningValidator`/`ProfileBuilder` still have no dedicated test file; `ProjectContextBuilder` likewise. |
| G-5 (empty `db/queries/`) | **Confirmed still open**, unchanged, still an explicitly deferred team decision rather than an oversight. |
| G-6 (Relationship activation trigger unverifiable) | **Confirmed still open.** No scheduled job or method anywhere evaluates the stated trigger condition. |
| "Five universal artifact patterns" documented only in raw SQL comments (G-10) | **Confirmed still open** — no summarized table exists in any `AGENT_CONTEXT.md` as the team's own gap analysis recommended. |

---

## 11. Activation Roadmap

Ordered smallest-safe-change-first, per the brief's instruction to prioritize activation over rewriting.

### 11.1 Wire the Knowledge HTTP route (highest ratio of value to effort)
- **Current state:** `POST /v1/knowledge/ingest` returns 501 in both live deployments.
- **Why dormant:** `createCognitionHttpServer()` accepts an optional third `KnowledgeIngestPort` argument; neither host file passes it.
- **Files involved:** `apps/api/src/server.ts`, `apps/api/api/cognition.ts`.
- **Dependencies:** none new — `IntelligenceOS` already structurally satisfies `KnowledgeIngestPort`.
- **Activation steps:** change `createCognitionHttpServer(provider, { apiKey })` to `createCognitionHttpServer(provider, { apiKey }, intelligenceOS)` in both files.
- **Estimated complexity:** trivial (2 one-line changes).
- **Risk:** near-zero — the underlying capability is already tested via the SDK path.
- **Validation:** re-run `apps/demo`'s scriptable client, or a manual `curl` against `/v1/knowledge/ingest`, and confirm 201 instead of 501.

### 11.2 Fix G-2 — route pipeline writes through their owning domains
- **Current state:** `HypothesisEngine`, `LearningValidator`, `ProfileBuilder`, `KnowledgeProcessor` each hold a private `SupabaseClient` and write past `UserIntelligenceDomain`/`KnowledgeIntelligenceDomain`.
- **Why dormant (in the sense that the *correct* path is dormant):** `UserIntelligenceDomain.upsertProfile()`/`.insertLearning()` and the not-yet-existing `KnowledgeIntelligenceDomain.persistExtracted()` are the intended call sites but are unused/nonexistent respectively.
- **Files involved:** `pipeline/HypothesisEngine.ts`, `pipeline/LearningValidator.ts`, `pipeline/ProfileBuilder.ts`, `knowledge/KnowledgeProcessor.ts`, `domains/UserIntelligenceDomain.ts`, `domains/KnowledgeIntelligenceDomain.ts`.
- **Dependencies:** none blocking — the team's own gap analysis already scoped this exact fix.
- **Activation steps:** (1) make `UserIntelligenceDomain.upsertProfile()`/`.insertLearning()` real (they currently throw `PhaseNotImplementedError` — that has to be removed as part of this fix, not just re-pointed); (2) change the three pipeline classes to accept a `UserIntelligenceDomain` instance instead of a raw `SupabaseClient` and call those methods; (3) add `KnowledgeIntelligenceDomain.persistExtracted()` (the name the code's own docblocks already anticipate) and route `KnowledgeProcessor.persistAsset()` through it; (4) decide whether `intelligence.hypotheses`' read-only corroboration queries need their own domain-level read methods too, per the gap analysis's own open question.
- **Estimated complexity:** medium — touches 6 files, but each change is mechanical (swap a raw query for an existing/near-existing domain method call), and the row-mapping logic already exists in the domain classes.
- **Risk:** medium — this is exactly the kind of change that needs the currently-missing unit tests (§11.3) written *first or alongside*, since `HypothesisEngine`/`LearningValidator`/`ProfileBuilder` have no dedicated tests to catch a regression today.
- **Validation:** re-run `pipeline-integration.test.ts` (must still pass unchanged); add the new dedicated unit tests called for below; confirm `check-boundaries.mjs`-style manual grep for `new.*SupabaseClient` inside `pipeline/`/`knowledge/` finds nothing left.

### 11.3 Add the missing pipeline/blueprint unit tests (G-4)
- **Current state:** `HypothesisEngine`, `LearningValidator`, `ProfileBuilder`, `ProjectContextBuilder` have no dedicated test files.
- **Why dormant:** never written; flagged by the team's own `AGENT_CONTEXT.md` files as the recommended first contribution to each directory.
- **Files involved:** new files under `tests/unit/pipeline/` and `tests/unit/blueprint/`.
- **Dependencies:** should land before or alongside 11.2, not after — otherwise the domain-boundary fix has no safety net.
- **Activation steps:** follow the existing `SignalExtractor.test.ts`/`ObservationBuilder.test.ts` pattern and the `createMockSupabase` factory already established in `tests/integration/intelligence-os.test.ts`.
- **Estimated complexity:** medium (four new test files, each following an established local pattern).
- **Risk:** low.
- **Validation:** `pnpm test` coverage numbers move meaningfully above the current 40/30 thresholds; raise the threshold in `vitest.config.ts` once they do (G-4's second half).

### 11.4 Persist `ArtifactBlueprint` (close the Blueprint pipeline's one gap)
- **Current state:** `ArtifactIntelligenceDomain.persistBlueprint()` throws `PhaseNotImplementedError`; every generated blueprint is ephemeral.
- **Files involved:** `domains/ArtifactIntelligenceDomain.ts`.
- **Dependencies:** the `artifact_blueprints` table already exists in `schema.sql` — including a commented-out migration for the three Epic-2 fields (`degraded`, `confidence_score`, `build_duration_ms`) that the team explicitly deferred pending a design decision on whether `buildDurationMs` belongs in a row-level audit column at all.
- **Activation steps:** implement the upsert following the existing row-mapping pattern; decide and apply (or explicitly continue deferring) the pending migration #4 for the three new fields.
- **Estimated complexity:** small.
- **Risk:** low — purely additive, no existing behavior changes (the blueprint is already correctly returned to the caller regardless).
- **Validation:** new test asserting a call to `buildBlueprint()` results in a persisted row; existing `blueprint.test.ts` should be unaffected.

### 11.5 Implement (or explicitly formalize as un-triggered) the Relationship/Compliance activation checks
- **Current state:** both `RelationshipIntelligenceDomain`'s activation trigger and `WorkspaceIntelligenceDomain.enforceComplianceConstraints()` are undocumented-as-checked, unimplemented conditions (G-6).
- **Files involved:** likely `domains/ArtifactIntelligenceDomain.ts` (owns `feedback_events`, the natural place to count named-recipient artifacts) and `domains/WorkspaceIntelligenceDomain.ts`.
- **Dependencies:** none technical — this is a product/design decision as much as an engineering one, per the team's own gap analysis wording.
- **Activation steps:** either (a) implement a method answering "has user X crossed the named-recipient threshold" and call it somewhere real (periodic check, or inline during blueprint assembly when a named audience reference is present), or (b) update the domain's docblock to say "documented future activation criterion, not yet automatically checked" so intent and behavior stop silently disagreeing.
- **Estimated complexity:** medium if implementing; trivial if only correcting the documentation.
- **Risk:** low either way.
- **Validation:** a test asserting the trigger fires at the documented threshold (if implemented), or a docs-only diff (if deferred).

### 11.6 Apply pending schema migrations and run the 5 live-infrastructure tests
- **Current state:** 3 Epic-1 migrations written, none applied to a live database; 391/391 tests pass only against a mocked Supabase client.
- **Files involved:** the SQL blocks already written out in `docs/implementation/IMPLEMENTATION_STATUS.md`.
- **Dependencies:** requires actual Supabase project access and credentials — this is the one item in this roadmap that is genuinely environmental, not a code change.
- **Activation steps:** apply migrations 1–3 (visual-features column, workspace index, nullable `learnings.user_id`); run the 5 tests listed in that document under "Remaining Work."
- **Estimated complexity:** small (the SQL is already written) but requires infrastructure access this audit's sandbox does not have.
- **Risk:** medium — this is the first time the actual RLS policies and schema will be exercised against real Postgres; treat any surprise here as expected and budget time for it.
- **Validation:** the 5 named integration tests passing against live infrastructure; `RULE-IOS-ISOLATION`/`RULE-SIT-ISOLATION` boundary check re-run for good measure.

---

## 12. Critical Findings

**Top missing implementations**
1. `ArtifactIntelligenceDomain.persistBlueprint()` — every blueprint is ephemeral today.
2. `UserIntelligenceDomain.upsertProfile()` / `.insertLearning()` real implementations (currently stubs, superseded by G-2 bypass).
3. `KnowledgeIntelligenceDomain.ingestAsset()` / `.persistExtracted()` (latter doesn't exist yet at all).
4. `WorkspaceIntelligenceDomain.enforceComplianceConstraints()`.
5. `WorkspaceIntelligenceDomain.syncSharedVocabulary()`.
6. `RelationshipIntelligenceDomain` — every method (5 total), all unconditionally throwing.
7. `ArtifactIntelligenceDomain.promoteExemplar()`.
8. `ArtifactIntelligenceDomain.updatePatternFromExemplar()`.
9. `ProjectIntelligenceDomain.updateLifecycle()`.
10. Visual feature → Learning promotion path (ADR-001 §5).
11. Relationship-Intelligence activation-trigger checker (G-6).
12. A distributed event bus implementation (`BullMQEventBus`/`InngestEventBus` — currently comments only).
13. OCR / true pixel-level image analysis (deliberately out of scope today, still a gap against the audit's example capability list).
14. Embeddings / vector storage / semantic search (deliberately out of scope today, same caveat).
15. A knowledge-graph structure (the term is aspirational-only in current docs).
16. Query-builder extraction into `db/queries/` (six empty files — undecided, not missing per se).
17. Live-database integration test execution for E1-1/E1-2/E1-3/E1-4 and the npm-publish dry run.
18. A CI workflow definition (none exists in-repo — G-8).
19. Root `tsconfig.base.json` shared across packages (none exists — G-8).
20. Lint configuration with an import-boundary rule that would have caught G-2 automatically (G-8's specific recommendation).

**Top dormant capabilities**
1. Knowledge ingestion via HTTP (`/v1/knowledge/ingest`) — fully built, returns 501 due to a 2-line wiring gap.
2. `HypothesisEngine.discardExpired()` — real decay/expiry method, never called by anything.
3. The "correct" write paths on `UserIntelligenceDomain`/`KnowledgeIntelligenceDomain` — stubbed specifically because a bypass already does the job.
4. `RelationshipIntelligenceDomain` — constructed, entirely unreachable.
5. Extracted visual features — computed every ingest, never consumed downstream.
6. `IntelligenceOS.buildBlueprint()` / `.getBrandSummary()` / `.upsertProject()` / `.reviewLearning()` — real and complete, but not reachable from either HTTP host, only from a direct SDK import.
7. Archetype/identity resolution — real (Surface A), structurally unreachable from Surface B (`CognitionProvider`) due to the workspace-only scoping decision.
8. `db/queries/` — six placeholder files, explicitly undecided fate.
9. Distributed event bus support — sketch-only, not built.
10. Coverage-threshold enforcement above the current stale 40/30 Sprint-0 values.

**Top production risks**
1. Zero live-database validation across the entire persistence layer, RLS policies included.
2. G-2's domain-boundary bypass, left long enough, becomes the template new contributors copy.
3. No CI workflow exists — every "✅ passing" claim in the repo's own status docs was produced by a human/agent running commands locally, not by an enforced gate.
4. `HypothesisEngine`/`LearningValidator`/`ProfileBuilder` — the write path for the entire Learning Pipeline — have zero dedicated unit tests; only indirect integration coverage.
5. `WorkspaceIntelligenceDomain.enforceComplianceConstraints()` being a stub means `ConflictResolutionModel`'s COMPLIANCE-first authority rule has no real upstream data source — the highest-authority rule in the conflict model is currently unfed.
6. No distributed event bus — a single in-process crash mid-pipeline has no documented recovery/replay story beyond `PipelineRunResult.errors` being logged.
7. Two independent, only-partially-overlapping public surfaces (Surface A / Surface B) increase the chance of a capability being "live" on one and silently absent on the other, as already demonstrated by identity/visualIdentity.
8. `ProjectInput.brandosProjectId` / `getProjectByBrandosId()` naming still couples the schema to one historical consumer, flagged by the team itself as needing a coordinated migration.
9. No root shared `tsconfig`/lint config — nothing currently prevents the two packages' compiler settings from silently drifting apart.
10. `KnowledgeAssetExtractor` requires the caller to supply already-decoded text — any real deployment needs its own binary-format parsing layer upstream, which does not exist in this repository and is easy to assume is "somebody else's problem" without it being written down anywhere as a hard integration requirement.

**Top architectural strengths**
1. Mechanically enforced package-import boundaries (`check-boundaries.mjs`), not just convention.
2. A fail-soft-by-design Blueprint pipeline with 17 dedicated tests specifically for degradation behavior.
3. A near-complete, unusually candid self-documentation layer (`AGENT_CONTEXT.md` per directory, plus a `GAP_ANALYSIS.md` that pre-empts most of an external audit).
4. A clean, versioned, genuinely-reusable public contract (`@intelligence-os/shared-types`, `@platform/cognition-contract`) that doesn't require a consumer's source code.
5. Deterministic, LLM-free knowledge extraction that is exactly-testable (a real, exploited advantage: the `AGENT_CONTEXT.md` for `knowledge/` explicitly calls out that tests here can assert exact output, not just "returns something").
6. Typed error hierarchy consistently used and checked by-class throughout (`IntelligenceOSError` and 5 subclasses).
7. The quarantine gate in `SignalExtractor` — a genuine safety property (role-play/hypothetical/emotional-state signals can never become durable Learnings) with dedicated test coverage.
8. Correctly scoped Consumer-Adoption boundary: tasks that genuinely require a consumer's source tree are documented as out-of-scope rather than faked or assumed (`EPIC2_CONSUMER_ADOPTION_CHECKLIST.md`).
9. Row-mapping discipline: every domain defines a private row interface + `mapToX()` function, consistently, preventing snake_case leakage into the rest of the codebase.
10. A working dual-deployment story (persistent-process host + Vercel serverless) sharing 100% of routing/auth logic via one `createCognitionHttpServer()` factory, with no duplicated logic between the two.

**Top opportunities for rapid capability activation**
1. Wire `KnowledgeIngestPort` into both HTTP hosts (§11.1) — minutes of work, closes a real capability gap immediately.
2. Fix `ArtifactIntelligenceDomain.persistBlueprint()` — small, additive, no behavior change to existing callers.
3. Fix G-2 in `KnowledgeProcessor` first (smallest of the four bypass sites, one table) as a template before tackling the three pipeline classes.
4. Add the four missing unit test files (§11.3) — mechanical, low-risk, directly unlocks safely doing #3/G-2's harder pipeline fixes.
5. Decide and either implement or formally close the `db/queries/` question (G-5) — a one-meeting decision, not an engineering project.
6. Add the shared root `tsconfig.base.json` and a minimal CI workflow (G-8) — standard hygiene, immediately raises confidence in every other claim in this audit going forward.
7. Correct the target-architecture documents' `cognition/`/`memory/` module references and `CognitionProvider` interface sketch (§10) so future readers stop expecting directories/signatures that were deliberately superseded.
8. Rename `ProjectInput.brandosProjectId`/`getProjectByBrandosId()` in the same migration pass as any other pending schema change, per the team's own flagged low-priority item.
9. Write the Relationship-Intelligence activation-trigger checker (§11.5) — most of the read-side data it needs (`feedback_events`, named `audienceRef`) already exists in `ArtifactIntelligenceDomain`.
10. Raise `vitest.config.ts`'s stale 40/30 Sprint-0 coverage thresholds once #4 above lands — a one-line change that turns three sprints of accumulated test debt into an enforced floor going forward.
