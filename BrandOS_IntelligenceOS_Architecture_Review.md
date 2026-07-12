# BrandOS + IntelligenceOS — Architecture Discovery & Design Review

**Scope:** Full read of both monorepos (source, generated context artifacts, `AGENT_CONTEXT.md` files, ADRs, bootstrap/gap-analysis docs) as one platform composed of two bounded contexts.
**Method:** Discovery first. Every recommendation below is checked against what already exists before anything new is proposed.

---

## 1. Executive Summary

**The headline finding is that this review's core question is already answered — by the codebase itself.** Both repositories are unusually self-documenting: IntelligenceOS carries a `INTELLIGENCEOS_BOOTSTRAP.md`, a `REPOSITORY_READ_ORDER.md`, a standing `GAP_ANALYSIS.md` (findings G-1 through G-11, several already resolved), and two ADRs — one of which (**ADR-001**) already answers this review's Phase 3 question (should there be an "Identity Synthesis Engine") for the *visual* half of identity, using exactly the reasoning this review asked for. BrandOS carries a parallel set of `AGENT_CONTEXT.md` files per package plus a `.context/*.generated.md` corpus produced by real static-analysis scripts.

Three things fell out of reading both:

1. **The platform split this review's background section describes as an architectural goal has already substantially happened.** BrandOS's `@brandos/brand-intelligence` package — which used to do cognition in-process — has been **deleted**. It was replaced by `@brandos/cognition-client`, a thin HTTP adapter that calls IntelligenceOS's `apps/api` deployment via a shared `@platform/cognition-contract` package (`CognitionContext` / `CognitionProvider`). The "BrandOS talks to IntelligenceOS over HTTP" architecture in the task prompt is not a target state to design toward — it is the current state, already wired through `CPLOrchestrator`.
2. **BrandOS's own generated context corpus (`.context/*.generated.md`) is stale relative to this migration.** `system_inventory.generated.md`, `runtime_model.generated.md`, and `architecture_fixes.generated.md`'s reference tables all still describe `@brandos/brand-intelligence` as a live package with three owned tables — a package that no longer exists on disk. `check-boundaries.mjs` itself correctly reports 16 packages (post-deletion) with zero violations, so the *live* enforcement is accurate; it's the *hand-authored-adjacent generated prose* that lags. This is the single most valuable "fix the map, not the territory" item in this review (§9, Gap G-B1).
3. **Identity already exists — twice — and neither existing implementation is the shape this review's premise (a new "Identity Synthesis Engine") would produce.** IntelligenceOS already resolves identity as part of its Blueprint Pipeline (`IdentityContribution` inside `CognitionContext`, backed by `UserIntelligenceDomain`'s taxonomy-classified `Learning`s). BrandOS separately still carries a much richer, dormant identity type system (`ISemanticIdentity`, `IVisualIdentity`, `IdentitySignal`, versioning, projections) in `@brandos/contracts/identity-types.ts` — the surviving type-kernel of the deleted `brand-intelligence` package — which is now consumed only by `iskill-runtime`'s **unwired** `SkillRuntime.execute()` path, not the canonical generation flow. IntelligenceOS's own **ADR-001** already resolved the equivalent question for visual identity specifically, and reached "no seventh domain — absorb it into the six that exist," by exactly the reasoning this review's Phase 3 instructions describe. This review's answer for identity generally is the same shape of answer, extended: see §10.

