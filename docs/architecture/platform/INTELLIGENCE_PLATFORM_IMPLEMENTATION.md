# Intelligence Platform — Implementation Architecture

**Status:** Canonical — implementation blueprint
**Companion to:** `docs/architecture/INTELLIGENCE_PLATFORM_ARCHITECTURE.md` (target architecture)
**Scope:** Concrete package ownership, contracts, and dependency rules for the BrandOS ↔ IntelligenceOS split.

This document is the engineering translation of the target architecture. It does not describe how to get there — it describes what "there" looks like, precisely enough that a package structure, an interface, or a dependency can be checked against it and judged correct or incorrect.

---

## 1. Final package ownership

Every package is classified into exactly one of four categories. Nothing is left ambiguous.

- **Execution Platform** — owned by BrandOS. Builds, governs, renders, and delivers artifacts.
- **Cognitive Platform** — owned by IntelligenceOS. Learns, remembers, reasons, and produces judgment.
- **Shared Contract** — owned by neither platform's internals. Pure types and interfaces both sides compile against. No runtime logic.
- **Shared Infrastructure** — generic, cognition-free utilities usable by either platform without creating a dependency between them.

| Package | Classification |
|---|---|
| `apps/web` | Execution Platform |
| `packages/ai-runtime-layer` | Execution Platform |
| `packages/artifact-config` | Execution Platform |
| `packages/artifact-engine-layer` | Execution Platform |
| `packages/auth` | Execution Platform |
| `packages/control-plane-layer` | Execution Platform |
| `packages/governance-config` | Execution Platform |
| `packages/governance-layer` | Execution Platform |
| `packages/iskill-runtime` | Execution Platform |
| `packages/output-control-layer` | Execution Platform |
| `packages/presentation-layer` | Execution Platform |
| `packages/runtime-config` | Execution Platform |
| `packages/ui-admin` | Execution Platform |
| `packages/cognition-client` *(successor to `brand-intelligence`)* | Execution Platform — **Adapter** |
| `packages/contracts` | **Split** — execution-facing types stay Shared Contract–adjacent but live inside BrandOS; cognition-runtime types are removed entirely (see §4) |
| `packages/shared-utils` | Shared Infrastructure |
| `intelligence-os/packages/intelligence-os` | Cognitive Platform |
| `intelligence-os/packages/shared-intelligence-types` | Shared Contract |
| `@platform/cognition-contract` *(new)* | Shared Contract |

Two things follow directly from this table:

- **`brand-intelligence` does not survive as a domain package.** Its successor, `cognition-client`, is classified as Execution Platform because it contains zero cognition logic — it is a client, not a capability. It belongs to BrandOS the same way an HTTP client for any external service would.
- **`shared-intelligence-types` and the new `@platform/cognition-contract` are the only packages either platform imports across the boundary.** Everything else in IntelligenceOS is invisible to BrandOS, and everything else in BrandOS is invisible to IntelligenceOS.

---

## 2. BrandOS package design

### Final structure

```
brandos/
  packages/
    contracts/              # execution-domain contracts only (artifact, auth, generation, governance)
    ai-runtime-layer/        # unchanged — provider routing, execution
    artifact-config/         # unchanged
    artifact-engine-layer/   # unchanged
    auth/                    # unchanged
    control-plane-layer/     # orchestration — now calls cognition-client, never a runtime class
    cognition-client/        # NEW — thin adapter over CognitionProvider (successor to brand-intelligence)
    governance-config/       # unchanged
    governance-layer/        # unchanged
    iskill-runtime/          # unchanged
    output-control-layer/    # prompt compiler + contract assembler — consumes CognitionContext only
    presentation-layer/      # unchanged
    runtime-config/          # unchanged
    shared-utils/            # unchanged
    ui-admin/                # unchanged
  apps/web/                  # unchanged — never imports cognition-client directly
```

### The adapter package: `cognition-client`

This is the entire footprint of cognition inside BrandOS. It contains:

- One HTTP/RPC client implementing `CognitionProvider` (§4).
- The `CognitionContext` and `ObservationInput` types, re-exported from `@platform/cognition-contract`.
- No business logic. No extraction, resolution, merging, or scoring code of any kind. If a function in this package computes a judgment rather than transports one, it is misplaced.

`cognition-client` is a leaf package: it depends only on `@platform/cognition-contract` and generic transport utilities from `shared-utils`. Nothing in BrandOS depends on `cognition-client`'s internals — only on the `CognitionProvider` interface it implements.

### Which packages become adapters

Only **`cognition-client`** is an adapter in the architectural sense (a package that exists solely to translate an external capability into a local interface). No other BrandOS package changes role.

### Which packages consume `CognitionContext`

| Package | What it reads from `CognitionContext` |
|---|---|
| `control-plane-layer` | Calls `cognition-client` once per generation request; passes the resulting `CognitionContext` downstream. Never inspects or transforms it beyond routing. |
| `output-control-layer` | The primary consumer. The prompt compiler reads `voice` and `identity` to build prompt fragments; the contract assembler's contributors read `identity` and `visualIdentity` as pure field-mappers — no resolver calls, no re-derivation. |
| `ai-runtime-layer` | Reads `visualIdentity`/personalization fields when constructing multimodal or personalization-aware requests. Never reads raw memory or signal data — that never reaches this layer. |
| `governance-layer` | Reads `voice.bannedPhrases` and `confidence` to decide whether output requires stricter review. Never recomputes confidence. |

No other package touches `CognitionContext`. `artifact-engine-layer`, `presentation-layer`, `auth`, `runtime-config`, `iskill-runtime`, and `ui-admin` have no cognition dependency, direct or indirect — this is enforced structurally, not by convention (§7).

---

## 3. IntelligenceOS package design

### Final structure

```
intelligence-os/
  packages/
    shared-intelligence-types/   # published contract types — the only public surface
    intelligence-os/
      src/
        api/                    # NEW — implements CognitionProvider; the only entry point external callers use
        context/                 # NEW — ContextBuilder; assembles CognitionContext from every module below
        cognition/                # NEW — identity resolution, style projection, confidence calculation
        knowledge/                # extraction & validation (pattern, vocabulary, framework, knowledge processor)
        pipeline/                 # learning loop (signal extraction, hypothesis engine, learning validator, feedback processor)
        memory/                   # NEW — consolidated signal storage, decay, repository interface
        blueprint/                 # reasoning (narrative planning, conflict resolution, hypothesis structuring)
        domains/                   # extensibility surface — one module per product/domain consuming IntelligenceOS
        db/                        # persistence adapters, internal only
        events/                    # internal eventing, internal only
        types/                     # internal types not part of the public contract
        utils/                     # internal only
```

### Where each capability lives

- **Learning** → `pipeline/` — `SignalExtractor`, `LearningValidator`, `FeedbackProcessor` form the loop that turns raw observations into candidate knowledge.
- **Memory** → `memory/` — owns storage, retrieval, and decay of consolidated signals. This is where `BrandMemoryServiceV2`'s and `supabase-repository-v2.ts`'s responsibilities land, generalized beyond brand-specific signal types.
- **Knowledge** (extraction and validation of patterns, vocabulary, frameworks) → `knowledge/` — already the most mature module; absorbs the regex-extractor responsibilities that previously lived inside BrandOS.
- **Identity** and **Style Projection** → `cognition/` — the generalized home for what `StyleProjectionResolver` and `TopicProfileResolver` did: conflict resolution across signals, confidence-weighted ordering, producing a gated projection.
- **Knowledge Graph** → `knowledge/` plus `domains/KnowledgeIntelligenceDomain` — structural relationships between concepts, distinct from raw extraction.
- **Reasoning** → `blueprint/` — `HypothesisEngine`, `ConflictResolutionModel`, `NarrativePlanner` are inference over consolidated knowledge, not extraction of it; kept structurally separate from `knowledge/` for that reason.
- **Context Building** → `context/` — the terminal module. It is the only module permitted to call across `cognition/`, `memory/`, `knowledge/`, and `blueprint/` to assemble a single `CognitionContext`. No other module assembles the contract; no module outside `context/` is called directly by `api/`.

