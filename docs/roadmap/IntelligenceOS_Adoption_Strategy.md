# IntelligenceOS Adoption Strategy for BrandOS
## Lead Architect Analysis — Sprint 3 Complete

> **Historical planning document.** Describes the pre-Epic-1 adoption strategy and semantic analysis. The architectural conclusions and taxonomy findings remain the authoritative background for design decisions made in Epic 1 (especially E1-4 and E1-5). For current implementation state, see `docs/IMPLEMENTATION_STATUS.md`. For current consumer-side integration tasks, see `docs/EPIC2_CONSUMER_ADOPTION_CHECKLIST.md`.

> **Generated:** 2026-06-25  
> **Authority:** Live source analysis of `brandos-full-20260625-104120.zip`, `intelligence-os-sprint3-final.zip`, `Intelligence_Ownership_Audit.docx`, and all provided architecture documents.  
> **Scope:** This document is an architect-level deliverable. Every recommendation is grounded in source code evidence. No claims are made from assumptions.

---

## 1. Executive Summary

BrandOS operates a production intelligence runtime (`@brandos/brand-intelligence`, L7) that accumulates workspace-scoped brand signals and resolves them into generation context. It is production-ready, stable, and integrated into every generation request via five CPL proxy functions. IntelligenceOS (Sprint 3 complete) is a user-level intelligence engine of substantially greater architectural depth: a 13-table schema, a 6-stage learning pipeline (Signal → Observation → Hypothesis → Learning → Profile), blueprint assembly, and a knowledge ingestion pipeline. The two systems are complementary, not competing.

**Key conclusions from source analysis:**

The BrandOS intelligence runtime is architecturally bounded and intentionally shallow. It was built to ship, not to scale indefinitely. The `brand_memory_entries`, `identity_signals`, and `identity_versions` tables carry no hypothesis gate, no taxonomy taxonomy, and no archetype model. IntelligenceOS supersedes every one of these mechanisms with a richer, validated equivalent.

IntelligenceOS has three gaps against BrandOS production requirements: (1) no human review API for flagged learnings, (2) no workspace-scoped brand voice layer (IOS is user-scoped; BrandOS BI is workspace-scoped), and (3) no `getBrandSummary()` for the workspace settings UI. These are contained gaps, not architectural mismatches.

The migration path is non-destructive and zero-downtime. The key architectural move is the introduction of `IIntelligenceProvider` as a BrandOS interface. CPL proxy functions already abstract the BI runtime from all routes. Swapping the implementation behind those proxies requires changes to approximately three files in BrandOS — not a refactor, a provider swap.

BrandOS development must not stop. IntelligenceOS will evolve on a parallel track. The five-milestone roadmap below is explicitly staged to eliminate any blocking dependency between teams.

---

## 2. BrandOS Intelligence Behavioral Analysis

### 2.1 Package Architecture

The BrandOS intelligence capability is distributed across four packages. This is the authoritative map from source:

**`@brandos/brand-intelligence` (L7) — Cognitive Identity Runtime**

This is the sole intelligence owner. Its public surface (from `src/index.ts`) exports 40+ symbols covering:

- `initBrandIntelligenceRuntime()` / `getGlobalBrandIntelligenceRuntime()` — singleton lifecycle
- `IBrandIntelligenceRuntime` — the runtime interface
- `BrandIntelligenceRuntime` — the V2 implementation (concrete class)
- `SupabaseBrandSignalRepository` — V2 repository (active); `InMemoryBrandSignalRepository` (test only)
- `BrandMemoryServiceV2` — V2 memory management
- `StyleProjectionResolver` / `TopicProfileResolver` — context projection
- `createDegradedCognitionContext()` — invariant fallback factory (never throws)
- `createBrandSignalRepository()` — CPL-safe factory (no concrete class import from CPL)
- Identity types: `ISemanticIdentity`, `IVisualIdentity`, `IdentitySnapshot`, dimension enums
- Signal types: `IdentitySignal`, `SignalType`, `ExtractionResult`, `MergeDecision`

Two methods were removed in Cleanup Sprint 2 and **must never be re-added**: `updatePersonaProfile()` and `resolvePersonaContribution()`.

**`@brandos/contracts` (L0) — Type Kernel**

Owns the intelligence contract interfaces. Relevant exports:
- `IBrandCognitionRuntime` — the core resolve/observe/getMemory/review interface
- `IBrandCognitionContext` — the resolution output (brandVoice, styleProjection, topicProfile)
- `IBrandCognitionRequest` — the resolution input (workspaceId, personaId, persona, brandContext)
- `IBrandMemorySignal` / `IBrandSignalRepository` — memory store contracts
- `IObservationEvent` — observation input type
- `SIGNAL_CLASSIFICATION` (A–E) + `DEFAULT_BRAND_MEMORY_CONFIG_V2` — classification config
- `BRAND_INTELLIGENCE_CAPABILITY_REGISTRY` — capability descriptor registry

**`@brandos/output-control-layer` (L4) — Prompt Assembly**

Consumes BI resolution. The 6-contributor `ContractAssemblerFactory` (registered per-request, not singleton) assembles:
- `IdentityContributor` — reads `IBrandCognitionContext` from BI, injects brand identity into `ResolvedGenerationContract`
- `PersonaContributor` — self-contained, reads persona row directly (no BI delegation, fixed in WS3)
- `IntentContributor`, `ArtifactContributor`, `RuntimeContributor`, `SkillContributor`

**`@brandos/control-plane-layer` (L8) — CPL Proxy Surface**

Five proxy functions that mediate all `apps/web` → BI access (no direct imports allowed from routes):

| Proxy Function | Target | Pattern |
|---|---|---|
| `resolveBrandCognitionContext(request)` | `runtime.resolve()` | Called in `CPLOrchestrator.orchestrate()`, Step 1 of every generation. Fallback: `createDegradedCognitionContext()`. |
| `recordBrandMemoryObservation(input)` | `runtime.recordArtifactObservation()` | Fire-and-forget post-generation. Never blocks response delivery. |
| `reviewBrandMemorySignal(wsId, entryId, approved, reviewedBy)` | `runtime.review()` | Human review workflow — pending_review → approved/rejected. |
| `getBrandMemory(workspaceId, classification?)` | `runtime.getMemory()` | Read brand memory for admin UI. |
| `getBrandSummary({ workspaceId, personaId? })` | `runtime.getBrandSummary()` | Aggregated brand state for workspace settings UI. |