**Recommendation posture:** this review does not propose new architectural layers. Every capability this review was asked to evaluate already has a home. The work that remains is (a) closing already-tracked, already-diagnosed gaps (both repos' own gap-analysis documents enumerate most of them), (b) regenerating BrandOS's stale `.context/*` artifacts, (c) retiring dead code and dead tables left over from the platform split, and (d) making two small, additive extensions to the `CognitionContext` contract so that identity-adjacent product surfaces BrandOS still needs (a raw-signal review UI, explicit brand-voice configuration ingestion) get a real home instead of throwing a `not_implemented` error.

---

## 2. Current Architecture — High-Level Flow

This is the **actual, current** flow (verified against `orchestrator.ts`, not the stale generated docs):

```
User
 │
 ▼
apps/web (Next.js API route, e.g. /api/control-plane/generate)
 │  requireUser() → workspaceId
 ▼
runControlPlane(request)                         [@brandos/control-plane-layer]
 │
 ▼
CPLOrchestrator.orchestrate()
 │
 ├─ Step 1: cognitionClient.resolveCognitionContext({ workspaceId, taskType })
 │           [@brandos/cognition-client → HTTP → IntelligenceOS apps/api]
 │           Never throws — degrades to createDegradedCognitionContext() on any failure.
 │
 ├─ Step 2: ContractAssemblerFactory.create()                [@brandos/output-control-layer]
 │           runs 6 Contributors in parallel over the resolved CognitionContext:
 │             IdentityContributor · PersonaContributor · IntentContributor ·
 │             ArtifactContributor · RuntimeContributor · SkillContributor
 │           → ResolvedGenerationContract
 │
 ├─ Step 3: compilePromptFromContract(contract)               [@brandos/output-control-layer]
 │           → CompiledPrompt { system, user }
 │
 ├─ Step 4: callWithMode(...)                                 [@brandos/ai-runtime-layer]
 │           multi-provider LLM call, provider-agnostic
 │
 ├─ Step 5 (structured task types only — carousel/deck/report):
 │           executeArtifactPipeline()                        [@brandos/artifact-engine-layer]
 │             → OCL compile*Artifact() → governance.validate*Artifact()
 │               → repair loop (max 2 attempts, LLM-injected repair)
 │
 ├─ Step 6: governance scoring                                 [@brandos/governance-layer]
 │           evaluateGovernance() for all task types
 │
 └─ Step 7: cognitionClient.observe({...})   (fire-and-forget)
             [@brandos/cognition-client → HTTP → IntelligenceOS]
             Never blocks the response; failures logged and swallowed.
 │
 ▼
Artifact (ArtifactV2) returned to user, plus governance score, plus audit/versioning/approval
 hooks wired inline after the governed pipeline completes (Phase C features).
```

Every major subsystem named in the task's target diagram exists, under these names:
- **Output Control Layer** = `@brandos/output-control-layer` (contract assembly + prompt compilation + post-generation normalization/compilation).
- **Prompt Compiler** = `compilePromptFromContract()`, a module inside OCL, not a separate package.
- **AI Runtime** = `@brandos/ai-runtime-layer` (`callWithMode()`), a domain-agnostic provider/router kernel — deliberately has zero knowledge of artifact types or OCL (Rule 4 / Fix C1: ARL must not import OCL).
- **Governance** = `@brandos/governance-layer`, with two independent, non-conflatable paths: text scoring (`evaluateGovernance()`, all task types) and structured semantic validation/repair (`validate*Artifact()` / `run*SemanticGovernance()`, structured types only).
- **Presentation / Export** = `@brandos/presentation-layer` (not deep-dived in this pass beyond confirming its existence and its one hard boundary rule: must not re-export `@brandos/auth` symbols from its own `index.ts` — `RULE-PL-AUTH-ISOLATION`).
- **Workspace orchestration** = `@brandos/control-plane-layer` (`CPLOrchestrator`), which is also where Phase C features (audit trail, artifact versioning, human-approval workflow, telemetry, admin settings, workspace tier/limits resolution) live — CPL is a wider "platform services" package, not just a thin router.

---

## 3. IntelligenceOS Architecture

IntelligenceOS is internally organized as **two packages** and, inside the engine package, **seven sub-areas**, each with its own `AGENT_CONTEXT.md`:

```
Knowledge Pipeline (knowledge/)         Learning Pipeline (pipeline/)
  upload → normalize                      FeedbackEvent
    → VocabularyExtractor                    ↓
    → FrameworkExtractor                  SignalExtractor  (quarantine gate)
    → PatternExtractor                       ↓
    → VisualFeatureExtractor (E1-4)       ObservationBuilder (confidence ceiling)
    → KnowledgeValidator                     ↓
    → persist (KnowledgeAsset)            HypothesisEngine (corroborate/contradict,
         │                                   state machine)
         │                                    ↓
         │                                LearningValidator (promote → Learning)
         │                                    ↓
         │                                ProfileBuilder (rebuild IntelligenceProfile)
         │                                    │
         ▼                                    ▼
   ┌─────────────────────────────────────────────────┐
   │              Blueprint Pipeline (blueprint/)      │
   │  ArtifactRequest                                  │
   │   → Step1 (parallel, fail-soft): profile,          │
   │     archetype, ProjectContextBuilder,              │
   │     AudienceCalibrator                             │
   │   → StructurePlanner → NarrativePlanner            │
   │   → detectConflicts() → ConflictResolutionModel    │
   │   → ArtifactBlueprint (assembled + persisted +     │
   │     emitted, both fire-and-forget)                 │
   └─────────────────────────────────────────────────┘
                         │
                         ▼
              HTTP API (apps/api, Vercel + Node server,
              exposes CognitionProvider over the wire)
```

**The six Domain Stores** (`domains/`) are the persistence boundary — each owns a disjoint set of `intelligence.*` Postgres tables and is the *only* code permitted to touch them:

| Domain | Owns | Status |
|---|---|---|
| `UserIntelligenceDomain` | `profiles`, `learnings`, `archetypes`, generic `audience_profiles` | Live reads; writes exist but are (currently, see Gap G-2 below) unused by their intended callers |
| `ProjectIntelligenceDomain` | `projects` | Fully live |
| `ArtifactIntelligenceDomain` | `artifact_patterns`, `artifact_exemplars`, `feedback_events`, `artifact_blueprints` | Live except `promoteExemplar()` (stub) |
| `KnowledgeIntelligenceDomain` | `knowledge_assets` | Live reads; `ingestAsset()` stub (real entry point is `IntelligenceOS.ingestKnowledgeAsset()` → `KnowledgeProcessor` directly) |
| `WorkspaceIntelligenceDomain` | workspace-scoped knowledge, compliance constraints | Partial by design — Phase 2 governance is real future scope, not an oversight |
| `RelationshipIntelligenceDomain` | `relationships`, named `audience_profiles` rows | Fully inert by design — every method throws `DomainNotActivatedError` until its documented activation trigger (≥3 external artifacts with named recipients) is met |

**Package split:** `@intelligence-os/shared-types` (pure contract types: `ArtifactRequest`, `ArtifactBlueprint`, `FeedbackEvent` — zero runtime logic) and `@intelligence-os/core` (everything else — `IntelligenceOS.ts` is the one class a consumer constructs).

**Runtime/deployment split (ADR-002):** `packages/*` is the pure, environment-agnostic SDK; `apps/*` (`apps/api`, `apps/demo`, `apps/playground`) owns everything environment-specific (server bootstrap, Vercel config, `.env`). This split is enforced mechanically by `scripts/check-boundaries.mjs` (`RULE-IOS-ISOLATION`), with no carve-outs remaining.

---

## 4. BrandOS Architecture

BrandOS is a 16-package, strictly layered monorepo (L0 → L10), enforced by four live boundary scripts (`check-boundaries.mjs`, `check-route-boundaries.mjs`, `check-workspace.mjs`, `lint-imports.mjs`) that currently report **zero violations**.

```
L0  @brandos/contracts           — zero-dependency type kernel (everyone depends on this)
L1  @brandos/shared-utils        — repairJSON/extractJSON, logging, retry
L2  @brandos/auth                — workspaces, users, personas, campaigns, brand_assets (Supabase)
L3  @brandos/runtime-config, @brandos/governance-config, @brandos/artifact-config, @brandos/ui-admin
L4  @brandos/ai-runtime-layer, @brandos/output-control-layer
L5  @brandos/governance-layer, @brandos/iskill-runtime
L6  @brandos/artifact-engine-layer, @brandos/cognition-client  (adapter to IntelligenceOS)
L7  @brandos/control-plane-layer
L8  (reserved — was brand-intelligence's old slot; cognition-client now sits at L6, see §9 Gap G-B3)
L9  @brandos/presentation-layer
L10 apps/web
```

Key packages beyond what §2's flow already named:

- **`@brandos/contracts` (L0):** the type kernel — artifact schemas + structural constraints (`CAROUSEL/DECK/REPORT_STRUCTURAL_CONSTRAINTS`, moved here from `governance-config` in Cleanup Sprint 2 to decouple OCL from governance policy churn), the generation-contract interfaces every Contributor implements, and — notably — `identity-types.ts`, a large, richly-specified identity type system (see §10).
- **`@brandos/cognition-client` (L6):** the **only** BrandOS package permitted to hold a concrete `CognitionProvider`. Performs no reasoning — pure serialize/deserialize + HTTP + degraded-mode fallback. This is the package that replaced `@brandos/brand-intelligence` wholesale.
- **`@brandos/iskill-runtime` (L5):** a fully-implemented governed-execution runtime for "ISkill" workflows (validate→prepare→execute→govern→repair→finalize→export). As of a human-approved gate-lift, only its lightweight **contract-contribution** path is wired into the canonical flow (via `SkillContributor`); its heavier `SkillRuntime.execute()` lifecycle remains unwired to production generation.
- **`@brandos/artifact-engine-layer` (L6):** owns `compileAndGovern()` — the structured-artifact-specific loop of compile → validate → repair (max 2 attempts). Two of its files (`engine.ts`, `registry.ts`) are explicitly marked **hard no-touch zones** requiring human approval to modify.

---

## 5. Capability Inventory

| Capability | Owner | Inputs | Outputs | Maturity | Actively used? |
|---|---|---|---|---|---|
| Knowledge extraction (vocabulary/framework/pattern) | IntelligenceOS `knowledge/` | uploaded asset + metadata | `KnowledgeAsset` w/ extracted fields | Live, heuristic-only by design | Yes — sole path is `IntelligenceOS.ingestKnowledgeAsset()` |
| Visual feature extraction | IntelligenceOS `knowledge/VisualFeatureExtractor` | asset content | `VisualFeatureExtractionResult` | Implemented (E1-4), text-layer signals only (no pixel analysis yet) | Yes, Stage 4 of `KnowledgeProcessor`, parallel with the three text extractors |
| Workspace/Project learning | IntelligenceOS `pipeline/` + `ProjectIntelligenceDomain` | `FeedbackEvent` | `Learning`, `IntelligenceProfile` | Live, event-driven | Yes |
| Blueprint generation | IntelligenceOS `blueprint/BlueprintBuilder` | `ArtifactRequest` | `ArtifactBlueprint` | Live, always-succeeds guarantee tested | Yes — but see Gap G-I3: not yet the thing BrandOS actually calls (BrandOS calls `resolveCognitionContext`, a narrower/different-shaped surface — §9) |
| Brand summary / Cognition summary | IntelligenceOS `getBrandSummary()` / `summarizeCognition()` | userId/workspaceId | `IntelligenceSummary` / `CognitionSummary` | Live | Yes, display-only path, distinct from generation path |
| Context Builder (project scope) | IntelligenceOS `blueprint/ProjectContextBuilder` | projectId, userId | `ProjectContext` | Live, fail-soft to empty default | Yes |
| Persona (BrandOS-local) | `@brandos/auth` persona storage + OCL `PersonaContributor` | persona row + `CognitionContext.voice` | `IPersonaContribution` | Live | Yes — but persona configuration itself does not yet flow to IntelligenceOS (Gap G-I2 / contract gap #2, §9) |
| Vocabulary | IntelligenceOS Knowledge Pipeline | uploaded docs | vocabulary terms | Live, heuristic | Yes |
| Archetypes | IntelligenceOS `UserIntelligenceDomain` | — | `Archetype` | Live (open string union, 16 named + escape hatch) | Yes, drives `StructurePlanner` defaults |
| Frameworks | IntelligenceOS Knowledge Pipeline `FrameworkExtractor` | uploaded docs | named frameworks | Live, heuristic | Yes |
| Prompt Contributors | BrandOS OCL `contract-assembler/contributors/` | `ContributorContext` | typed contract slice | Live, 6 contributors (see §6) | Yes |
| Governance | `@brandos/governance-layer` | `ArtifactV2` | score + validation + repair | Live, two independent paths | Yes |
| Memory / Learning | IntelligenceOS `pipeline/` + `UserIntelligenceDomain` | signals | `Learning`, `IntelligenceProfile` | Live | Yes |
| Signals | IntelligenceOS `pipeline/SignalExtractor` | feedback event | `Signal` (transient, in-memory only — `intelligence.signals` table exists but is intentionally unused, a documented Sprint-2 scope decision) | Live, deliberately not persisted | Yes, in-process only |
| Identity (IntelligenceOS side) | `UserIntelligenceDomain` taxonomy + Blueprint `NarrativePlanner` | Learnings | `IdentityContribution` field on `CognitionContext` | Live | Yes |
| Identity (BrandOS-local, legacy) | `@brandos/contracts/identity-types.ts` | — | `ISemanticIdentity`, `IVisualIdentity`, `IdentitySignal`, `IdentityVersionRecord`, `ISkillPersonalizationContext` | **Dormant** — type-only survivor of the deleted `brand-intelligence` package | Only consumed by `iskill-runtime`'s unwired `SkillRuntime.execute()` path — **not** the canonical generation flow (§10) |
| Campaign Learning | `@brandos/auth` (`campaigns` table) + CPL reads | — | campaign rows | Live at the data layer; no dedicated learning logic found beyond CRUD | Partial |
| Projects | IntelligenceOS `ProjectIntelligenceDomain` | — | `Project` | Live | Yes |
| Relationships | IntelligenceOS `RelationshipIntelligenceDomain` | — | — | **Fully inert by design** | No — activation trigger not yet met, and (per IntelligenceOS's own Gap G-6) nothing currently checks whether it has been met |
| Raw-signal review (human approve/reject of pending memory signals) | Formerly `@brandos/brand-intelligence`; now **nothing** | — | — | **Broken** | No — `getBrandMemory()` throws by design (§9 Gap G-I1); `/workspace/brand` review UI has no working data source |

---

## 6. Contributor Architecture (BrandOS OutputControlLayer)

`ContractAssemblerFactory.create({ contributorSet: 'default' })` wires **six** independent contributors (not five — `SkillContributor` was added at the Phase 2.6 gate-lift and is easy to miss if you only read the top-level `AGENT_CONTEXT.md`, which still describes five):

| Contributor | Responsibility | Inputs | Outputs | Dependencies |
|---|---|---|---|---|
| `IdentityContributor` | Pure field-read + 1:1 rename from `CognitionContext.identity` into `IIdentityContribution`. Applies **no** confidence gate of its own — absence (`identity: null`) *is* the gate, already applied upstream by IntelligenceOS. | `ContributorContext.cognitionContext.identity` | `IIdentityContribution` or `null` | `@brandos/contracts` types only |
| `PersonaContributor` | Maps `CognitionContext.voice` fields into `IPersonaContribution` (tone, voice, audience positioning). Fully self-contained since Cleanup Sprint 2 WS3 — no delegation back into any cognition runtime. | `cognitionContext.voice`, `applyBrandMemory` gate | `IPersonaContribution` or `null` | `@brandos/contracts` types only |
| `IntentContributor` | Wraps `analyzeIntent()` output (`detected_task`, `confidence`, `ambiguity_level`) plus topic extraction from the raw user prompt. | `context.intentAnalysis`, `context.userPrompt` | `IIntentContribution` (required — has a fallback builder if absent) | none beyond contracts |
| `ArtifactContributor` | Derives schema version, required roles, min/max slide/section counts, and the schema-instruction string **from `@brandos/contracts`' structural constraint constants** — never hardcoded. | `taskType` | `IArtifactContribution` (required — has a fallback) | `@brandos/contracts` constants |
| `RuntimeContributor` | Quality threshold, retry budget, runtime mode, attempt tracking, and forwarded governance-feedback attempt history (closed-loop feedback). | `context.attempt`, `context.runtimeMode`, `context.attemptHistory` | `IRuntimeContribution` (required) | none |
| `SkillContributor` | Optional ordered workflow-stage / success-criteria guidance for a registered ISkill, gated behind a runtime feature flag (`globalThis.__brandos_iskill_contract_contributor`). Currently only `carousel-founder` is wired. | `taskType`, feature flag | `ISkillContribution` or `null` | `@brandos/iskill-runtime`'s skill registry (read-only, contract-level only) |

**Assembly mechanics** (`ContractAssembler.assemble()`): all six run **in parallel** via `Promise.all`; any contributor throwing is caught and treated as `null` (graceful degradation, never propagated); required slots (`intent`, `artifact`, `runtime`) fall back to typed defaults if genuinely unregistered; optional slots (`identity`, `persona`, `skill`) are allowed to be `null`.

**Can this architecture naturally accommodate additional contributors? Yes — and it already has, twice.** Registration is additive (`assembler.register(slot, contributor)`), each contributor is independent (receives the same `ContributorContext`, produces its own slice, no cross-contributor dependencies), and `ContractAssemblerFactory`'s `additionalContributors` option exists specifically for overriding or adding slots without touching the factory itself. `SkillContributor`'s own history is the concrete proof: it was *moved* into this directory from a stub in `control-plane-layer` specifically so an existing feature flag would take effect, with zero changes needed to `ContractAssembler`'s orchestration logic. A seventh contributor (e.g., a future `VisualDirectivesContributor` mirroring IntelligenceOS's ADR-001-recommended `VisualDirectives` field) would slot in exactly the same way: new file, one `register()` call, no change to the assembly mechanism.

---

## 7. Cognition Pipeline (Cross-System Trace)

```
Workspace (workspaceId)
   │
   ▼
CPLOrchestrator.orchestrate()
   │  cognitionClient.resolveCognitionContext({ workspaceId, taskType })
   ▼
@brandos/cognition-client — HttpCognitionProvider
   │  HTTP POST → apps/api (IntelligenceOS)
   ▼
IntelligenceOS apps/api → createCognitionRequestHandler → (implementation TBD/mapped —
   see Gap G-I3: this HTTP surface's actual method-name and shape mapping onto
   IntelligenceOS.buildBlueprint()/getBrandSummary() was not found as a single
   direct 1:1 mapping in the reviewed source — see §9)
   │
   ▼
CognitionContext (IMPLEMENTED shape — 4 sections: voice, identity, visualIdentity,
   provenance, plus confidence + contractVersion + resolvedAt + workspaceId)
   │  ◄── returned over HTTP, deserialized by cognition-client
   ▼
CPLOrchestrator holds cognitionContext for the rest of the request
   │
   ▼
ContractAssemblerFactory.assemble({ cognitionContext, ...other fields })
   │  IdentityContributor reads .identity
   │  PersonaContributor reads .voice
   ▼
ResolvedGenerationContract { identity, persona, intent, artifact, runtime, skill }
   │
   ▼
compilePromptFromContract() → CompiledPrompt { system, user }
```

**Objects crossing the system boundary, exactly:**
- `CognitionRequest { workspaceId, taskType? }` — BrandOS → IntelligenceOS
- `CognitionContext { contractVersion, workspaceId, resolvedAt, confidence, voice, identity, visualIdentity, provenance }` — IntelligenceOS → BrandOS (**as implemented** — narrower than the aspirational 11-section shape in `COGNITION_CONTRACT_SPEC.md`; see Gap G-I4)
- `ObservationInput { workspaceId, requestId, outputText, score, topic?, artifactType?, wasRepaired?, observedAt? }` — BrandOS → IntelligenceOS, fire-and-forget
- `CognitionReviewDecision { workspaceId, entryId, approved, reviewedBy }` — BrandOS → IntelligenceOS, human-triggered
- `CognitionSummary` — IntelligenceOS → BrandOS, display-only
- `CognitionHealth` — IntelligenceOS → BrandOS

No other object crosses. This is enforced by `@platform/cognition-contract`'s own docblock ("THIS FILE IS THE ENTIRE COGNITIVE VOCABULARY BRANDOS IS PERMITTED TO HAVE") and by the fact that `cognition-client` is the *only* BrandOS package allowed to import the contract's provider interface.

---

## 8. Data Flow Diagrams

### 8.1 Uploads → Knowledge → Database → Context

```
User uploads asset (BrandOS UI, product surface not deep-dived this pass)
   │
   ▼
IntelligenceOS.ingestKnowledgeAsset(asset, rawContent)
   │
   ▼
KnowledgeProcessor.process(): createJob → [Vocabulary | Framework | Pattern | Visual]Extractor
   (Stages 1–4, parallel) → KnowledgeValidator (Stage 5) → persistAsset (Stage 6)
   │
   ▼
intelligence.knowledge_assets  ⚠ written directly by KnowledgeProcessor.persistAsset(),
   bypassing KnowledgeIntelligenceDomain — a known, already-tracked boundary
   violation (IntelligenceOS Gap G-2), not something this review is newly discovering.
   │
   ▼
Read back by: ProjectContextBuilder (project-scoped assets), NarrativePlanner
   (vocabulary/framework guidance) — both via KnowledgeIntelligenceDomain.getAssets()
```
**Terminates today at:** `intelligence.knowledge_assets`, consumed synchronously during Blueprint assembly. No path currently promotes a knowledge asset's extracted content into a `Learning` — that promotion is explicitly future work per IntelligenceOS's own docs.

### 8.2 Generation → Observations → Learnings → Context

```
CPLOrchestrator.orchestrate() completes generation
   │
   ▼
cognitionClient.observe({ workspaceId, requestId, outputText, score, wasRepaired, ... })
   │  fire-and-forget, never blocks response
   ▼
IntelligenceOS's HTTP surface → (maps to) recordFeedbackEvent() / FeedbackProcessor
   │
   ▼
SignalExtractor (quarantine gate: role_play / hypothetical / emotional_state discarded)
   │
   ▼
ObservationBuilder (confidence ceiling by source quality)
   │
   ▼
HypothesisEngine  ⚠ writes directly to intelligence.hypotheses, bypassing
   UserIntelligenceDomain (Gap G-2)
   │
   ▼
LearningValidator (corroboration threshold check)  ⚠ same violation, writes
   intelligence.learnings directly
   │
   ▼
ProfileBuilder → intelligence.profiles (versioned)  ⚠ same violation
   │
   ▼
Read back by: Blueprint Pipeline's Step 1 (current profile fetch), next
   buildBlueprint() call → surfaces as CognitionContext.identity / .voice on
   the next resolveCognitionContext() call.
```
**Terminates today at:** a new `IntelligenceProfile` version, surfaced to BrandOS only on the *next* request (never synchronously — Architectural Rule 4: the Learning Pipeline never runs inside request handling).

### 8.3 Campaigns → Feedback → Learning → Context

```
BrandOS campaigns table (@brandos/auth) ── read by CPL for context assembly
   │
   ▼
No dedicated "campaign learning" pipeline was found in either repository.
```
**Terminates today at:** plain CRUD. "Campaign Learning" as a named capability in the task prompt's example list does not have a corresponding implementation — it is a gap, not a hidden capability (see §9, Gap G-B4).

### 8.4 Orphaned data (platform-split residue)

```
intelligence_signals, identity_versions, brand_memory_entries
   (BrandOS's own Supabase schema, per .context/database_context.generated.md)
      Owner (on record): @brandos/brand-intelligence
      Writer (on record): @brandos/brand-intelligence
   │
   ▼
@brandos/brand-intelligence no longer exists in the source tree.
```
These three tables have **no current writer** in the codebase. They are not read by anything live either (their only documented reader was `@brandos/control-plane-layer`, and CPL's brand-memory service now proxies to `cognition-client`, not these tables directly). This is dead data infrastructure, not a hidden live capability — see §9, Gap G-B2.

---

## 9. Gap Analysis

Both repositories already maintain their own gap-analysis documents (IntelligenceOS's `GAP_ANALYSIS.md`, G-1 through G-11, and BrandOS's package-level "Known Technical Debt" sections). This review does not repeat those in full — it defers to them as the authoritative, already-diagnosed record for gaps *internal* to each repository, and adds only what's new from viewing the two as one platform.

### From IntelligenceOS's own Gap Analysis (still open as of this review)
- **G-2 (tier 1):** Four pipeline classes (`HypothesisEngine`, `LearningValidator`, `ProfileBuilder`, `KnowledgeProcessor`) bypass their owning domain's write methods and hold raw Supabase clients directly. `UserIntelligenceDomain.insertLearning()`/`.upsertProfile()` already exist and are unused by their intended callers. **This is the single highest-leverage internal fix in IntelligenceOS** — smallest possible change, already-built target methods, already flagged as the codebase's own most emphatically-stated rule with known live violations.
- **G-4:** Coverage thresholds are stale (`lines: 40, branches: 30`, dated "Sprint 0," three pipelines later). `HypothesisEngine`, `LearningValidator`, `ProfileBuilder`, `ProjectContextBuilder` have no dedicated unit tests.
- **G-5:** `db/queries/` is six empty placeholder files with no importers — needs an explicit keep-or-delete decision.
- **G-6:** `RelationshipIntelligenceDomain`'s stated activation trigger (≥3 external artifacts with named recipients) is not mechanically checked anywhere.
- **G-8:** No root `tsconfig.base.json`, no lint config, no CI workflow definition exist yet.

### New findings from reading both repositories as one platform

**G-B1 (tier 1 — actively misleading, same severity class as IntelligenceOS's own G-1).** BrandOS's generated `.context/*.generated.md` corpus (`system_inventory.generated.md`, `runtime_model.generated.md`) still describes the pre-split, in-process `@brandos/brand-intelligence` architecture — "Brand Intelligence Runtime," `resolveBrandCognitionContext() → BI runtime.resolve()`, three BI-owned tables — as current fact. The package these documents describe does not exist on disk. `architecture_fixes.generated.md`'s live-script output (§ "Summary: 0 real violations... 16 packages checked") is *accurate* and current; it's specifically the descriptive prose sections (system inventory, runtime model, and the static "Common Violation Patterns" reference table's RULE-1/2/3/6/7 descriptions, which still name `@brandos/brand-intelligence` symbols) that have not been regenerated since the platform split. **Fix:** re-run `scripts/generate-system-inventory.mjs` and `scripts/generate-runtime-model.mjs`, and update `scripts/shared/architecture-rules.mjs`'s RULE-1/2/3/6/7 descriptions to reference `@brandos/cognition-client` instead of the deleted package (the boundary checks themselves already pass because the deleted package genuinely can't be imported — this is a documentation-only fix, but the same "contradicts the running code" trust-erosion risk IntelligenceOS's own G-1 already named).

**G-B2 (tier 2).** `identity_signals`, `identity_versions`, and `brand_memory_entries` are live Supabase tables (per BrandOS's own schema documentation) with a documented owner/writer (`@brandos/brand-intelligence`) that no longer exists. No current code writes to them; the only documented reader (`@brandos/control-plane-layer`) now reads cognition data via HTTP instead. **These are very likely dead tables carrying real (if stale) production data.** Recommendation: confirm via a direct database query (not source-code analysis, since no writer means no code trail) whether these tables still hold rows, decide on an archival/export step if so, and then drop them — or, if there's a reason to keep historical brand-memory data queryable, migrate it once into IntelligenceOS's `intelligence.learnings`/`intelligence.profiles` as historical seed data rather than leaving it stranded in a schema no package owns.

**G-B3 (tier 3).** BrandOS's layer numbering (`L0`–`L10`) still has `cognition-client` documented as occupying `@brandos/brand-intelligence`'s old L6 slot in its own `AGENT_CONTEXT.md` header ("Layer: L6 — Cognition Client (formerly L6 Brand Intelligence)"), which is internally consistent, but `system_inventory.generated.md`'s layer table (§4 above) still lists an `L7 @brandos/control-plane-layer` / doesn't reflect `cognition-client` at all in its layer-distribution counts (it shows 16 packages total but the layer table's per-layer package list is the stale, pre-split one). Same root cause as G-B1; folds into the same fix.

**G-B4 (tier 2).** "Campaign Learning," named explicitly in this review's own capability-inventory prompt, has no corresponding implementation in either repository beyond plain CRUD on BrandOS's `campaigns` table. This isn't a partially-implemented feature to finish — it's a capability that was named as an example in planning material but was never designed. If it's still wanted, it needs a design decision (most likely: campaigns become a `projectId`-equivalent scope inside IntelligenceOS's existing `ProjectIntelligenceDomain`/`ArtifactIntelligenceDomain`, rather than a new domain — see the same reasoning ADR-001 already applied to visual identity, §10) — not a silent assumption that it already exists somewhere unexamined.

**G-I1 (tier 1 — product-breaking, already self-diagnosed inside BrandOS, not hidden).** `getBrandMemory()` (the CPL proxy backing `/workspace/brand`'s raw-signal review UI) **throws by design** — `CognitionProvider` has no operation returning a list of raw/reviewable signals, by deliberate exclusion-list design (`COGNITION_CONTRACT_SPEC.md` §4). The route already degrades this to a `501 not_implemented` rather than a raw crash, and both `packages/cognition-contract/README.md` and this route's own header comment already flag it as an open product decision, not a bug to silently fix. This review's contribution is confirming it end-to-end (contract → client → CPL → route → UI) and recommending a specific resolution path in §11.

**G-I2 (tier 1 — same class as G-I1).** Explicit, user-edited brand-voice configuration (persona name, tone override, banned phrases from `@brandos/auth`'s persona storage) **no longer reaches IntelligenceOS at all.** Pre-split, this was forwarded and merged live with learned signals inside `BrandIntelligenceRuntime`. `CognitionRequest` now carries only `{ workspaceId, taskType }` by deliberate design (no raw configuration on the synchronous read path, per `INTELLIGENCE_PLATFORM_IMPLEMENTATION.md` §4). Also already flagged as an open decision in both repos' own docs. This is a real product regression risk if unresolved: a user who explicitly sets a brand voice override today has that override applied *only* by BrandOS's own `PersonaContributor` reading `CognitionContext.voice` — but IntelligenceOS's own learning loop, and any *other* future consumer of IntelligenceOS, never learns that the user explicitly asked for this, so it can't be corroborated, contradicted, or reasoned about the way a learned signal would be.

**G-I3 (tier 2 — verification gap in this review, not a confirmed code defect).** This review's source read did not surface a single, explicit request-handler file inside `apps/api` mapping `CognitionProvider.resolveCognitionContext()` 1:1 onto `IntelligenceOS.buildBlueprint()` / `.getBrandSummary()`. Both the shape (`CognitionContext`'s 4 sections vs. `ArtifactBlueprint`'s much richer 11+-field shape) and the operation names (`resolveCognitionContext`/`observe`/`review`/`summarizeCognition`/`checkHealth` vs. `buildBlueprint`/`recordFeedbackEvent`/`reviewLearning`/`getBrandSummary`) don't line up as a trivial rename — someone, somewhere, is doing real translation work between IntelligenceOS's rich internal contract (`IIntelligenceProvider`) and BrandOS's narrow external one (`CognitionProvider`). This adapter/translation layer is either (a) inside `apps/api`'s route handler (most likely, and architecturally correct per ADR-002 — `apps/api` is exactly where consumer-facing translation belongs), (b) not yet built, with `apps/api` currently a thinner pass-through than the two contracts' shape difference would allow, or (c) present but not surfaced clearly enough in the `AGENT_CONTEXT.md` layer for this review to find without deeper source diffing than this pass performed. **Recommendation: confirm which of (a)/(b)/(c) is true as a first follow-up** — if (b), this is the actual, previously-unstated missing piece connecting the two platforms' documented architectures, and matters more than any other finding in this section.

**G-I4 (tier 2).** `COGNITION_CONTRACT_SPEC.md` (the "constitutional," canonical-status document) specifies an 11-section `CognitionContext` (`identity, voice, knowledge, reasoning, positioning, audience, narrative, visualIdentity, guidance, confidence, provenance`) and a 5-operation `CognitionProvider` named `resolveCognitionContext / reportObservation / submitReviewDecision / describeCognition / checkAvailability`. The **actual, implemented** `CognitionContext.ts` has 4 sections (`voice, identity, visualIdentity, provenance`) and the implemented `CognitionProvider` uses different operation names (`observe / review / summarizeCognition / checkHealth`). This is not a contradiction to panic over — `INTELLIGENCE_PLATFORM_ARCHITECTURE.md` itself is explicitly labeled "describes where the platform is going, not where it is today," and the Spec document is the aspirational target the two platforms are still growing toward. But it should be tracked explicitly as a **versioned gap between spec and implementation**, the same way IntelligenceOS's own Gap Analysis tracks internal gaps, rather than left implicit — a future contributor reading the Spec cold could easily think `knowledge`/`reasoning`/`positioning`/`audience`/`narrative`/`guidance` already exist as contract fields today.

**G-I5 (tier 3).** The `@platform/cognition-contract` package is, by its own README's admission, **physically duplicated byte-for-byte** across both repositories, with a documented but unscheduled follow-up to publish it to a real registry. Every finding above about the contract's shape lagging the spec applies to both copies simultaneously — confirm both copies are still identical before acting on any contract change.

---

## 10. Identity Analysis

**This review's Phase 3 instructions ask three questions. All three already have direct evidence in the repositories — this section answers them from that evidence, not from a blank-slate design exercise.**

### 10.1 Does an identity system already partially exist?

**Yes — two of them, at different layers, with different maturity, and they are not the same system:**

1. **IntelligenceOS's identity model** (live, current): identity is not a standalone object at all — it's the *synthesis* of `Learning` rows carrying identity-relevant `taxonomyCategory` values (`professional_identity` and related categories out of the 25-value taxonomy), assembled by `ProfileBuilder` into the versioned `IntelligenceProfile`, and projected into `IdentityContribution` only at the moment `NarrativePlanner` builds a `CognitionContext`/`ArtifactBlueprint`. There is no `IdentityDomain` — identity is a *view* over `UserIntelligenceDomain`, exactly the way `WorkspaceIntelligenceDomain`'s compliance constraints are a view over workspace-scoped data. This is the pattern IntelligenceOS's own architecture (six domains, organized by ownership/lifecycle, not subject matter) already establishes.

2. **BrandOS's legacy identity model** (dormant): `@brandos/contracts/identity-types.ts` defines a far richer, standalone identity system — 15 semantic dimensions and 11 visual dimensions, a full `IdentitySignal` model (confidence, frequency, decay, review status), versioned snapshots (`IdentityVersionRecord`, `IdentityProfile`), and a projection layer (`IIdentityProjection`, `ISkillPersonalizationContext`) originally built to serve `@brandos/brand-intelligence`. That package is deleted. Today this type system is imported only by `iskill-runtime`'s `personalization/context.ts`, which itself is only exercised by `SkillRuntime.execute()` — the **heavier**, currently-unwired execution lifecycle (not `SkillContributor`, which *is* wired and does not touch these types). **In the canonical, production generation path, none of this rich model is populated or read.** It survives as type-only scaffolding for a subsystem (`iskill-runtime`'s full execute lifecycle) that is itself dormant by explicit, human-approved decision.

### 10.2 Is identity already represented under another name?

Yes, on both sides, and the names map cleanly:

| BrandOS's dormant name | IntelligenceOS's live equivalent |
|---|---|
| `ISemanticIdentity` (tone, hooks, CTAs, narrative patterns, argumentation style...) | `Learning` rows under `UserIntelligenceDomain`, taxonomy categories in the "voice/style" family, synthesized into `IntelligenceProfile`, projected as `IdentityContribution.hookStyle/ctaIntent/narrativeArcs/argumentationStyle` |
| `IVisualIdentity` (color, typography, layout, motion, mood) | **Explicitly and recently decided** by IntelligenceOS's own ADR-001: not a domain, but `Learning`s under the same taxonomy (a `visual_identity`-family category), `WorkspaceIntelligenceDomain` compliance constraints for governance, `ArtifactPattern`/`ArtifactExemplar` structural fields, and `KnowledgeAsset` for uploaded brand-guideline material — surfaced as `VisualDirectives` alongside `VoiceDirectives` in the Blueprint's `NarrativeFrame`, and today already partially surfaced as `CognitionContext.visualIdentity` |
| `IdentitySignal` / signal review, confidence, decay | IntelligenceOS's `Signal → Observation → Hypothesis → Learning` pipeline (a strict superset — corroboration thresholds, quarantine gate, explicit-correction fast path, none of which BrandOS's dormant model had) |
| `IdentityVersionRecord` / `IdentityProfile` versioning | `IntelligenceProfile.version`, rebuilt and superseded on every `ProfileBuilder.rebuild()` |
| `ISkillPersonalizationContext` / projections | No direct IntelligenceOS equivalent yet — this is genuinely BrandOS-side execution-time personalization plumbing (which skill variant to run), not cognition. Its dependency on the *dormant* identity types, rather than on `CognitionContext`, is itself a leftover of the pre-split architecture and should be re-pointed if/when `iskill-runtime`'s full execute lifecycle is ever wired in. |

Also relevant: `Brand Summary` and `Workspace Summary` (named explicitly in the task prompt's examples) are not separate identity representations — they are IntelligenceOS's `getBrandSummary()`/`CognitionSummary`, a deliberately display-shaped, non-generation-driving projection, distinct by design from both of the identity representations above (per `CognitionProvider`'s own docblock: "distinct from `resolveCognitionContext`... not for driving generation").

### 10.3 Should identity be a new subsystem, an evolution of ContextBuilder, an evolution of Brand Summary, another Contributor, or something else?

**None of the above, in the "build something new" sense — and IntelligenceOS's own ADR-001 already reasoned through the equivalent question and reached this conclusion for the visual half of identity specifically.** Applying ADR-001's own test (a new domain/subsystem is warranted only when a body of knowledge has ownership, lifecycle, or query patterns that don't fit any existing structure — not merely a new subject-matter label) to identity as a whole, not just its visual slice:

- **Ownership** already fits `UserIntelligenceDomain` (personal/professional identity facts) and `WorkspaceIntelligenceDomain` (declared, governance-level identity facts like a mandated brand name or compliance-locked positioning) — no identity fact surfaced in either repository's type system needs a table neither domain can own.
- **Lifecycle** already fits the existing `Signal → Observation → Hypothesis → Learning → Profile` machinery — including, notably, machinery BrandOS's dormant model never had (corroboration thresholds, a quarantine gate against role-play/hypothetical/emotional-state signals, an explicit-correction fast path). Rebuilding identity as a new subsystem would either duplicate this machinery or ship a *weaker* version of it than what already exists.
- **Query pattern** already fits `NarrativePlanner`'s existing role — reading pre-loaded profile/context data and producing directives, with no new I/O.

**Therefore: identity is already correctly positioned as an evolution of ContextBuilder / NarrativePlanner (IntelligenceOS side) plus a Contributor (BrandOS side, `IdentityContributor` already exists and already follows the correct "pure field-read, no re-derivation" pattern).** The concrete, additive work that remains — none of it a new subsystem — is:

1. **Retire, don't replace, BrandOS's dormant identity model.** `identity-types.ts`'s rich types are not wrong — they're a more detailed spec than what shipped — but they're stranded, type-checked against nothing live. Either (a) archive them explicitly (move to a clearly-marked `legacy/` location or delete, once `iskill-runtime`'s heavier execute lifecycle is confirmed to have no near-term activation plan — confirm with whoever owns that gate-lift decision before deleting), or (b) if `SkillRuntime.execute()` does have a near-term activation plan, re-point `personalization/context.ts` to build `ISkillPersonalizationContext` from `CognitionContext` instead of from the dormant local types, closing the gap rather than leaving two identity models in one repository.
2. **Close Gap G-I2 (persona/brand-voice configuration has no path into IntelligenceOS)** by extending `CognitionRequest` or adding a narrow, explicit ingestion operation (a sync/on-change call, not a sixth generation-time method) — this is genuinely new *wiring*, not a new *subsystem*, and both repos' own docs already correctly identify it as the right kind of change to make (an addition to the existing contract) rather than a new BrandOS-local identity engine that would violate `COGNITION_CONTRACT_SPEC.md` Rule 1 ("BrandOS never implements cognition") the moment it started merging that configuration with learned signals locally.
3. **Close Gap G-I1 (no raw-signal review surface)** with a narrowly-scoped, already-summarized read operation (classification + confidence + a pre-rendered display string, per the contract's own exclusion-list-compliant recommendation) — again, additive to the existing contract, not a new engine.
4. **Extend `CognitionContext` toward the Spec's richer shape incrementally** (§9 G-I4) — `knowledge`, `reasoning`, `positioning`, `audience`, `narrative`, `guidance` as they're actually built, each as an additive section, exactly the evolution path `COGNITION_CONTRACT_SPEC.md` §5 already defines.

**An "Identity Synthesis Engine" as a new, named component would be solving a documentation/wiring gap with a code change — the same anti-pattern IntelligenceOS's own ADR-001 explicitly named and rejected when evaluating whether Visual Intelligence needed a seventh domain.** The identity *capability* this review's premise is reaching for already exists on the IntelligenceOS side and is already the correct architecture; what's missing is (a) retiring the stranded BrandOS-side duplicate, and (b) two or three additive contract extensions to close named, already-self-diagnosed gaps — not a new engine anywhere.

---

## 11. Recommended Target Architecture (2-Year Horizon)

Because the underlying split (Execution Platform vs. Cognitive Platform) is already correctly in place, the two-year target is **not** a different shape — it's the current shape with its self-diagnosed gaps closed and its contract deliberately deepened. Presented as end states, not as a redesign:

1. **One `@platform/cognition-contract`, one copy.** Published to a private registry or resolved via a git-dependency workspace protocol; the byte-for-byte duplication (G-I5) is gone. Both repos depend on it as an external package, with CI drift-detection retired because drift becomes structurally impossible.
2. **`CognitionContext` has grown toward (not necessarily reached) the Spec's 11-section shape, one additive section at a time**, each shipped alongside the IntelligenceOS-side capability that produces it (per `INTELLIGENCE_PLATFORM_ARCHITECTURE.md` §8's own rule: judgment-producing half in IntelligenceOS, execution-consuming half in BrandOS, shipped as two changes even in the same release). `knowledge` and `positioning` are the two most likely next sections, since Knowledge Pipeline and Blueprint's audience/conflict-resolution machinery already produce data that maps to them almost directly.
3. **The two open contract gaps (G-I1, G-I2) are resolved**, not left open — a narrow reviewable-signals read operation and an explicit brand-voice-configuration ingestion path both exist, both additive to the five-operation `CognitionProvider`, neither becoming a sixth generation-time method.
4. **IntelligenceOS's internal domain-boundary violations (G-2) are fixed** — every pipeline writes through its owning domain, with `check:boundaries`-equivalent CI enforcement (IntelligenceOS's own G-8 recommendation) actually catching a regression if one is reintroduced.
5. **BrandOS's dormant identity-type system is either retired or re-wired** (§10.3, item 1) — no repository carries type-checked-against-nothing scaffolding two years from now.
6. **Both repositories' generated context artifacts are live and CI-verified**, including BrandOS's (currently stale, G-B1) system inventory and runtime model, and IntelligenceOS's not-yet-built `repository_context.generated.md` (referenced by its own `REPOSITORY_READ_ORDER.md` as "once it exists").
7. **`apps/api`'s translation layer between `IIntelligenceProvider` (rich, internal) and `CognitionProvider` (narrow, external) is an explicit, tested, named module** — resolving Gap G-I3 either by confirming it already exists and documenting it, or by building it deliberately as the one piece of genuinely new infrastructure this review's evidence suggests might actually be missing.
8. **Dead data (`identity_signals`, `identity_versions`, `brand_memory_entries`, G-B2) is gone** from BrandOS's live schema, either dropped or migrated once into IntelligenceOS as historical seed data.
9. **`RelationshipIntelligenceDomain`'s activation trigger is mechanically checked** (IntelligenceOS's own G-6), so Phase 2 audience-level personalization activates on its documented condition rather than requiring a manual flip.
10. **Both platforms' own boundary-enforcement scripts remain the mechanism of truth** — no new architectural layer is introduced to enforce anything the existing `check-boundaries.mjs` / `check:boundaries` scripts don't already enforce.

Nothing in this target list introduces a new package, a new domain, a new pipeline stage, or a new cross-repository operation beyond what's described above (a handful of additive `CognitionContext` sections and, possibly, one already-implied translation module). This is deliberate — the review's own instruction was to optimize for the architecture already latent in the repositories, not to invent one.

---

## 12. Migration Roadmap

Ordered by dependency and risk, not by package. Each phase is independently shippable and independently revertible.

### Phase 0 — Documentation truth (no code risk)
- **Purpose:** Stop the two repositories' own onboarding material from contradicting their running code.
- **Files affected:** BrandOS `.context/*.generated.md` (regenerate via existing `scripts/generate-*.mjs`); `scripts/shared/architecture-rules.mjs`'s RULE-1/2/3/6/7 descriptive text.
- **Risk:** None — these are non-executable artifacts; regeneration cannot break a build.
- **Expected outcome:** `system_inventory.generated.md` and `runtime_model.generated.md` describe `cognition-client`, not `brand-intelligence`.
- **Dependencies:** None — can start immediately.
- **Rollback:** Trivial (regenerate again, or revert the commit — no runtime effect either way).

### Phase 1 — Confirm and close the `apps/api` translation question (G-I3)
- **Purpose:** Establish ground truth on whether `IIntelligenceProvider` → `CognitionProvider` translation exists, before any contract-shape work builds on an assumption about it.
- **Files affected:** `apps/api/src/server.ts`, `apps/api/api/cognition.ts`, and whatever handler module they call into.
- **Risk:** Low if only confirming; the phase becomes higher-risk only if (b) from G-I3 is true and a real translation module must be built.
- **Expected outcome:** A named, documented answer — either "here's the existing mapping, now documented in `apps/api`'s own `AGENT_CONTEXT.md`" or "here's the new module, built and tested."
- **Dependencies:** None.
- **Rollback:** N/A for the confirmation step; if a module is built, standard revert.

### Phase 2 — IntelligenceOS internal boundary fix (G-2)
- **Purpose:** Route `HypothesisEngine`/`LearningValidator`/`ProfileBuilder`/`KnowledgeProcessor`'s direct writes through their owning domains' existing (already-built, currently-unused) methods.
- **Files affected:** the four listed pipeline files; `UserIntelligenceDomain` (add nothing new — methods already exist); `KnowledgeIntelligenceDomain` (add one new `persistExtracted()` method, name already anticipated in that file's own docblock).
- **Risk:** Low-medium — behavior-preserving by construction (same data, same tables, different call path), but touches four files' write paths, so needs the existing pipeline-integration test suite run before/after as the acceptance gate.
- **Expected outcome:** `domain_boundary_audit.generated.json`'s CI gate (once it exists, or manually) reports zero violations for the first time.
- **Dependencies:** None on Phase 0/1.
- **Rollback:** Standard revert; no schema change involved.

### Phase 3 — Close the two open contract gaps (G-I1, G-I2)
- **Purpose:** Give BrandOS's raw-signal review UI and explicit brand-voice configuration a real, contract-compliant home instead of a `501`/silent-drop.
- **Files affected:** `@platform/cognition-contract` (both copies — additive fields/operations only, no removal), `@brandos/cognition-client` (`HttpCognitionProvider` gains the new calls), `apps/api` (new route(s) implementing the new operation(s)), `@brandos/control-plane-layer`'s `brand-memory/service.ts` (replace the throwing `getBrandMemory()`), `apps/web`'s `/api/control-plane/brand-memory` route (remove the 501 branch once real).
- **Risk:** Medium — this is the one phase that's a genuine, reviewed contract change (`COGNITION_CONTRACT_SPEC.md` §5's evolution rules apply in full: additive only, versioned, backward-compatible).
- **Expected outcome:** `/workspace/brand`'s review UI has live data again; explicit brand-voice configuration reaches IntelligenceOS and can be corroborated/contradicted like any other signal.
- **Dependencies:** Should follow Phase 1 (confirms where the new route logic actually belongs).
- **Rollback:** Revert the additive contract fields (safe — nothing yet depends on them) and the new route(s); no data migration to unwind since these are new capabilities, not migrations of existing data.

### Phase 4 — Retire or re-wire BrandOS's dormant identity types
- **Purpose:** Resolve §10.3 item 1 — stop carrying a rich, unused identity type system that duplicates what IntelligenceOS's Learning taxonomy already does better.
- **Files affected:** `@brandos/contracts/identity-types.ts` (archive or trim), `iskill-runtime/personalization/context.ts` (re-point to `CognitionContext` if `SkillRuntime.execute()` has an activation plan; otherwise leave dormant but clearly marked, or delete alongside).
- **Risk:** Low if confirmed genuinely dead (type-only, no runtime data loss possible), **but requires a human decision first** — whoever owns the `iskill-runtime` gate-lift needs to confirm `SkillRuntime.execute()`'s roadmap before deletion, per this review's own instruction not to unilaterally decide product scope.
- **Expected outcome:** One identity type system in the platform, not two.
- **Dependencies:** None technical; one product/ownership decision.
- **Rollback:** If archived (not deleted), trivially reversible.

### Phase 5 — Dead data cleanup (G-B2)
- **Purpose:** Remove `identity_signals`, `identity_versions`, `brand_memory_entries` from BrandOS's live schema.
- **Files affected:** a new migration dropping the three tables (or an export step first, if historical data is worth preserving — see §9 recommendation to migrate once into IntelligenceOS as seed data).
- **Risk:** Medium — irreversible once dropped; requires the explicit "does this table still hold rows worth keeping" check this review flagged as a database query, not a source-code question.
- **Expected outcome:** BrandOS's schema contains no tables without a live owner.
- **Dependencies:** Should follow Phase 4 (confirms nothing new starts writing to these tables in the interim) and ideally overlaps with the historical-data export decision.
- **Rollback:** Restore from backup if dropped in error — standard DB migration rollback discipline, no application-code rollback needed.

### Phase 6 — Contract enrichment toward the Spec (G-I4)
- **Purpose:** Grow `CognitionContext` toward its documented 11-section target, one section at a time, each shipped with its producing capability.
- **Files affected:** `@platform/cognition-contract` (additive), whichever IntelligenceOS component produces each new section's data, `NarrativePlanner`/`StructurePlanner` if a new section needs assembly-time consumption on the BrandOS side.
- **Risk:** Low per-section (additive, versioned) — the ongoing risk is scope creep if multiple sections are attempted at once rather than one per release, which the Spec's own evolution rules already warn against.
- **Expected outcome:** `CognitionContext` genuinely matches its own canonical spec, incrementally, with no big-bang rewrite.
- **Dependencies:** Best sequenced after Phase 2 (IntelligenceOS's internal data model should be clean before it's the source for more contract fields) and Phase 3 (establishes the pattern for a reviewed, additive contract change).
- **Rollback:** Per-section revert, standard additive-field removal under the Spec's own deprecation rules (§5).

---

## 13. Risks

- **Phase 3 (contract gaps) is the only phase that's a true cross-repository, reviewed contract change** — both repos' `CognitionContext` copies must move together, and `COGNITION_CONTRACT_SPEC.md`'s own versioning/deprecation rules must be followed precisely, or the two repos silently drift (exactly the failure mode `cognition-contract/README.md` already warns about).
- **Phase 4 (retiring dormant identity types) is the one phase this review cannot fully resolve alone** — it hinges on a product/roadmap decision (does `SkillRuntime.execute()`'s full lifecycle have a real activation plan) that belongs to whoever owns that gate-lift, not to this architecture review.
- **Phase 5 (dropping dead tables) is irreversible** if not preceded by confirming whether those tables still hold meaningful historical data — treat the "is there anything in here worth keeping" question as a required gate, not a formality.
- **General risk across all phases:** both repositories demonstrate strong self-documentation discipline (`AGENT_CONTEXT.md`, bootstrap docs, ADRs, gap analyses) — the biggest risk to this migration succeeding is *not* updating that documentation in the same change set as each phase, which is exactly the failure mode that produced G-B1/G-I4 in the first place.

---

## 14. Architectural Decisions (ADR Recommendations)

Two ADRs already exist and should be treated as binding precedent for the recommendations above, not superseded:

- **ADR-001 (IntelligenceOS — Visual Intelligence Domain Status, Decided/Option B):** directly informs and is extended by this review's §10 conclusion. No new ADR needed to re-litigate this — this review's identity finding is a generalization of ADR-001's already-decided reasoning, not a departure from it.
- **ADR-002 (IntelligenceOS — `apps/` vs `packages/` split, Decided):** the current, correct model for where runtime/deployment concerns live; nothing in this review's recommendations requires revisiting it.

**New ADRs this review recommends drafting** (not drafted here, per the instruction not to implement/refactor):

- **ADR-003 (proposed) — Retirement of `@brandos/contracts/identity-types.ts`'s standalone identity model.** Should record the Phase 4 decision (§12) once made, including whether `iskill-runtime`'s full execute lifecycle is expected to activate, since that's the deciding factor.
- **ADR-004 (proposed) — `CognitionContext` gap closure sequencing.** Should record the order in which G-I1/G-I2/G-I4's additive sections are built, so "which section next" doesn't become an ad hoc per-PR decision on a contract both repos depend on.

---

## 15. Components That Should NOT Be Changed

Stated explicitly, since the review's constraints ask for this and several of these are easy to mistake for legacy cruft on a first read:

- **`@brandos/artifact-engine-layer`'s `engine.ts` and `registry.ts`** — explicitly marked hard no-touch zones requiring human approval; nothing in this review's findings implicates them.
- **`intelligence.signals` staying unpersisted / in-memory-only** — this is a documented, deliberate Sprint-2 scope decision (IntelligenceOS Bootstrap §7), not an oversight; do not "fix" it by adding a write path without a real load-bearing need.
- **`RelationshipIntelligenceDomain`'s inertness** — correctly gated behind an unmet activation trigger; the fix needed (G-6) is adding the *check*, not activating the domain preemptively.
- **The Quarantine Gate and corroboration thresholds in IntelligenceOS's Learning Pipeline** — explicitly, repeatedly stated as non-configurable, non-bypassable safety properties; no finding in this review suggests touching them.
- **`WorkspaceIntelligenceDomain`'s Phase-1-empty compliance set** — partial by design, not a bug; Phase 2 governance is real, scoped future work, not a current gap to rush.
- **`ContractAssembler`'s parallel-execution, graceful-degradation contributor model** — this is the mechanism that already correctly answers "can this accommodate new contributors" (§6); no change needed to the mechanism itself, only to which contributors are registered.
- **The `apps/*` vs `packages/*` split (ADR-002) and the six-domain model (Bootstrap §5, ADR-001)** — both are already the target architecture this review would otherwise recommend; changing either would be a regression, not an improvement.