### The public surface

`api/` is the only module IntelligenceOS exposes externally. It implements `CognitionProvider`, delegates every method to `context/` (for reads) or `pipeline/` (for writes), and returns only `CognitionContext`-shaped data or acknowledgements. Every other module — `knowledge/`, `pipeline/`, `memory/`, `blueprint/`, `domains/`, `db/`, `events/` — is `internal` and unreachable from outside the package, enforced at the package-export level (§7), not by naming convention alone.

`domains/` remains the extensibility seam for future products: a new consumer of IntelligenceOS gets a new domain module, not a fork of `context/`. BrandOS's usage is one domain among others, not a privileged caller.

---

## 4. System contract

Two contracts make up the entire cross-platform surface: the interface BrandOS calls, and the data shape it receives. Both live in `@platform/cognition-contract`, imported by both repositories, owned by neither platform's internals.

### `CognitionProvider`

```typescript
/**
 * The complete set of operations BrandOS may perform against IntelligenceOS.
 * Every method either retrieves an already-computed judgment or reports a
 * fact for IntelligenceOS to interpret. No method performs a partial
 * computation that BrandOS would need to finish.
 */
interface CognitionProvider {
  /** Retrieve the current resolved cognitive picture for a workspace. */
  resolveCognitionContext(
    workspaceId: string,
    taskType?: string
  ): Promise<CognitionContext>;

  /** Report what happened in a generation, for IntelligenceOS to learn from. */
  observe(input: ObservationInput): Promise<void>;

  /** Pass through a human review decision on a previously surfaced signal. */
  review(
    workspaceId: string,
    entryId: string,
    approved: boolean,
    reviewedBy: string
  ): Promise<void>;

  /** Retrieve a display-ready summary for UI surfaces (e.g. brand profile screens). */
  summarizeCognition(
    workspaceId: string,
    personaId?: string
  ): Promise<CognitionSummary>;

  /** Report whether IntelligenceOS is available, for degraded-mode handling. */
  healthCheck(): Promise<CognitionHealth>;
}
```

### `CognitionContext`

```typescript
/**
 * The complete, read-only cognitive picture of a workspace at the moment
 * of resolution. Every field is a finished judgment. Nothing in this shape
 * is an ingredient BrandOS could recombine into a new conclusion.
 */
interface CognitionContext {
  readonly workspaceId: string;
  readonly resolvedAt: string;
  readonly confidence: CognitionConfidence; // 'high' | 'medium' | 'low' | 'degraded'

  readonly voice: VoiceProfile;
  readonly identity: IdentityContribution | null;
  readonly visualIdentity: VisualIdentityProjection | null;
  readonly provenance: CognitionProvenance;
}

interface VoiceProfile {
  readonly tone: string;
  readonly cadence: 'short' | 'medium' | 'long' | 'varied';
  readonly audienceType: string;
  readonly executiveLevel: boolean;
  readonly domain: string;
  readonly bannedPhrases: readonly string[];
}

interface IdentityContribution {
  readonly brandName: string | null;
  readonly narrativeArcs: readonly string[];
  readonly argumentationStyle: string | null;
  readonly namedFrameworks: readonly string[];
  readonly preferredLength: 'short' | 'medium' | 'long';
}

interface VisualIdentityProjection {
  readonly primaryColor?: string;
  readonly fontStyle?: string;
  readonly layoutDensity?: string;
}

interface CognitionProvenance {
  readonly signalCount: number;
  readonly lastConsolidatedAt: string | null;
}

type CognitionConfidence = 'high' | 'medium' | 'low' | 'degraded';

interface ObservationInput {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly outputText: string;
  readonly score: number;
  readonly topic?: string;
}

interface CognitionSummary {
  readonly preferredTone: string | null;
  readonly audience: string | null;
  readonly industry: string | null;
  readonly positioning: string | null;
  readonly keywords: string | null;
}

interface CognitionHealth {
  readonly healthy: boolean;
  readonly degradedReason?: string;
}
```