### 2.2 Runtime Interface (`IBrandIntelligenceRuntime`)

Post Cleanup Sprint 2, the production interface is:

```typescript
interface IBrandIntelligenceRuntime extends IBrandCognitionRuntime {
  // Core resolution
  resolve(request: IBrandCognitionRequest): Promise<IBrandCognitionContext>
  getBrandSummary(params: { workspaceId: string; personaId?: string }): Promise<BrandSummary>

  // Signal learning
  recordArtifactObservation(request: IArtifactObservationRequest | IObservationEvent): Promise<void>
  getMemory(workspaceId: string, classification?: SignalClassification): Promise<IBrandMemorySignal[]>
  review(workspaceId: string, entryId: string, approved: boolean, reviewedBy: string): Promise<void>

  // Legacy resolution (backward compat overload — called internally)
  resolveBrandContext(campaignId: string, personaId?: string): Promise<BrandIntelligenceResolution>

  // V2 internal methods
  learn(params: { workspaceId, requestId, outputText, score, topic? }): Promise<IBrandMemorySignal[]>
  resolveIdentityContribution(params): Promise<IIdentityContribution | null>
}
// Removed (must not re-add): updatePersonaProfile(), resolvePersonaContribution()
```

### 2.3 Database Schema (BrandOS BI Tables)

Three tables, all in the public schema:

**`brand_memory_entries`** — V2 memory store (active; V1 retired)
- Scope: `workspace_id` (TEXT, not UUID FK — intentionally decoupled)
- Classification: `classification` (char A–E), driven by `BrandSignalClassifier`
- Status lifecycle: `pending_review` → `approved` / `rejected`
- Decay: `decay_rate` (numeric), `decayed_at`, `last_seen_at`
- Key indexes: `idx_bme_v2_workspace_class_status` (primary resolution path), `idx_bme_v2_last_seen_status` (decay), `idx_bme_v2_topic_hash` (topic diversity)

**`identity_signals`** — Fine-grained per-dimension signals
- Scope: `(workspace_id, persona_id, dimension, signal_type)`
- Strength: `weighted_confidence` (raw × frequency × recency weighting)
- No hypothesis gate — signals are recorded directly

**`identity_versions`** — Identity snapshot history
- Scope: `(workspace_id, persona_id, version)`
- `is_current` marks the live snapshot
- `snapshot` (JSONB) — opaque resolved identity object

### 2.4 Boot Sequence

From `apps/web/instrumentation.ts` (actual call order):

0. `primeRuntime()` — forces `AIRuntimeAdapter` onto `globalThis`
1. `bootstrapArtifactEngine()` — registers carousel/deck/report compilers + governance
2. `bootstrapGovernancePlugins()`
3. **`initBrandIntelligenceRuntime()`** — V2 BI runtime, `SupabaseBrandSignalRepository`
4. `bootstrapContractAssembler()` — registers 6 OCL contributors
5. `bootstrapSkillRuntime()`

The AI-runtime config provider bridge (`setRuntimeConfigProvider`) is **not wired at boot** — it is wired lazily on first `AdminSettingsService.load()` call.

### 2.5 Request Flow (Actual, from Runtime Trace)

For structured artifact routes (`/api/carousel`, `/api/generate`, `/api/generate-with-progress`):

```
apps/web route
  → const cpl = await runControlPlane(input, runtimeMode, supabase)  // Step 1
    → CPLOrchestrator.orchestrate()
         → resolveBrandCognitionContext()  [CPL proxy → BI runtime.resolve()]
         → ContractAssemblerFactory.create()  [6 contributors, fresh per-request]
         → compilePromptFromContract()
         → callWithMode()  [LLM]
  → const result = await executeArtifactPipeline(taskType, cpl.output, …)  // Step 2, separate top-level call
    → globalArtifactEngine.compileAndGovern()
         → OCL compile*Artifact()
         → governance.validate*Artifact()
         → repair loop (MAX_REPAIR_ATTEMPTS = 3)
  → recordBrandMemoryObservation()  [fire-and-forget]
```

**Critical runtime facts verified from source:**
- `executeArtifactPipeline()` is called from the route as a second top-level call, not nested inside `CPLOrchestrator.orchestrate()`
- `ContractAssemblerFactory` registers exactly 6 contributors (not 2 as older docs suggest)
- `MAX_REPAIR_ATTEMPTS = 3` (raised from 2, documented in source comment)
- `campaigns` writes happen directly from `apps/web` route handlers, bypassing `@brandos/auth` exported functions

### 2.6 Architectural Constraints (Active Rules)

| Rule | Constraint |
|---|---|
| `RULE-3` | CPL may only import specific symbols from `@brandos/brand-intelligence` (factory functions + interface types) |
| `RULE-6` | CPL must NOT import concrete BI repository classes (use `createBrandSignalRepository()` factory) |
| `RULE-7` | CPL must NOT import `BrandIntelligenceRuntime` concrete class as a value (use `createDegradedCognitionContext()`) |
| `RULE-OCL-GOVERNANCE-CONFIG` | OCL must NOT import from `@brandos/governance-config` |
| `RULE-5` | `@brandos/governance-layer` must NOT import from `@brandos/output-control-layer` |

### 2.7 Key Invariants

- **I-1:** `SupabaseBrandSignalRepository` (V2) is the active signal system. V1 fully retired.
- **I-2:** CPL imports only factory functions and interface types from BI (no concrete classes).
- **I-3:** `updatePersonaProfile()` is gone. Persona persistence belongs in `@brandos/auth`.
- **I-4:** `resolvePersonaContribution()` is gone. `PersonaContributor` in OCL owns persona assembly.
- **I-5:** `apps/web` does not import `@brandos/brand-intelligence` directly. All access goes through CPL proxy functions.
- **I-6:** Signal records are immutable once persisted. New observations create new records.
- **I-7:** `recordArtifactObservation()` is fire-and-forget. Failures are caught and logged; never surface to user.
- **I-8:** `createDegradedCognitionContext()` must always succeed. Never throws.

---

## 3. IntelligenceOS Compatibility Analysis

### 3.1 Capability Matrix

