# Platform Contract — BrandOS ⇄ IntelligenceOS

**Scope:** the cross-repository boundary between BrandOS (an execution platform, in a separate repository) and IntelligenceOS (this repository, the cognitive platform). For IntelligenceOS's *internal* structure, see [`ARCHITECTURE.md`](./ARCHITECTURE.md). For IntelligenceOS's other, independent public surface (the in-process `IIntelligenceProvider`), see [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md).

This document has two parts, deliberately kept separate: **§1–§4 describe what is actually implemented and running today**, verified directly against the source in this repository. **§5 onward describes the constitutional target design** the contract is meant to grow into. Where the two disagree — and in a few places they currently do — the current-implementation section wins for "what should I build against right now," and the target section wins for "what shape should a new field or method take."

---

## 1. Why two platforms

BrandOS answers: *how do we take a request and produce a governed, on-brand, exported artifact, reliably and fast?* Its pressure comes from execution concerns — runtime stability, prompt assembly, policy enforcement, rendering fidelity, export correctness.

IntelligenceOS answers: *what has this workspace taught us, and what does that mean for the next output?* Its pressure comes from cognition concerns — signal extraction, semantic consolidation, memory decay, identity resolution, reasoning over accumulated context.

Collapsing these into one platform was tried implicitly before this split — BrandOS grew a package that did real cognition work (signal extraction, style projection, memory consolidation) inside the execution platform, and that coupling capped both systems' growth: cognition changes had to ship through execution's release cadence, and execution had to carry cognition's complexity. The split removes that coupling. It also lets IntelligenceOS serve other products later without carrying BrandOS's execution concerns along with it.

**Principles:**
- IntelligenceOS is the single source of truth for cognition. BrandOS never computes, re-derives, approximates, or caches a cognitive judgment locally.
- BrandOS never implements cognition, however small or "temporary" it seems.
- IntelligenceOS never performs execution — no rendering, no prompt formatting, no governance enforcement.
- The only thing that exists between the two platforms is the contract described below.

## 2. What crosses the boundary today

Two packages, both type-only, both living in this repository under `packages/cognition-contract`:

- **`CognitionContext`** flows IntelligenceOS → BrandOS: the resolved cognitive picture of a workspace.
- **`ObservationInput`** flows BrandOS → IntelligenceOS: a report of what was generated and how it performed, with no interpretation attached.
- **`CognitionReviewDecision`** flows BrandOS → IntelligenceOS: a human decision (approve/reject a learned signal), passed through, not evaluated, by BrandOS.
- **`CognitionHealth`** flows IntelligenceOS → BrandOS: whether cognition is currently available, for degraded-mode handling.

What never crosses: no repository handles, resolver classes, or runtime instances; no raw signals or intermediate extraction results; no method that *performs* reasoning rather than *retrieves* a finished result; no cognition-side persistence details (how or where memory is stored, decayed, or versioned).

## 3. What's actually implemented (verified against source)

### `CognitionProvider` — the real interface, 5 methods

This is `packages/cognition-contract/src/CognitionProvider.ts`, implemented by `packages/intelligence-os/src/api/CognitionProviderImpl.ts`, obtained via `IntelligenceOS.asCognitionProvider()`:

```typescript
interface CognitionProvider {
  resolveCognitionContext(request: CognitionRequest): Promise<CognitionContext>;
  observe(input: ObservationInput): Promise<void>;
  review(decision: CognitionReviewDecision): Promise<void>;
  summarizeCognition(workspaceId: string): Promise<CognitionSummary>;
  checkHealth(): Promise<CognitionHealth>;
}
```

| Method | What it actually does today |
|---|---|
| `resolveCognitionContext` | Delegates to `context/ContextBuilder`, which composes `WorkspaceIntelligenceDomain.getWorkspaceLearnings()`. On any fetch failure, falls back to `createDegradedCognitionContext()` — never throws. |
| `observe` | ADR-003: derives Signals from the observation via `SignalExtractor.extractFromObservation()` and runs them through the full Learning Pipeline (`ObservationBuilder` → `HypothesisEngine` → `LearningValidator` → `ProfileBuilder`) via `FeedbackProcessor.processObservation()` — the same six-class pipeline a User subject's `FeedbackEvent` runs through, generalized by `SubjectRef` (`types/subject.ts`) rather than duplicated. Zero-score/placeholder observations are silently skipped, not an error (no Signal is produced). Persistence and pipeline failures are logged and swallowed — this call is fire-and-forget by contract; it must never fail the generation request that triggered it. Superseded the Milestone 3 direct write to `WorkspaceIntelligenceDomain.upsertWorkspaceLearning()` this row previously described — see `IMPLEMENTATION_STATUS.md` for the history. |
| `review` | Delegates to `UserIntelligenceDomain.reviewLearningForWorkspace()`. Errors are allowed to propagate (not swallowed) — this is a human-triggered UI action that should surface real failures. |
| `summarizeCognition` | Reads the same `getWorkspaceLearnings()` data `resolveCognitionContext` uses, projected differently. Fields with no honest workspace-scoped source (`keywords`) are returned `null` rather than guessed. |
| `checkHealth` | Delegates to `HealthChecker`, which does one `SELECT ... LIMIT 1` against `intelligence.learnings` to confirm the database connection is reachable. Never throws. |