**The dependency guarantee this creates:** BrandOS's entire compile-time dependency on cognition is `import type { CognitionProvider, CognitionContext, ... } from '@platform/cognition-contract'`. No file in BrandOS imports from `intelligence-os` directly, ever. `cognition-client` is the single implementation of `CognitionProvider` that BrandOS constructs; everywhere else in BrandOS, `CognitionProvider` is injected as an interface.

---

## 5. Responsibility allocation

Every intelligence-related component previously identified inside BrandOS, classified exactly once.

| Component (prior location) | Classification | Justification |
|---|---|---|
| `brand-memory-service-v2.ts` extractor functions | **MOVE** | Duplicate of `knowledge/`'s `PatternExtractor`/`VocabularyExtractor`/`FrameworkExtractor`. One implementation survives, in IntelligenceOS. |
| `BrandMemoryServiceV2` orchestration class | **MOVE** | Its job — coordinating extraction, scoring, and storage — is `pipeline/` and `memory/` responsibility. |
| `style-projection-resolver.ts` (`StyleProjectionResolver`, `TopicProfileResolver`) | **MOVE** | Style Projection and consolidation are Cognitive Platform capabilities by definition. |
| `brand-context.ts` — `mergeBrandContext()` | **MOVE** | Merging signal and persona data into a resolved profile is context building. |
| `brand-context.ts` — `buildBrandSystemFragment()` | **KEEP** | Prompt-string assembly is Prompt Compiler work; it moves into `output-control-layer`, rewritten to read `CognitionContext.voice` instead of a local type. |
| `BrandIntelligenceRuntime.ts` (full runtime: resolve, consolidate, decay, learn, review, health, identity contribution) | **MOVE** | This is the cognition runtime in its entirety. Its methods become `api/`'s implementation of `CognitionProvider` inside IntelligenceOS. |
| `global-runtime.ts` (in-process singleton) | **DELETE** | An in-process singleton has no meaning once cognition is out-of-process. Superseded by `cognition-client`'s own connection lifecycle, which is new code, not a modified version of this file. |
| `runtime/types.ts` (`IBrandIntelligenceRuntime`, config types) | **DELETE** | Superseded entirely by `CognitionProvider`, which is smaller by design (five methods, not eleven). |
| `supabase-repository-v2.ts` | **MOVE** | Memory persistence belongs to `memory/` in IntelligenceOS, regardless of which physical database it uses. |
| `memory/types.ts` (V1 entry shape, already dead) | **DELETE** | Confirmed unused outside the package; carries no forward value. |
| `interfaces/IBrandIntelligence.ts` | **DELETE** | A domain-package boundary file for a domain BrandOS no longer owns. |
| `validatePackage.ts` | **DELETE** | Validates invariants of a domain package that no longer exists. |
| `src/index.ts` (current public API) | **REPLACE** | Becomes `cognition-client`'s index — exporting only the `CognitionProvider` implementation and re-exported contract types. |
| `control-plane-layer/src/brand-memory/service.ts` (proxy functions) | **KEEP** | Already the correct seam. Internals swap from an in-process call to `cognition-client`, but the exported shape does not change. |
| `control-plane-layer/src/orchestrator.ts` (cognition-calling section) | **KEEP** | Orchestration stays; it calls `cognition-client` and passes `CognitionContext` downstream without inspecting it. |
| `control-plane-layer/src/types.ts` (local BI type re-declarations) | **REPLACE** | Local declarations are deleted; replaced by imports from `@platform/cognition-contract`. |
| `output-control-layer/prompt-compiler/*` | **KEEP** | Correct owner. Input type changes from `IBrandCognitionContext` to `CognitionContext`. |
| `output-control-layer/.../PersonaContributor.ts` | **KEEP, unchanged** | Already the correct pattern — pure field mapping, no cognition import. Used as the template for the fix below. |
| `output-control-layer/.../IdentityContributor.ts` | **REPLACE** | Its current live call to `resolveIdentityContribution()` is deleted outright; replaced with a pure field-read from `CognitionContext.identity`, matching `PersonaContributor`'s pattern. |
| `contracts/brand-cognition-contracts.v2.ts` | **DELETE** | Already dead — documented as retired by its own sibling file. |
| `contracts/brand-cognition-contracts.ts` — runtime/repository interfaces (`IBrandCognitionRuntime`, `IBrandSignalRepository`) | **MOVE** | These describe cognition *behavior*; they become internal IntelligenceOS types, never imported by BrandOS. |
| `contracts/brand-cognition-contracts.ts` — data shapes (`IBrandMemorySignal`, `IStyleProjection`, `ITopicProfile`) | **REPLACE** | Superseded by `CognitionContext`'s fields directly. BrandOS depends on the finished contract, not on the raw shapes cognition is built from. |
| `ai-runtime-layer/interfaces/IAIRuntimeRequirement.ts` (BI import) | **REPLACE** | Import source changes from `brand-intelligence` to `@platform/cognition-contract`; the file itself stays. |