| BrandOS Capability | BrandOS Implementation | IOS Status | IOS Implementation | Assessment |
|---|---|---|---|---|
| Brand signal learning (write) | `BrandMemoryServiceV2` + `SupabaseBrandSignalRepository` → `brand_memory_entries` | **Better implementation exists** | `FeedbackProcessor` → `SignalExtractor` → `ObservationBuilder` → `HypothesisEngine` → `LearningValidator` → `intelligence.learnings` | IOS pipeline adds quarantine, hypothesis corroboration, stability classification, and 25-category taxonomy before creating a learning. BrandOS writes with A–E classification only. |
| Brand context resolution (read) | `BrandIntelligenceRuntime.resolve()` → `IBrandCognitionContext` | **Better implementation exists** | `BlueprintBuilder.build()` → `ArtifactBlueprint` | IOS returns a fully assembled blueprint (structure + voice + audience + project context + compliance). BrandOS returns a coarse `IBrandCognitionContext` that OCL then re-assembles. |
| Style projection | `StyleProjectionResolver` — maps A/B entries to style directives | **Better implementation exists** | `NarrativePlanner` — assembles `VoiceDirectives` from profile, archetype, audience register with authority ordering | IOS voice derives from a structured learned profile. BrandOS is heuristic classification. |
| Topic profile | `TopicProfileResolver` — aggregates topic themes | **Better implementation exists** | `StructurePlanner` — 3-level `ArtifactPattern` inheritance (universal → archetype → user-calibrated) | IOS distinguishes structure from voice and uses a validated pattern hierarchy. |
| Signal recording (post-generation) | `recordArtifactObservation()` | **Equivalent** | `recordFeedbackEvent()` | Different pipeline depth; semantically equivalent entry point. |
| Signal review (human-in-the-loop) | `IBrandIntelligenceRuntime.review()` — working production workflow | **Missing** | FLAGGED state exists in schema but no review API in `IntelligenceOS.ts` | Critical gap. Must add `reviewLearning()` before migration. |
| Brand summary (UI) | `getBrandSummary()` | **Missing** | No equivalent method on `IntelligenceOS` | Medium gap. Must add `getBrandSummary()` before migration. |
| Identity versioning | `identity_versions` table | **Better implementation exists** | `intelligence.profiles` — versioned, composite confidence, archetype + voice + goal + constraint + preference + expertise summaries | IOS profiles are structured; BrandOS identity_versions carry opaque JSONB. |
| Degraded fallback | `createDegradedCognitionContext()` — invariant, never throws | **Equivalent** | `BlueprintBuilder` catches per-domain failures with `Promise.all(…catch(→null))`. Always returns blueprint. | Both guarantee generation is never blocked. |
| Archetype classification | **Not in BrandOS** | **Only in IOS** | `intelligence.archetypes` — 16 archetype types, confidence, `is_primary`. Drives `StructurePlanner` defaults and `NarrativePlanner` voice tendencies. | Net new capability. |
| Knowledge asset ingestion | `brand_assets` (binary uploads + VLM analysis only) | **Better implementation exists** | `KnowledgeProcessor` → `KnowledgeAssetExtractor` → `VocabularyExtractor` → `FrameworkExtractor` → `PatternExtractor` → `KnowledgeValidator` | IOS has complete semantic extraction (vocabulary, frameworks, patterns). BrandOS has VLM image analysis only. |
| Relationship intelligence | **Not in BrandOS** | **Only in IOS** | `intelligence.relationships` + `intelligence.audience_profiles` + `AudienceCalibrator` | Net new capability for named audience calibration. |
| Project intelligence | `campaigns` table (generation event, not project) | **Better implementation exists** | `intelligence.projects` — goals, constraints, vocabulary model, stakeholders, lifecycle state. `ProjectContextBuilder` uses these for blueprint context. | BrandOS campaigns ≠ strategic projects. IOS projects span multiple generations. |
| Workspace-scoped brand voice | `brand_memory_entries.workspace_id` — workspace is primary scope | **Partial** | IOS learnings are user-scoped. Workspace is advisory. No workspace-level learning records. | High priority gap. Must be addressed before multi-user workspace parity. |
| Persona-scoped signals | `identity_signals` scoped to `(workspace_id, persona_id)` | **Missing / by design** | IOS is user-scoped. Phase 1 is single-user-workspace per Architecture J.2. | Explicit design decision required: persona = profile variant or separate scope? |
| VLM brand asset analysis | `brand_assets.vlm_analysis` | **Keep in BrandOS** | IOS text-only extraction pipeline | VLM execution is an AI runtime concern. Keep in BrandOS; emit event to IOS for visual intelligence signals. |

### 3.2 Gap Summary

**Critical (blocks migration):**
1. Human review API (`reviewLearning()`) — production workflow with no IOS equivalent
2. Workspace-scoped brand voice — BrandOS BI is workspace-scoped; IOS is user-scoped

**High (must close before Milestone 3 shadow mode):**
3. `getBrandSummary()` — workspace settings UI depends on this
4. Persona-scoped signal isolation — multi-persona workspace design decision required

**Medium (can be addressed in parallel or post-migration):**
5. VLM visual brand asset signals — emit event bridge; keep VLM in BrandOS
6. A–E classification backward compatibility — computable on read during transition

---

## 4. IntelligenceOS Upgrade Plan

### 4.1 Gap 1 — Human Learning Review API

**Evidence:** `IBrandIntelligenceRuntime.review()` is a production API. The admin UI calls it via `reviewBrandMemorySignal()` CPL proxy. The IOS `Learning` entity has a `FLAGGED` state defined in schema and TypeScript types, but `IntelligenceOS.ts` exposes no review method.

**Required change — new public method on `IntelligenceOS`:**

```typescript
// packages/intelligence-os/src/IntelligenceOS.ts (addition)
async reviewLearning(
  userId: string,
  learningId: string,
  approved: boolean,
  reviewedBy: string
): Promise<void> {
  // APPROVED: FLAGGED → ACTIVE
  // REJECTED: FLAGGED → ARCHIVED
  await this.domains.user.reviewLearning(userId, learningId, approved, reviewedBy);
  await this.bus.emit('intelligence.learning.reviewed', {
    userId, learningId, approved, reviewedBy,
    occurredAt: new Date().toISOString(),
  });
}
```