### `CognitionContext` — the real shape, 7 substantive sections

This is smaller than the target design in §6 below — it currently covers what BrandOS's prompt compiler and governance layer need, not the full constitutional vocabulary:

```typescript
interface CognitionContext {
  readonly contractVersion: string;
  readonly workspaceId: string;
  readonly resolvedAt: string;
  readonly confidence: CognitionConfidence;   // 'high' | 'medium' | 'low' | 'degraded'

  readonly voice: VoiceProfile;                        // tone, cadence, audienceType, executiveLevel, domain, bannedPhrases, + additive fields
  readonly identity: IdentityContribution | null;       // narrativeArcs, argumentationStyle, namedFrameworks, preferredLength, + additive fields
  readonly visualIdentity: VisualIdentityProjection | null;  // primaryColor, fontStyle, layoutDensity
  readonly provenance: CognitionProvenance;             // signalCount, lastConsolidatedAt

  // ADR-004 (Cognitive Consolidation) — additive, contract version 1.1.0
  readonly knowledge: CognitionKnowledgeSection | null;       // themes: {name, description}[], confidence, hasConflict
  readonly reasoning: CognitionReasoningSection | null;       // conclusions: {statement}[], confidence, hasConflict
  readonly positioning: CognitionPositioningSection | null;   // statements: {statement}[], confidence, hasConflict — Experience-only source today
}
```

`audience`, `narrative`, and `guidance` — three of the original six missing sections described in the target design (§6) — **do not exist on the type today.** Do not build against them without first checking `packages/cognition-contract/src/CognitionContext.ts` directly; this document is a snapshot, that file is the source of truth.

`identity` exists on the type and, as of ADR-003's implementation, is now genuinely synthesized: `context/identitySynthesis.ts` projects a workspace's identity-relevant, confidence-gated Learnings (professional identity, intellectual frameworks, strategic thinking patterns, personal brand signal) into an `IdentityContribution`. It resolves to `null` when — and only when — a workspace has no identity-relevant Learnings yet at or above the synthesis confidence floor; that is the honest "nothing learned yet" state every new workspace starts in, not an unresolved gap. See [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md) for the full model.

`knowledge`/`reasoning`/`positioning` exist on the type as of ADR-004 and are thin projections of a Subject's current `IntelligenceProfile` (`pipeline/ProfileBuilder.ts`, off the critical path) — `ContextBuilder` performs zero synthesis for them, the same discipline it already applies to `identity`/`voice`. Each resolves to `null` when the current profile has nothing synthesized yet for that section — the honest "nothing learned or declared yet" state, not a gap. `hasConflict` on each is `true` only when a contributing item's origin already carried a contradiction signal (currently and by design: an Experience-side `Learning.state === 'FLAGGED'` only — Knowledge-side conflict detection is deliberately out of scope until a real consumer need demonstrates what "conflict" should mean for a `KnowledgeAsset`, see `ADR-004` §6); it is never computed fresh at the projection layer. See [`ADR-004`](./adr/ADR-004-cognitive-consolidation.md) for the full model.

### HTTP transport

`apps/api` hosts `CognitionProvider` over HTTP (`createCognitionHttpServer`, `packages/intelligence-os/src/api/http/server.ts`):

```
POST /v1/cognition/resolve   { workspaceId, taskType? }  -> CognitionContext
POST /v1/cognition/observe   ObservationInput             -> 204
POST /v1/cognition/review    CognitionReviewDecision       -> 204
GET  /v1/cognition/summary?workspaceId=...                -> CognitionSummary
GET  /v1/cognition/health                                  -> CognitionHealth
```