No component is left unclassified. Every entry is exactly one of KEEP, MOVE, DELETE, REPLACE.

---

## 6. Runtime interaction

The steady-state sequence for a single generation request:

```
Upload
  ↓  (asset lands in BrandOS workspace storage)
Observe
  ↓  (BrandOS calls CognitionProvider.observe() for prior generation outcomes —
      asynchronous, never blocks the current request)
Learn
  ↓  (IntelligenceOS pipeline/ processes observations into candidate signals —
      happens inside IntelligenceOS, invisible to BrandOS, not on the request's
      critical path)
Consolidate
  ↓  (IntelligenceOS memory/ + cognition/ resolve candidate signals into stable,
      decayed, conflict-resolved state — also off the critical path, triggered
      on its own cadence, not per-request)
Generate  [request enters BrandOS's synchronous path]
  ↓  (control-plane-layer receives the request)
Resolve CognitionContext
  ↓  (control-plane-layer calls cognition-client.resolveCognitionContext();
      IntelligenceOS's context/ assembles the already-consolidated state into
      the contract — this call is a read, not a computation)
Compile Prompt
  ↓  (output-control-layer builds the prompt from CognitionContext.voice
      and .identity — pure data consumption)
Governance
  ↓  (governance-layer checks output against policy, using
      CognitionContext.voice.bannedPhrases and .confidence as inputs it
      trusts but never recomputes)
Render
  ↓  (presentation-layer / artifact-engine-layer produce the artifact)
Export
  (delivered to the requested destination)
```

**The critical structural point:** `Observe`, `Learn`, and `Consolidate` are not steps in the request path — they are IntelligenceOS's own continuous loop, running on its own schedule, fed by observations BrandOS reports asynchronously. `Generate` through `Export` is the only synchronous path a user request follows, and cognition enters it exactly once, as a single read (`Resolve CognitionContext`). If a future design puts learning, consolidation, or any cognition computation on the synchronous request path, it has violated this architecture regardless of which package the code physically lives in.

---

## 7. Dependency rules

**Allowed dependencies:**