**Required DB change:** No schema change. `intelligence.learnings.state` already supports `FLAGGED` and `ACTIVE`/`ARCHIVED` transitions.

**Required domain change:** Add `reviewLearning()` to `UserIntelligenceDomain`:

```typescript
// packages/intelligence-os/src/domains/UserIntelligenceDomain.ts
async reviewLearning(
  userId: string,
  learningId: string,
  approved: boolean,
  reviewedBy: string
): Promise<void> {
  const newState = approved ? 'ACTIVE' : 'ARCHIVED';
  const { error } = await this.db
    .schema('intelligence')
    .from('learnings')
    .update({ state: newState, updated_at: new Date().toISOString() })
    .eq('id', learningId)
    .eq('user_id', userId);
  if (error) throw new DatabaseError(`reviewLearning failed: ${error.message}`, error);
}
```

**Sprint assignment:** Milestone 3 (required before shadow mode validation).

### 4.2 Gap 2 — Workspace-Scoped Brand Voice

**Evidence:** `brand_memory_entries.workspace_id` is the primary scope. All five CPL proxy functions receive `workspaceId`, not `userId`. In IOS, `intelligence.learnings.workspace_id` is a nullable column with no FK and no index on workspace-only queries.

**Required design decision (architect must decide before implementation):**

Option A — Add workspace as a first-class scope in `intelligence.learnings`. Introduce `WorkspaceIntelligenceDomain.getWorkspaceLearnings(workspaceId)`. BlueprintBuilder assembles a workspace brand voice layer above the user voice layer.

Option B — Model workspace brand voice as a special user profile where `userId = workspaceOwnerId` and `context_scope = 'workspace'`. Simpler, but loses multi-user workspace semantics.

**Recommendation:** Option A, implemented incrementally. For Milestone 2 (dual-write), write workspace-scoped learnings using a special `userId = '_workspace_<workspaceId>'` sentinel that resolves to the workspace identity. This defers the domain refactor while seeding workspace-level data. Milestone 3 formalizes it as a proper workspace scope.

**Required DB change:**
```sql
-- Add composite index for workspace-scoped learning queries
CREATE INDEX intelligence_learnings_workspace_domain
  ON intelligence.learnings(workspace_id, domain, state)
  WHERE workspace_id IS NOT NULL;
```

**Sprint assignment:** Milestone 2 (sentinel approach); Milestone 3 (formalized domain method).

### 4.3 Gap 3 — Brand Summary API

**Evidence:** `IBrandIntelligenceRuntime.getBrandSummary({ workspaceId, personaId? })` returns a structured summary used by the workspace settings page at `/workspace/settings/ai/page.tsx`. No equivalent on `IntelligenceOS`.

**Required change — new public method:**

```typescript
// packages/intelligence-os/src/IntelligenceOS.ts (addition)
async getBrandSummary(params: {
  userId: string;
  workspaceId?: string;
}): Promise<IntelligenceSummary> {
  const profile = await this.domains.user.getCurrentProfile(params.userId).catch(() => null);
  const archetype = await this.domains.user.getCurrentArchetype(params.userId).catch(() => null);
  return {
    compositeConfidence: profile?.compositeConfidence ?? 0,
    archetypePrimary: archetype?.archetypeType ?? null,
    archetypeConfidence: archetype?.confidence ?? null,
    activeLearningsCount: 0, // populated by UserIntelligenceDomain.countActiveLearnings()
    topTaxonomyCategories: [],
    voiceSummary: profile?.voiceSummary ?? null,
    degraded: profile === null,
  };
}
```

**Sprint assignment:** Milestone 3.

### 4.4 Gap 4 — Persona-Scoped Signal Isolation

**Evidence:** `identity_signals` is keyed by `(workspace_id, persona_id, dimension, signal_type)`. BrandOS supports multiple personas per workspace (`personas` table, `is_default` flag). IOS has no persona concept.

**Recommendation:** For Phase 1 (single-user-workspace), treat the default persona as the user's primary voice. No IOS change required. For Phase 2 (multi-persona workspaces), add `personaId` as an optional field to `ArtifactRequest` and map it to a `context_scope = 'audience'` learning in IOS. This is explicitly deferred per Architecture J.2.

**Sprint assignment:** Milestone 4+ (post-primary cutover). Not a blocking gap for Milestone 2/3.

### 4.5 Gap 5 — VLM Visual Intelligence Bridge

**Evidence:** `brand_assets.vlm_analysis` (JSONB) stores visual language model analysis of uploaded images. This feeds brand visual identity (colors, fonts, layout density). IOS knowledge pipeline is text-only.

**Recommendation:** Keep VLM execution in BrandOS (it requires the AI runtime). After VLM analysis completes, emit a `brandos.brand_asset.analyzed` event that IOS subscribes to. IOS `KnowledgeProcessor` registers a handler that creates a `knowledge_intelligence` domain learning from the VLM output.

**Required IOS change:**
```typescript
// Register handler in KnowledgeProcessor
this.bus.on('brandos.brand_asset.analyzed', async (payload) => {
  await this.ingestVisualIntelligenceSignal(payload);
});
```

**Required event type addition to `events.ts`:**
```typescript
| 'brandos.brand_asset.analyzed'  // BrandOS → IOS visual intelligence
```

**Sprint assignment:** Milestone 3–4 (after primary IOS capabilities are validated).

---

## 5. Compatibility Interface Design

### 5.1 Recommended Approach: Adapter Pattern (not direct interface implementation)

**Analysis:** The BrandOS CPL proxy surface and IntelligenceOS public API do not have identical method signatures. BrandOS `resolve()` receives `workspaceId`; IOS `buildBlueprint()` receives `userId + workspaceId + artifactType + audienceRef`. A direct implementation of `IBrandIntelligenceRuntime` by IntelligenceOS would require IOS to know BrandOS type shapes — violating `RULE-IOS-ISOLATION`.

**Recommended approach:** Introduce `IIntelligenceProvider` as a zero-coupling interface in `@brandos/contracts` (L0). IntelligenceOS implements it. BrandOS CPL calls it. The interface is designed around BrandOS's needs, not IOS's internal structure.

### 5.2 `IIntelligenceProvider` Interface

Location: `packages/contracts/src/intelligence-provider.ts`