Auth: `Authorization: Bearer <COGNITION_API_KEY>` on every request. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for how this gets hosted, and [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) for the full route reference, including the separate, optional Knowledge Ingest route (`POST /v1/knowledge/ingest`) — not part of this five-method contract, but hosted alongside it by `apps/api`.

### Known contract gaps (unresolved, flagged rather than papered over)

Carried forward from `packages/cognition-contract/README.md`, still open:

1. **Raw-signal review UI.** BrandOS's brand-workspace page lists individual pending signals for human approve/reject. `CognitionProvider` has no read operation returning a list of raw or reviewable signals — by design, per the exclusion rules in §7 below. `review()` can act on an entry by opaque id, but nothing in the current contract can populate the list such a page would render. Still open; no target direction has been decided.
2. **Explicit brand-voice configuration ingestion.** Before this contract existed, BrandOS forwarded a workspace's user-edited persona record (brand name, tone override, banned phrases) into resolution on every request. `CognitionRequest` intentionally carries only `workspaceId` and `taskType` — no persona payload, and that stays true: a persona payload forwarded on every request would let a caller assert an identity rather than receive one IntelligenceOS resolved, which is exactly what §7's exclusion rules are designed to prevent. **Decided, implemented, and reachable** ([`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md) §2.4, §9): explicit, user-set configuration (voice, identity declarations, compliance requirements) is **Knowledge**, not an outcome `observe()` reports. It reaches IntelligenceOS through `IIntelligenceProvider.ingestWorkspaceConfiguration()` in-process, or `POST /v1/workspace-configuration` over HTTP — a route sibling to `CognitionProvider` rather than a sixth `CognitionProvider` operation, following the existing Knowledge Ingest route's precedent exactly. Stored with provenance as a `KnowledgeAsset` the way any other one is, and read by `context/ContextBuilder.ts` alongside a workspace's Experience-derived Learnings, taking precedence over them, when `identity`/`voice` are synthesized. Whether BrandOS's own admin UI calls it yet is outside this repository's scope to verify — see `IMPLEMENTATION_STATUS.md`.

Gap 1 requires a design decision not yet made. Gap 2's decision is recorded in `ADR-003`; both remain unimplemented — see [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) Known Issues and [`ROADMAP.md`](./ROADMAP.md).

## 4. Physical duplication (tracked, temporary)

`packages/cognition-contract` is currently duplicated byte-for-byte in both the `brandos` and `intelligence-os` repositories, because there is no shared package registry between them today. Any change to `src/` must be applied identically to both copies in the same change set. The tracked follow-up — publish this package to a real registry and delete one of the two copies — is not yet scheduled; see `ROADMAP.md`.

---

## 5. Target design: the full contract

Everything from here on describes the **constitutional target** for this contract — the shape it's designed to grow into, not a description of what's built. Use this section when designing a new field or evaluating whether a proposed change fits the contract's intended shape; use §1–§4 above for what to actually call today.

### Subject model

`CognitionContext` is a projection of **Cognition** — IntelligenceOS's synthesized understanding of a **Subject** — not a standalone data structure with its own storage or learning behavior (`ARCHITECTURE.md` §3, "Cognition"; [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md)). At this contract's boundary, the Subject is always a **Workspace**: `CognitionRequest.workspaceId` identifies which one. IntelligenceOS resolves that workspace's `identity` and `voice` from its own accumulated Knowledge and Experience, composed with a known contributing user's intelligence only additively and only where one is knowable — never by requiring BrandOS, or any other caller, to supply identity content on the request. This is why `CognitionRequest` stays deliberately minimal (`{ workspaceId, taskType }`, §2): the platform's job is to resolve the Subject's intelligence server-side, not to be told what it is.

### Responsibility matrix

| Capability | Owner | Notes |
|---|---|---|
| Runtime, prompt compilation, governance, artifact pipeline, rendering, export, workflows | **BrandOS** | Execution concern end to end. |
| Asset upload, workspace/auth/user-state plumbing | **BrandOS** | Platform plumbing, not cognition. |
| Learning, memory, knowledge extraction/validation/vocabulary/frameworks | **IntelligenceOS** | Never re-implemented locally in BrandOS. |
| Signal consolidation, confidence calculation | **IntelligenceOS** | Any score describing how much to trust learned knowledge. |
| Brand identity, style projection, knowledge graph, reasoning, context building | **IntelligenceOS** | |

The dividing line in one sentence: **if the work changes when a user clicks "generate," it's BrandOS; if the work changes when the system gets smarter, it's IntelligenceOS.**

### The full `CognitionContext` vocabulary

The constitutional document governing this contract (formerly a standalone `COGNITION_CONTRACT_SPEC.md`) specifies eleven sections. Four are implemented (§3 above); the rest are the target:

| Section | Answers | Status |
|---|---|---|
| `identity` | Who is this brand — stable attributes that persist across outputs | Implemented as a type; resolves to `null` today pending the Subject-synthesis work `ADR-003` records (§3) |
| `voice` | How does this brand sound | Implemented |
| `visualIdentity` | What does this brand look like, for rendering purposes | Implemented |
| `confidence` | How much should the rest of this context be trusted | Implemented |
| `provenance` | Diagnostic-only: how much has been learned, when last consolidated | Implemented |
| `knowledge` | What has this workspace's cognition learned and retained — consolidated positions, recurring themes, named frameworks | **Implemented (ADR-004)** — `IntelligenceProfile.knowledgeSummary`, synthesized from both Knowledge and Experience, projected thinly by `ContextBuilder` |
| `reasoning` | What has been concluded from Knowledge beyond direct recall | **Implemented (ADR-004)** — `IntelligenceProfile.reasoningSummary`, same mechanism as `knowledge` above |
| `positioning` | How this brand stands relative to its market or category | **Implemented (ADR-004), Experience-only** — `IntelligenceProfile.positioningSummary`; no Knowledge Pipeline extractor produces competitive/market framing yet, a deliberate, documented scope decision (`ADR-004` §0.1), not a gap |
| `audience` | Who this is being written for | **Not implemented** — out of scope for `ADR-004`; likely extends the existing `AudienceProfile`/`AudienceCalibrator` rather than `IntelligenceProfile` — see `IMPLEMENTATION_STATUS.md` §5 |
| `narrative` | What stories and structural patterns this brand uses | **Not implemented** — `ADR-004`'s validation pass folded named-framework/narrative-adjacent content into `knowledge`'s scope rather than treating this as a seventh separate field; revisit if that scoping proves insufficient |
| `guidance` | Directive material that doesn't fit the descriptive sections above | **Not implemented** — no obvious existing home; needs its own first-principles pass once a real consumer need is demonstrated |

**What is permanently excluded**, at every stage of this contract's evolution: raw or unconsolidated signals, repository or storage references, extractor or resolver identifiers, internal confidence *calculations* (as opposed to the single resulting Confidence value), workspace history beyond what Provenance summarizes, or any field whose presence would let BrandOS reconstruct a judgment instead of receiving one.

### The full `CognitionProvider` vocabulary (target method names)

The constitutional document names the five operations slightly differently from the shipped implementation. Both refer to the same five responsibilities — this is a naming-only discrepancy between the design document and the code, not a missing capability:

| Target name (constitutional doc) | Shipped name (actual code) | Responsibility |
|---|---|---|
| `resolveCognitionContext` | `resolveCognitionContext` | Same in both — the only read on the request-serving critical path |
| `reportObservation` | `observe` | Report what happened; fire-and-forget |
| `submitReviewDecision` | `review` | Pass through a human decision |
| `describeCognition` | `summarizeCognition` | Display-ready summary, not for driving generation |
| `checkAvailability` | `checkHealth` | Availability only, never cognitive content |

No sixth operation should ever be added to serve a specific feature. If a new need doesn't fit one of these five responsibilities, the answer is a richer `CognitionContext`, not a sixth method.

### Evolution rules

These govern how the contract may change, so change never becomes a boundary violation:

- **Adding fields:** new, optional, additive members of an existing section, or an entirely new top-level section. Must be a business outcome, reviewed against the exclusion list above — "we need this for an implementation reason" is never sufficient justification alone.
- **Backward compatibility:** within a major contract version, no field is ever removed, renamed, or narrowed in type.
- **Forward compatibility:** every consumer must tolerate unknown fields without error.
- **Versioning:** `CognitionContext.contractVersion` (currently `1.1.0` — bumped from `1.0.0` by `ADR-004`'s three additive sections) carries the contract's own semantic version, independent of either platform's release versioning. Minor = additive. Major = the only mechanism for a breaking change.
- **Deprecation:** a field is marked deprecated in this document first, continues to be populated correctly for at least one full major version cycle, and is only removed at the next major version boundary.
- **Semantic stability:** a field's *meaning* is part of the contract, not just its type. Changing what `voice.tone` means, while keeping its type as `string`, is a breaking change under the same rule as removing the field.

### Dependency rules (target, spanning both repositories)

**What BrandOS may import:** exactly `CognitionProvider`, `CognitionContext`, and their constituent types, from the contract package — nothing else, from nowhere else. A single BrandOS-side adapter package (`cognition-client`) is the only place a concrete `CognitionProvider` implementation may be constructed; every other BrandOS package receives it as an injected interface.

**What IntelligenceOS may expose:** exactly one implementation of `CognitionProvider`, returning exactly contract-shaped data. No IntelligenceOS module, class, repository, or internal type is ever exported for external use — if it isn't defined in the contract package, it does not leave IntelligenceOS. `packages/intelligence-os/src/api/` is the only module that may implement `CognitionProvider`.

**Forbidden, stated exhaustively:**
- No BrandOS package may import anything from IntelligenceOS's internal modules, including for type-only imports.
- No IntelligenceOS module may import anything from any BrandOS package, in either direction, for any reason.
- No operation outside the five defined above may exist between the platforms, regardless of transport.
- No field may exist in any cross-boundary type that isn't defined in the contract package.
- No shared mutable state of any kind — not a shared database table both write to, not a shared cache. `CognitionContext` is immutable by design: resolved once, used, discarded, never patched or merged with local data.

### BrandOS-side package classification (context only — outside this repository)

For orientation when reasoning about the far side of this boundary. This table describes BrandOS's own repository structure, which this repository has no visibility into beyond what's documented here — treat it as background, not something this repository can verify or enforce:

| BrandOS package | Classification |
|---|---|
| `apps/web`, `control-plane-layer`, `output-control-layer`, `ai-runtime-layer`, `governance-layer`, `artifact-engine-layer`, `presentation-layer`, `auth`, `runtime-config`, `iskill-runtime`, `ui-admin`, `governance-config`, `artifact-config` | Execution Platform |
| `cognition-client` | Execution Platform — **the one adapter**. Contains an HTTP/RPC client implementing `CognitionProvider` and nothing else — no extraction, resolution, merging, or scoring logic. If a function in this package computes a judgment rather than transports one, it's misplaced. |
| `shared-utils` | Shared Infrastructure — usable by either platform, provided it contains no cognition or execution business logic of its own |

Only `cognition-client` may depend on IntelligenceOS at all, and only on the published contract — never on IntelligenceOS's knowledge/pipeline/memory/blueprint/domains/db/events internals. The consumers that read fields off a resolved `CognitionContext` (prompt compiler reading `voice`/`identity`; rendering reading `visualIdentity`; governance reading `voice.bannedPhrases`/`confidence`) are all pure readers — none of them call a cognition method directly, none of them recompute a value the contract already provides.

### The steady-state request flow

```
Upload → Observe (async, never blocks) → Learn (IntelligenceOS's own loop, off critical path)
  → Consolidate (also off critical path) → Generate [request enters BrandOS's synchronous path]
  → Resolve CognitionContext (the one read on the critical path) → Compile Prompt
  → Governance → Render → Export
```

**The critical structural point:** `Observe`, `Learn`, and `Consolidate` are not steps in the request path — they are IntelligenceOS's own continuous loop, fed by observations BrandOS reports asynchronously. `Generate` through `Export` is the only synchronous path a user request follows, and cognition enters it exactly once, as a single read. If a future design puts learning, consolidation, or any cognition computation on the synchronous request path, it has violated this architecture regardless of which package the code physically lives in.

### Design principles

1. **One source of truth.** For any cognitive question, exactly one system can answer it authoritatively.
2. **Business contracts over implementation contracts.** Written in the language of brand outcomes — identity, voice, positioning — never in the language of either platform's internal architecture.
3. **Immutable cognition.** A `CognitionContext` is a snapshot, not a live object.
4. **Pure execution vs. pure cognition.** Code that is a little of both is a sign the boundary has already been crossed, even if no import statement proves it yet.
5. **No duplicated intelligence.** A second, simplified, local, or "temporary" version of any cognitive capability anywhere is a direct violation.
6. **The contract is the product of this relationship, not a side effect of it.** Changes to how the platforms work together are changes to this document first; code changes that alter the relationship without a corresponding documentation change are departures from the architecture, not implementations of it.
7. **One pipeline, many subjects.** IntelligenceOS resolves this contract for a Subject (§5, "Subject model") using the same learning, synthesis, and composition machinery regardless of subject type. A workspace-specific, or otherwise consumer-specific, shortcut version of identity or voice resolution is Principle 5's violation applied to this contract's own resolution path — see [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md).