- Any Execution Platform package → any other Execution Platform package (within BrandOS's existing internal rules).
- Any Execution Platform package → `@platform/cognition-contract` (types only).
- `cognition-client` → `@platform/cognition-contract` and generic transport utilities in `shared-utils`.
- Any Cognitive Platform module → any other Cognitive Platform module *within* `intelligence-os` (internal structure is IntelligenceOS's own concern).
- `intelligence-os/api` → `@platform/cognition-contract` (it implements the interface and returns the contract type).
- Both platforms → `shared-utils`-class Shared Infrastructure, provided that infrastructure contains no cognition or execution business logic of its own.

**Forbidden dependencies:**

- **Any BrandOS package → `intelligence-os` internals.** Only `cognition-client` may depend on IntelligenceOS at all, and only on its published `api/` surface via `CognitionProvider` — never on `knowledge/`, `pipeline/`, `memory/`, `blueprint/`, `domains/`, `db/`, `events/`, or `types/`.
- **`intelligence-os` → any BrandOS package, ever, in either direction.** IntelligenceOS has no knowledge that BrandOS exists; it serves `domains/` consumers generically. A dependency from IntelligenceOS back into BrandOS would make IntelligenceOS non-reusable by definition and is treated as an architecture violation, not a style issue.
- **Any BrandOS package other than `cognition-client` → `@platform/cognition-contract`'s implementation details.** Other packages may import the `CognitionProvider` and `CognitionContext` *types*; they may not construct a `CognitionProvider` implementation themselves.
- **`output-control-layer`, `ai-runtime-layer`, `governance-layer`, or any consumer → live cognition method calls of any kind.** These packages may only read fields off an already-resolved `CognitionContext`. A dependency that lets a consumer *call* a resolution, consolidation, or scoring operation — rather than read its result — is forbidden regardless of how it is packaged.
- **Cyclic dependency between `control-plane-layer` and `cognition-client`.** `control-plane-layer` depends on `cognition-client`; `cognition-client` must never depend back on `control-plane-layer` or any orchestration-layer type. If `cognition-client` needs workspace or request context, that context is passed as a parameter, not imported as a type from the orchestration layer.

This graph has one crossing point (`cognition-client` → `intelligence-os/api`, mediated entirely through `@platform/cognition-contract`) and is acyclic by construction: IntelligenceOS cannot reach back into BrandOS through any path, and no Execution Platform package can reach into Cognitive Platform internals through any path other than the one sanctioned adapter.

---

## 8. Design principles

Rules future contributors check every new feature against before writing code:

1. **One capability, one package, one owner.** Before adding code, name the capability and find its single owner in §1 or §3. If it doesn't have one, that is a decision to make explicitly — via this document — before implementation, not a gap to fill implicitly.

2. **If it changes when the system learns, it is Cognitive Platform code — no exceptions for convenience.** A "temporary" or "simplified" cognition function inside BrandOS is not temporary; it is the exact pattern that caused the original duplication. There is no such thing as execution-side cognition, however small.

3. **BrandOS depends on a contract, never on a capability's implementation.** If a BrandOS package needs new information from cognition, the fix is a new field on `CognitionContext`, proposed and reviewed as a contract change — not a new import, not a new method call into IntelligenceOS internals.

4. **`CognitionContext` grows by addition, not by escape hatch.** New fields must be finished judgments, not raw material a consumer could use to compute something IntelligenceOS didn't already decide. A field like `rawSignals` or `candidateExtractions` is a sign the boundary is being bypassed, not extended.

5. **Every consumer of `CognitionContext` is a pure reader.** `PersonaContributor`'s pattern — read a field, map it, return it, no cognition import — is the template. Any consumer written differently should be treated as a defect, not a variant.

6. **IntelligenceOS never becomes aware of BrandOS.** New IntelligenceOS capabilities are designed against `domains/` as a generic extensibility point. If a design only makes sense with BrandOS-specific knowledge baked into IntelligenceOS, the design is wrong, not the rule.

7. **The synchronous request path touches cognition exactly once.** Any new feature that would add a second cognition call inside `Generate → Export` (§6) should instead extend what a single `resolveCognitionContext()` call returns.

8. **No package may reintroduce a forbidden dependency to solve a short-term problem.** Deadline pressure is not an exception to §7's dependency rules. A violation merged under pressure is technical debt against this document specifically, and should be tracked as such.

9. **Ambiguity is resolved by the single-sentence test, not by precedent.** For any new capability: *does it get better as the system observes more usage over time, or is it correct or incorrect independent of history?* The former is IntelligenceOS. The latter is BrandOS. This test outranks "where similar code lived before."