```typescript
// @brandos/contracts — packages/contracts/src/intelligence-provider.ts

import type { IntelligenceEventBus } from './intelligence-event-types';

export interface IIntelligenceProvider {
  // ── Generation pipeline (called before every generation) ─────────────────
  buildBlueprint(request: IntelligenceBlueprintRequest): Promise<ArtifactBlueprintResult>;

  // ── Post-generation (fire-and-forget) ─────────────────────────────────────
  recordFeedbackEvent(event: IntelligenceFeedbackEvent): Promise<void>;

  // ── Knowledge ingestion ───────────────────────────────────────────────────
  ingestKnowledgeAsset(asset: IntelligenceKnowledgeAssetInput, rawContent?: string): Promise<string>;

  // ── Project sync ──────────────────────────────────────────────────────────
  upsertProject(input: IntelligenceProjectInput): Promise<string>;

  // ── Human review workflow ─────────────────────────────────────────────────
  reviewLearning(
    userId: string,
    learningId: string,
    approved: boolean,
    reviewedBy: string
  ): Promise<void>;

  // ── Brand memory read (UI) ────────────────────────────────────────────────
  getBrandSummary(params: {
    userId: string;
    workspaceId?: string;
  }): Promise<IntelligenceSummary>;

  // ── Observable pipeline events ─────────────────────────────────────────────
  readonly eventBus: IntelligenceEventBus;
}

export interface IntelligenceBlueprintRequest {
  userId: string;
  workspaceId: string;
  projectId?: string | null;
  artifactType: string;
  audienceRef?: string | null;
  personaId?: string | null;
}

export interface ArtifactBlueprintResult {
  blueprintId: string;
  // Structured decisions for OCL IdentityContributor:
  voiceDirectives: {
    register: string | null;
    tone: string[];
    avoidPatterns: string[];
  };
  structurePlan: {
    sections: Array<{ id: string; heading: string; depth: number }>;
  };
  narrativeFrame: {
    openingStrategy: string | null;
    closingStrategy: string | null;
  };
  vocabularyDirectives: {
    preferred: string[];
    forbidden: string[];
  };
  audienceCalibration: {
    expertiseLevel: string;
    communicationNorms: Record<string, unknown>;
  };
  projectContext: Record<string, unknown> | null;
  complianceRequirements: Array<{ rule: string; severity: string }>;
  confidenceScore: number;   // 0–1
  degraded: boolean;         // true = built with partial/no intelligence
  builtAt: string;           // ISO 8601
}

export interface IntelligenceSummary {
  compositeConfidence: number;
  archetypePrimary: string | null;
  archetypeConfidence: number | null;
  activeLearningsCount: number;
  topTaxonomyCategories: string[];
  voiceSummary: Record<string, unknown> | null;
  degraded: boolean;
}
```

### 5.3 `BrandOSLegacyIntelligenceProvider` (Milestone 1 wrapper)

This class wraps the current `IBrandIntelligenceRuntime` and implements `IIntelligenceProvider`. It is the zero-risk adapter that makes the interface introduction a no-op in production:

```typescript
// packages/control-plane-layer/src/intelligence/BrandOSLegacyIntelligenceProvider.ts
export class BrandOSLegacyIntelligenceProvider implements IIntelligenceProvider {
  constructor(private readonly runtime: IBrandIntelligenceRuntime) {}

  async buildBlueprint(request: IntelligenceBlueprintRequest): Promise<ArtifactBlueprintResult> {
    // Calls existing resolveBrandCognitionContext() path internally
    const context = await this.runtime.resolve({
      workspaceId: request.workspaceId,
      personaId: request.personaId ?? undefined,
    });
    // Translate IBrandCognitionContext → ArtifactBlueprintResult
    return translateContextToBlueprint(context, request);
  }

  async recordFeedbackEvent(event: IntelligenceFeedbackEvent): Promise<void> {
    await this.runtime.recordArtifactObservation(event);
  }

  async reviewLearning(
    userId: string, learningId: string, approved: boolean, reviewedBy: string
  ): Promise<void> {
    // learningId in legacy = entryId in brand_memory_entries
    // workspaceId must be resolved from userId for legacy compat
    await this.runtime.review(userId, learningId, approved, reviewedBy);
  }

  async getBrandSummary(params: { userId: string; workspaceId?: string }): Promise<IntelligenceSummary> {
    const summary = await this.runtime.getBrandSummary({
      workspaceId: params.workspaceId ?? params.userId,
    });
    return translateSummary(summary);
  }

  // ingestKnowledgeAsset() and upsertProject() are no-ops in legacy provider
  async ingestKnowledgeAsset(): Promise<string> { return ''; }
  async upsertProject(): Promise<string> { return ''; }

  get eventBus(): IntelligenceEventBus { return noopEventBus; }
}
```

### 5.4 CPL Integration (the only file that changes)

`CPLOrchestrator` currently calls `resolveBrandCognitionContext()`. After Milestone 1, it calls `this.intelligenceProvider.buildBlueprint()`:

```typescript
// packages/control-plane-layer/src/orchestrator.ts

// Milestone 1: No behavior change. BrandOSLegacyIntelligenceProvider produces same output.
// Milestone 4: IntelligenceOSProvider produces ArtifactBlueprint from IOS.

const blueprint = await this.intelligenceProvider.buildBlueprint({
  userId: request.userId,
  workspaceId: request.workspaceId,
  projectId: request.projectId,
  artifactType: request.taskType,
  audienceRef: request.audienceRef,
});
// Pass blueprint to ContractAssemblerFactory
```

### 5.5 `IdentityContributor` Adaptation

The OCL `IdentityContributor` currently reads `IBrandCognitionContext`. It must be updated to read `ArtifactBlueprintResult`. The prompt assembly logic is preserved; only the input type changes.

**Before:**
```typescript
// IdentityContributor — reads IBrandCognitionContext
const tone = context.identity.semanticIdentity.voiceAttributes.tone;
const styleDirectives = context.styleDirectives;
```

**After:**
```typescript
// IdentityContributor — reads ArtifactBlueprintResult
const tone = blueprint.voiceDirectives.tone;
const avoidPatterns = blueprint.voiceDirectives.avoidPatterns;
const vocabularyPreferred = blueprint.vocabularyDirectives.preferred;
```

During the transition (Milestones 1–3), `IdentityContributor` accepts a union type. The union is collapsed at Milestone 4.

---

## 6. Minimal BrandOS Integration Plan

The guiding principle: **BrandOS changes only the provider implementation behind existing proxy functions. No routes change. No governance changes. No artifact pipeline changes.**

### 6.1 Files to Modify in BrandOS

**Milestone 1 (Interface Extraction):**

| File | Change | Risk |
|---|---|---|
| `packages/contracts/src/index.ts` | Export `IIntelligenceProvider`, `ArtifactBlueprintResult`, `IntelligenceBlueprintRequest`, `IntelligenceSummary` | Zero — additive only |
| `packages/control-plane-layer/src/intelligence/BrandOSLegacyIntelligenceProvider.ts` | Create new file. Wraps existing BI runtime. | Zero — new file |
| `packages/control-plane-layer/src/orchestrator.ts` | Wire `IIntelligenceProvider`. Replace `resolveBrandCognitionContext()` call with `intelligenceProvider.buildBlueprint()`. | Low — same runtime behavior behind interface |
| `packages/output-control-layer/src/contributors/IdentityContributor.ts` | Accept `ArtifactBlueprintResult | IBrandCognitionContext` union. Map both to same output. | Low — additive union type |

**Milestone 2 (IOS Wired, Flag OFF):**

| File | Change | Risk |
|---|---|---|
| `packages/control-plane-layer/src/intelligence/IntelligenceOSProvider.ts` | Create new file. Implements `IIntelligenceProvider` by calling `IntelligenceOS`. | Low — new file, flag-gated |
| `packages/control-plane-layer/src/orchestrator.ts` | Add feature flag check: `workspaceSettings.intelligence_provider === 'ios'` selects `IntelligenceOSProvider`. | Low — flag defaults to 'legacy' |
| Database | Add `intelligence_provider TEXT DEFAULT 'legacy'` to `workspace_settings`. | DB migration, low risk |

**Milestone 4 (IOS Primary):**

| File | Change | Risk |
|---|---|---|
| `packages/output-control-layer/src/contributors/IdentityContributor.ts` | Remove union type; accept `ArtifactBlueprintResult` only. | Medium — requires all workspaces on IOS |
| `packages/control-plane-layer/src/orchestrator.ts` | Remove legacy provider path. | Medium — requires IOS parity confirmed |

### 6.2 Interfaces to Preserve (must not change)

- `IBrandCognitionContext` — preserved until Milestone 4 (legacy provider still produces it)
- All five CPL proxy function signatures — unchanged throughout (internal implementation only changes)
- All `apps/web` API route handlers — zero changes at any milestone
- `IBrandIntelligenceRuntime` — preserved until Milestone 5 (legacy provider wraps it)

### 6.3 Consumers That Remain Unchanged

All `apps/web` route handlers remain completely unchanged. They call `runControlPlane()` and `executeArtifactPipeline()` exactly as today. The intelligence provider swap is entirely invisible to routes.

The governance layer (`@brandos/governance-layer`), artifact engine (`@brandos/artifact-engine-layer`), OCL compilers, skill runtime, and AI runtime layer are all unchanged. The blueprint is consumed by `IdentityContributor` inside OCL; no other package touches it.

### 6.4 Consumers Requiring Updates

- `IdentityContributor` in `@brandos/output-control-layer` — input type adaptation (union → blueprint-only at Milestone 4)
- Admin UI for brand memory review — endpoint changes from `reviewBrandMemorySignal()` to `reviewLearning()` call via updated CPL proxy

---

## 7. Parallel Development Strategy

### 7.1 Principle: Interface-First Independence

The `IIntelligenceProvider` interface in `@brandos/contracts` is the bilateral contract. Once defined, both teams develop independently against it:
- BrandOS team: `BrandOSLegacyIntelligenceProvider` implements it now; `IntelligenceOSProvider` wires it later
- IntelligenceOS team: `IntelligenceOS` implements it when gaps are closed

Neither team can block the other after Milestone 1's interface extraction.

### 7.2 Versioning

IntelligenceOS (`packages/intelligence-os`) versions independently. BrandOS CPL pins a specific IOS version. IOS semver strategy:
- Patch: internal pipeline improvements, bug fixes
- Minor: new capabilities added to `IntelligenceOS` (new domain methods, new event types)
- Major: breaking change to `IIntelligenceProvider` interface (requires BrandOS coordination)

The `IIntelligenceProvider` interface itself should be versioned separately in `@brandos/contracts`. Changes to it are coordination events, not independent releases.

### 7.3 Testing Independence

BrandOS CI tests continue to run against `BrandOSLegacyIntelligenceProvider`. Zero dependency on IOS in BrandOS CI until Milestone 2 introduces `IntelligenceOSProvider`.

IOS runs its own Vitest suite against a Supabase test project with the `intelligence` schema. Tests reference no `@brandos/*` packages except `@brandos/shared-intelligence-types`.

Shadow mode (Milestone 3) introduces an integration test suite that runs both providers and compares outputs. This suite lives in BrandOS but calls IOS via `IIntelligenceProvider` only.

### 7.4 Dual-Write Pattern (Milestone 2)

To seed IOS intelligence data before cutover, Milestone 2 introduces dual-write:

```typescript
// packages/control-plane-layer/src/orchestrator.ts — Milestone 2 dual-write

// Always use legacy provider for actual generation output
const blueprint = await this.legacyProvider.buildBlueprint(request);

// Fire-and-forget to IOS for data seeding (even if flag='legacy')
if (this.iosProvider && request.userId) {
  this.iosProvider.recordFeedbackEvent(event).catch(err =>
    this.logger.warn('IOS dual-write failed (non-blocking)', err)
  );
}
```

IOS failures during dual-write must never propagate to BrandOS responses.

### 7.5 Feature Flag Design

The feature flag is workspace-granular, stored in `workspace_settings`:

```sql
-- Migration: add intelligence_provider column
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS intelligence_provider TEXT
  DEFAULT 'legacy'
  CHECK (intelligence_provider IN ('legacy', 'shadow', 'ios'));
```

Flag values:
- `legacy` — `BrandOSLegacyIntelligenceProvider` active; IOS dual-write only
- `shadow` — both providers called; legacy output used; IOS output logged for comparison
- `ios` — `IntelligenceOSProvider` active; legacy retained for instant rollback

Rollback is always a single database update per workspace. No code deploys required to revert.

---

## 8. Future Package Architecture

### 8.1 Target Monorepo Structure

```
packages/
  contracts/                        ← L0 — extends to include IIntelligenceProvider
  shared-intelligence-types/        ← L0 — new: ArtifactBlueprint, FeedbackEvent, ArtifactRequest (IOS-facing types)
  shared-utils/                     ← L1 — unchanged
  auth/                             ← L2 — unchanged
  runtime-config/                   ← L3 — unchanged
  governance-config/                ← L3 — unchanged
  artifact-config/                  ← L3 — unchanged
  ui-admin/                         ← L3 — unchanged
  intelligence-os/                  ← L3.5 — NEW: IntelligenceOS canonical intelligence provider
  ai-runtime-layer/                 ← L4 — unchanged
  output-control-layer/             ← L4 — IdentityContributor adapted to ArtifactBlueprintResult
  governance-layer/                 ← L5 — unchanged
  iskill-runtime/                   ← L5 — unchanged
  artifact-engine-layer/            ← L6 — unchanged
  brand-intelligence/               ← L7 — RETIRED at Milestone 5
  control-plane-layer/              ← L8 — CPL calls IIntelligenceProvider (adapted)
  presentation-layer/               ← L9 — unchanged
apps/
  web/                              ← L10 — unchanged
```

**Layer 3.5 justification:** IntelligenceOS sits below CPL (L8), which is its only caller. It sits above L3 config packages because it has no config dependency — it depends only on `@supabase/supabase-js` and `@brandos/shared-intelligence-types` (L0). L3.5 is accurate for its position in the dependency graph.

### 8.2 Dependency Rules for `@brandos/intelligence-os`

New boundary rules to add to `check-boundaries.mjs`:

| Rule ID | Constraint |
|---|---|
| `RULE-IOS-ISOLATION` | `@brandos/intelligence-os` must NOT import from any `@brandos/*` implementation package. Allowed imports: `@supabase/supabase-js`, `@brandos/shared-intelligence-types`. |
| `RULE-SIT-ISOLATION` | `@brandos/shared-intelligence-types` must NOT import from any `@brandos/*` package. Zero-dependency type package. |
| `RULE-IOS-CPL-ONLY` | `apps/web` routes must NOT import `@brandos/intelligence-os` directly. Add to `FORBIDDEN_IN_ROUTES`. |
| `RULE-IOS-OCL-NONE` | `@brandos/output-control-layer` must NOT import `@brandos/intelligence-os`. OCL receives `ArtifactBlueprintResult` via `ResolvedGenerationContract` from CPL. |
| `RULE-BLUEPRINT-CONTRACT` | After Milestone 4: `IdentityContributor` must read from `ArtifactBlueprintResult`, not `IBrandCognitionContext`. Enforced via TypeScript type system. |

### 8.3 Extraction to Independent Repository

The architecture is structured for future extraction. The preconditions are automatically satisfied by `RULE-IOS-ISOLATION`:

1. IOS imports zero `@brandos/*` implementation packages ✓ (enforced by RULE-IOS-ISOLATION)
2. `@brandos/shared-intelligence-types` is a standalone package ✓
3. `IIntelligenceProvider` interface migrates from `@brandos/contracts` to `@brandos/shared-intelligence-types` — this is the only contract change required

Extraction steps:
1. Copy `packages/intelligence-os/` to `intelligence-os-repo`. All tests pass in isolation.
2. Publish as `@intelligence-os/core` (or retain `@brandos/intelligence-os` as a private npm package).
3. In BrandOS: replace workspace reference with npm dependency. Or: replace instantiation with an HTTP adapter implementing `IIntelligenceProvider`.
4. If HTTP: establish latency budget. Target `<50ms P95` for `buildBlueprint()`. Introduce blueprint caching keyed by `(userId, artifactType, workspaceId)` with short TTL if exceeded.

---

## 9. Migration Readiness Checklist

IntelligenceOS must satisfy all items in each milestone group before the corresponding milestone may proceed.

### Milestone 1 Prerequisites (Interface Extraction)
- [ ] `IIntelligenceProvider` interface defined in `@brandos/contracts`
- [ ] `ArtifactBlueprintResult`, `IntelligenceBlueprintRequest`, `IntelligenceSummary` types defined in `@brandos/shared-intelligence-types`
- [ ] `BrandOSLegacyIntelligenceProvider` created and wired as active provider
- [ ] `IdentityContributor` accepts `ArtifactBlueprintResult | IBrandCognitionContext` union
- [ ] All existing BrandOS tests pass without behavior change
- [ ] `RULE-IOS-ISOLATION` and `RULE-SIT-ISOLATION` added to `check-boundaries.mjs`

### Milestone 2 Prerequisites (IOS Wired, Flag OFF)
- [ ] `packages/intelligence-os/` added to BrandOS monorepo at L3.5
- [ ] `IntelligenceOS` implements `IIntelligenceProvider` (at least `buildBlueprint()` and `recordFeedbackEvent()`)
- [ ] Workspace-level `intelligence_provider` flag in `workspace_settings` (default `'legacy'`)
- [ ] IOS integration tests pass in CI against test Supabase project
- [ ] Dual-write (`recordFeedbackEvent()`) active and verified non-blocking on IOS failure
- [ ] `RULE-IOS-ISOLATION` enforced and zero violations in CI

### Milestone 3 Prerequisites (Shadow Mode)
- [ ] `reviewLearning()` added to `IntelligenceOS` public API (**Gap 1**)
- [ ] `getBrandSummary()` added to `IntelligenceOS` public API (**Gap 3**)
- [ ] Workspace-scoped brand voice design decision made and initial implementation in place (**Gap 2**)
- [ ] Shadow mode wired in CPL: both providers called, outputs compared, telemetry logged
- [ ] IOS blueprint governance parity ≥ 95% on internal workspaces over 2-week shadow run
- [ ] IOS `buildBlueprint()` P95 latency `<200ms` (budget for non-critical path acceptance)

### Milestone 4 Prerequisites (IOS Primary)
- [ ] All Milestone 3 criteria satisfied
- [ ] IOS parity exit criterion met for internal workspaces (see Milestone 3)
- [ ] Progressive rollout plan defined (10% → 25% → 50% → 100%)
- [ ] Rollback procedure tested (workspace flag → `'legacy'` restores behavior)
- [ ] `IdentityContributor` updated to accept `ArtifactBlueprintResult` exclusively
- [ ] Monitoring dashboards active: governance score distribution, CPL latency, error rate by provider
- [ ] IOS `buildBlueprint()` error rate `<0.1%` over 7-day internal rollout period

### Milestone 5 Prerequisites (BrandOS BI Retirement)
- [ ] All production workspaces on `intelligence_provider = 'ios'` for minimum 4 weeks
- [ ] Zero rollbacks to `'legacy'` for 2 consecutive weeks
- [ ] Data migration plan executed: `brand_memory_entries` + `identity_signals` → `intelligence.learnings` for legacy-only workspaces
- [ ] `brand_memory_entries`, `identity_signals`, `identity_versions` tables dropped
- [ ] `@brandos/brand-intelligence` package removed from monorepo
- [ ] RULE-3, RULE-6, RULE-7 removed from `check-boundaries.mjs` (CPL BI-specific rules)
- [ ] `ContractAssemblerFactory` `IdentityContributor` → `IBrandCognitionContext` path removed
- [ ] Full regression test suite passes on IOS-only configuration

---

## 10. Risks and Recommendations

### Risk 1 — Latency Regression in Critical Path (HIGH)

`buildBlueprint()` is a new DB round-trip in the critical path before every generation. The current `resolveBrandCognitionContext()` already makes a DB call, but the IOS blueprint build involves parallel calls across 4–5 domain stores.

**Mitigation:** Establish latency budget before Milestone 3. Target `<200ms P95` for shadow mode; tighten to `<100ms P95` for Milestone 4. If exceeded, introduce blueprint caching keyed by `(userId, artifactType, workspaceId)` with a 5-minute TTL. The `IntelligenceOS` degraded path (all domain calls catch-to-null) ensures a response is always returned.

### Risk 2 — Workspace vs. User Scope Mismatch (HIGH)

BrandOS BI is workspace-scoped. IOS is user-scoped. If this gap is not resolved before Milestone 4, multi-user workspace brand voice will regress.

**Mitigation:** This is explicitly Milestone 2's secondary objective. The sentinel approach (`userId = '_workspace_<workspaceId>'`) is a low-risk bridge. Do not advance to Milestone 4 until workspace-scoped learnings are validated in shadow mode.

### Risk 3 — Dual-Write Failure Masking (MEDIUM)

If IOS dual-write fails silently during Milestone 2, workspaces advanced to IOS primary in Milestone 4 will have thin intelligence data.

**Mitigation:** Log all IOS dual-write failures with workspace ID and timestamp. Add a monitoring alert on sustained dual-write error rates. Maintain a dashboard showing per-workspace IOS data seeding progress before enabling Milestone 4 rollout for any workspace.

### Risk 4 — `BrandOSLegacyIntelligenceProvider` Translation Fidelity (MEDIUM)

The `translateContextToBlueprint()` function in `BrandOSLegacyIntelligenceProvider` must produce an `ArtifactBlueprintResult` that generates equivalent artifacts to the current `IBrandCognitionContext` path. Any translation error affects artifact quality.

**Mitigation:** Add snapshot regression tests for `translateContextToBlueprint()` using representative `IBrandCognitionContext` fixtures from production. Run A/B governance score comparison on the same request through old path vs. new path with legacy provider in shadow mode. Advance to Milestone 2 only when parity is confirmed.

### Risk 5 — Test Coverage Gap in IOS (MEDIUM)

IOS Sprint 3 tests cover pipeline units and blueprint assembly. Integration tests covering the full `buildBlueprint()` → `IIntelligenceProvider` surface do not yet exist.

**Mitigation:** Add a dedicated `IIntelligenceProvider` conformance test suite to `tests/integration/`. This suite should be runnable against both `BrandOSLegacyIntelligenceProvider` and the IOS implementation to validate parity. This is a Milestone 1 deliverable.

### Risk 6 — Data Migration Complexity at Milestone 5 (LOW)

`brand_memory_entries` and `identity_signals` contain workspace-scoped data that must be migrated to `intelligence.learnings` (user-scoped). The mapping is non-trivial: workspace signals must be mapped to workspace-owner user IDs, and A–E classification must be translated to taxonomy categories.

**Mitigation:** This migration only affects workspaces that received no IOS dual-write data during Milestone 2 (legacy-only workspaces that were never opted in). With a 4-week minimum on IOS primary before Milestone 5, most workspaces will have full IOS data. The migration scope is narrow. Write a migration script in Milestone 4 and validate on staging before Milestone 5.

### Architectural Recommendations

1. **Do not extract IntelligenceOS to a separate repository before Milestone 5.** The monorepo colocation simplifies the parallel development period and keeps the boundary rule enforcement (`RULE-IOS-ISOLATION`) unified with the rest of BrandOS.

2. **`@brandos/shared-intelligence-types` should be created as a standalone package at L0 immediately in Milestone 1.** The types it contains (`ArtifactBlueprint`, `FeedbackEvent`, `ArtifactRequest`) are the bilateral contract. They must not live inside either system's package.

3. **Preserve the CPL proxy surface as-is throughout the migration.** The proxy functions (`resolveBrandCognitionContext`, `recordBrandMemoryObservation`, etc.) are the stable public API for `apps/web`. Their internal implementation changes from BI runtime → `IIntelligenceProvider`; their signatures remain constant. This is the lowest-risk possible change surface.

4. **Enforce `RULE-IOS-ISOLATION` from Day 1 in `check-boundaries.mjs`.** Once the rule is live, any accidental IOS import of a BrandOS package is caught in CI before it can accumulate. The rule is far easier to enforce from the start than to clean up after violation.

5. **The `IIntelligenceProvider` interface should be considered a public contract.** Version it with semantic versioning in `@brandos/contracts`. Breaking changes to it require coordination between both teams. Minor additions (new optional methods) are backward-compatible.

---

*This document was generated from live source analysis on 2026-06-25. Every factual claim is traceable to a specific file in `brandos-full-20260625-104120.zip` or `intelligence-os-sprint3-final.zip`. Sections derived from `Intelligence_Ownership_Audit.docx` are cited from that document's own source analysis.*
