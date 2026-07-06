# Cognition Contract Specification

**Status:** Canonical — constitutional document
**Governs:** All communication between BrandOS (Execution Platform) and IntelligenceOS (Cognitive Platform)
**Supersedes:** Any prior ad hoc interface between the two systems

This document defines the *only* interface that may exist between BrandOS and IntelligenceOS. Nothing crosses the boundary that is not described here. If a future need cannot be met by this contract, the contract is amended through the process in §5 — a new private interface between the platforms is never an acceptable alternative.

---

## 1. Purpose

BrandOS and IntelligenceOS are two platforms because they answer two different questions: BrandOS answers *how do we execute a request*, IntelligenceOS answers *what does this workspace's cognition currently say*. That separation is only real if the two systems cannot see into each other — otherwise "two platforms" is just a deployment detail wrapped around what is still, architecturally, one system.

This document is what makes the separation real. It exists because:

- **A boundary without a contract erodes.** Without a single, named interface, every new need gets solved by reaching one layer deeper into the other system — a method call here, a type import there — until the two platforms are coupled in dozens of undocumented places instead of one documented one. This document is the single place that is allowed to grow instead.
- **Independent evolution requires a stable interface, not a stable implementation.** BrandOS must be able to change its runtime, its prompt compiler, its rendering pipeline — and IntelligenceOS must be able to change its models, its consolidation strategy, its knowledge representation — without either change requiring the other platform to be touched. That is only possible if both sides depend on a contract that is deliberately shielded from either platform's internal decisions.
- **Reuse depends on the contract being business-shaped, not implementation-shaped.** IntelligenceOS exists to serve products beyond BrandOS. A contract expressed in BrandOS's internal vocabulary (its database rows, its class names) cannot be reused; a contract expressed in cognitive outcomes (identity, voice, positioning) can be.

The separation this document enforces is absolute: **execution is BrandOS's alone, cognition is IntelligenceOS's alone, and the only thing that exists between them is this contract.**

---

## 2. Architectural Rules

These rules are not guidelines — they are the test every change to either platform is checked against.

1. **BrandOS never implements cognition.** No BrandOS package may contain logic that extracts, scores, consolidates, resolves, or reasons about knowledge — regardless of how small, how "temporary," or how disconnected from the main cognition pipeline it appears.
2. **IntelligenceOS never performs execution.** No IntelligenceOS module may render, export, format a prompt string, enforce governance policy, or otherwise act on behalf of a specific product's delivery pipeline.
3. **BrandOS consumes cognition; it never derives it.** Every cognitive fact BrandOS uses must arrive through this contract, already resolved. BrandOS may read a field. It may never combine, infer, or approximate a new conclusion from what it reads.
4. **IntelligenceOS owns all learning and reasoning, without exception.** There is no such thing as a cognition capability with two implementations, one of which happens to be simpler and live inside BrandOS.
5. **`CognitionContext` is immutable.** Once resolved and returned, a `CognitionContext` value never changes. BrandOS never mutates it, patches it, or merges it with local data to produce a new effective context. If the picture needs to change, BrandOS requests a new resolution — it does not edit the old one.
6. **IntelligenceOS is the single source of truth for cognition.** For any question this contract can answer, there is exactly one place capable of answering it authoritatively. A cached or locally reconstructed answer is not a second source of truth — it is a defect.
7. **The contract is the boundary, not a convenience layer.** Nothing about this contract exists to make integration easier at the expense of the boundary. Where ease of integration and boundary integrity conflict, boundary integrity wins.

---

## 3. CognitionProvider

`CognitionProvider` is the complete, canonical set of operations BrandOS may perform against IntelligenceOS. It is designed to remain correct for the platform's next five years of growth — not tuned to today's call sites. Every operation is either a **read** (retrieve an already-resolved judgment) or a **report** (hand IntelligenceOS a fact to interpret on its own terms). There is no third category, and there never will be — an operation that asks IntelligenceOS to *perform* a computation on BrandOS's behalf mid-request does not belong in this interface, because it would make BrandOS a participant in cognition rather than a consumer of it.

```typescript
/**
 * CognitionProvider — the entire cross-platform surface.
 * Every parameter and return type is defined in this contract or in
 * CognitionContext. Nothing here references an IntelligenceOS-internal
 * type, class, or storage detail.
 */
interface CognitionProvider {

  /**
   * Retrieve the current, fully resolved cognitive picture for a workspace.
   * This is a read of already-consolidated state — it triggers no learning,
   * no consolidation, and no side effects. Calling it twice with no
   * intervening activity may return the same result; calling it does not
   * change what IntelligenceOS knows.
   */
  resolveCognitionContext(request: CognitionRequest): Promise<CognitionContext>;

  /**
   * Report an observed outcome — what was generated, in what workspace,
   * how it performed — for IntelligenceOS to interpret in its own time.
   * This is a write of raw fact, not an instruction. BrandOS does not
   * specify what the observation means; it only reports what happened.
   * This call must never block or gate the request that produced the
   * observation — it is reporting after the fact, not participating in it.
   */
  reportObservation(observation: CognitionObservation): Promise<void>;

  /**
   * Pass through a human decision about previously surfaced cognitive
   * material (e.g. approving or rejecting a learned position). BrandOS
   * is a conduit for this decision, not an evaluator of it — it forwards
   * a human's judgment; it does not form one.
   */
  submitReviewDecision(decision: CognitionReviewDecision): Promise<void>;

  /**
   * Retrieve a display-ready summary of a workspace's cognition, intended
   * for direct presentation in BrandOS UI surfaces. This is distinct from
   * resolveCognitionContext: it is shaped for human reading, not for
   * driving generation, and carries no guarantee of matching the exact
   * shape or freshness of the generation-time context.
   */
  describeCognition(request: CognitionSummaryRequest): Promise<CognitionSummary>;

  /**
   * Report whether IntelligenceOS is currently able to serve requests,
   * so BrandOS can apply its own degraded-mode handling. This operation
   * never returns cognitive content — only availability.
   */
  checkAvailability(): Promise<CognitionAvailability>;
}
```

### Responsibility of each operation

- **`resolveCognitionContext`** is the only operation on the request-serving critical path. Its entire responsibility is producing one immutable, complete `CognitionContext`. It must never partially resolve — a caller either receives a complete context (at whatever confidence level is honestly available) or an explicit failure; it never receives a context requiring a follow-up call to be usable.
- **`reportObservation`** is the entire write surface for feeding IntelligenceOS's learning loop. Its responsibility ends at accepting the report; what IntelligenceOS does with it — extraction, scoring, storage, discarding — is entirely internal and never described to BrandOS.
- **`submitReviewDecision`** exists because some cognitive material may involve a human-in-the-loop approval step. Its responsibility is transport of a decision already made by a human, through BrandOS's UI, to IntelligenceOS's process — it carries no judgment of its own.
- **`describeCognition`** exists because not every use of cognitive information is a generation. It is deliberately separate from `resolveCognitionContext` so that display concerns (a profile page, an admin summary) can evolve independently of generation concerns without either one distorting the other's contract.
- **`checkAvailability`** exists so that "IntelligenceOS is down" is a first-class, explicit state BrandOS can design around, rather than something inferred from a failed or slow call to one of the other four operations.

No sixth operation should ever be added to serve a specific feature. If a new need doesn't fit one of these five responsibilities, the answer is a richer `CognitionContext`, not a sixth method — see §5.

---

## 4. CognitionContext

This is the most important section of this document, because `CognitionContext` is the *entire* cognitive vocabulary BrandOS is permitted to have. If a concept does not appear here, BrandOS cannot use it — not because of a missing import, but because it does not exist from BrandOS's point of view.

Every field in `CognitionContext` is a **cognitive outcome** — a finished judgment IntelligenceOS has already reached. None of it is a **cognitive ingredient** — raw material a consumer could recombine into a new conclusion. This is the line that must never be crossed in either direction: no signals, no repositories, no extractors, no storage handles, no partial or intermediate state of any kind.

```typescript
/**
 * CognitionContext — the complete, immutable cognitive picture of a
 * workspace at the moment of resolution. Every section is a business
 * outcome, expressed in terms a non-technical stakeholder could read
 * and recognize as a statement about the brand — never in terms of
 * how IntelligenceOS arrived at it.
 */
interface CognitionContext {
  readonly contractVersion: string;       // see §5 — versioning
  readonly workspaceId: string;
  readonly resolvedAt: string;

  readonly identity: Identity;
  readonly voice: Voice;
  readonly knowledge: Knowledge;
  readonly reasoning: Reasoning;
  readonly positioning: Positioning;
  readonly audience: Audience;
  readonly narrative: Narrative;
  readonly visualIdentity: VisualIdentity;
  readonly guidance: Guidance;
  readonly confidence: Confidence;
  readonly provenance: Provenance;
}
```

### Section responsibilities

**Identity.** The answer to "who is this brand." Name, character, and the stable attributes that persist across every output regardless of topic or format. This is the section other sections are calibrated against — voice and narrative are *expressions* of identity, not identity itself.

**Voice.** The answer to "how does this brand sound." Tone, cadence, formality, and any explicit constraints on language (such as phrases to avoid). Voice is the section BrandOS's Prompt Compiler leans on most directly, precisely because it is already expressed as writing guidance rather than as data about writing.

**Knowledge.** The answer to "what has this workspace's cognition learned and retained." Consolidated positions, recurring themes, and named frameworks the brand is known to use or reference — presented as settled points of knowledge, never as a list of observations awaiting interpretation.

**Reasoning.** The answer to "what inference has IntelligenceOS drawn beyond direct recall." Where Knowledge is what is known, Reasoning is what has been concluded from it — for example, a resolved argumentation style or a preferred way of structuring a case. This section exists precisely so BrandOS never has to perform that inference itself from raw Knowledge.

**Positioning.** The answer to "how does this brand stand relative to its market or category." Distinct from Identity (who the brand is) and Narrative (the stories it tells) — Positioning is specifically the brand's claimed or observed stance.

**Audience.** The answer to "who is this being written for." Audience type, expected sophistication, and any relevant expectations that should shape how content is pitched — kept distinct from Voice because audience describes the *reader*, voice describes the *brand*.

**Narrative.** The answer to "what stories and structural patterns does this brand use." Narrative arcs, hooks, and structural preferences that have been observed and consolidated — the shape of storytelling, not its content.

**Visual Identity.** The answer to "what does this brand look like," to the extent it is relevant to generation and rendering — color, typographic character, layout density. This is a projection for BrandOS's rendering needs, not a general design system.

**Guidance.** Explicit, directive material that doesn't fit naturally into the descriptive sections above — constraints, preferences, or instructions IntelligenceOS has determined should shape output. This section is deliberately the contract's escape valve for judgment that is directive rather than descriptive, so that Voice, Knowledge, and the other sections can stay purely descriptive.

**Confidence.** A single, honest statement of how much the rest of the context should be trusted, expressed at a level BrandOS can act on (e.g. gating stricter governance review) without needing to know *why* confidence is what it is.

**Provenance.** Minimal, diagnostic-only metadata — for example, how much has been learned and when it was last consolidated — included strictly for observability and debugging. Provenance must never be used by BrandOS to drive business logic; if a consumer finds itself branching on a Provenance field, that is a sign the information it actually needs belongs in a business-facing section instead.

### What is permanently excluded

No version of `CognitionContext`, at any point in the platform's life, may include: raw or unconsolidated signals, repository or storage references, extractor or resolver identifiers, internal confidence *calculations* (as opposed to the single resulting Confidence value), workspace history beyond what Provenance summarizes, or any field whose presence would let BrandOS reconstruct a judgment instead of receiving one. This exclusion list is itself part of the contract — evolution under §5 may add sections, but may never add a field that violates this list.

---

## 5. Evolution Rules

The contract will change over five years. These rules govern how, so that change never becomes a boundary violation.

**Adding new fields.** New fields are added only as new, optional, additive members of an existing section or as an entirely new top-level section. A new field must be a business outcome, reviewed against the exclusion list in §4, before it is accepted — "we need this for an implementation reason" is never sufficient justification on its own.

**Backward compatibility.** Within a major contract version, no field is ever removed, renamed, or narrowed in type. A consumer written against version `1.0` of the contract must continue to compile and behave correctly against every subsequent `1.x` release without modification.

**Forward compatibility.** Every consumer of `CognitionContext` must tolerate unknown fields without error — deserialization must never fail because a newer field is present than the consumer was written to expect. This is what allows IntelligenceOS to ship new sections without requiring a synchronized BrandOS release.

**Versioning.** `CognitionContext.contractVersion` carries a semantic version of the contract itself, independent of either platform's own release versioning. A minor version increment means additive, backward-compatible change. A major version increment is the only mechanism through which a breaking change (field removal, type narrowing, semantic redefinition of an existing field) may occur.

**Deprecation.** A field is never removed directly. It is first marked deprecated in the contract's documentation, continues to be populated with correct data for at least one full major version cycle, and is only removed at the next major version boundary — with the deprecation, the reason for it, and the replacement field (if any) documented in this file at the time deprecation begins, not after.

**Semantic stability.** A field's *meaning* is part of the contract, not just its type. Changing what `voice.tone` means, even while keeping its type as `string`, is a breaking change subject to the same major-version rule as removing the field outright.

**No silent redefinition.** Any change to this document that alters an operation's or a field's responsibility as described in §3 or §4 is itself a contract change, and must be reviewed with the same rigor as a type change — prose in this document is normative, not descriptive.

---

## 6. Dependency Rules

**What BrandOS may import:** exactly `CognitionProvider`, `CognitionContext`, and their constituent types, from the published contract package — nothing else, from nowhere else. BrandOS's `cognition-client` package is the only place a concrete implementation of `CognitionProvider` is constructed; every other BrandOS package receives `CognitionProvider` as an injected interface and imports only its type.

**What IntelligenceOS may expose:** exactly one implementation of `CognitionProvider`, returning exactly `CognitionContext`-shaped data (or the other contract types — `CognitionSummary`, `CognitionAvailability`, acknowledgements). No IntelligenceOS module, class, repository, or internal type is ever exported for external use. If it is not one of the types defined in this document, it does not leave IntelligenceOS.

**Forbidden dependencies, stated exhaustively:**

- No BrandOS package may import anything from IntelligenceOS's internal modules (its knowledge, memory, pipeline, reasoning, or domain modules) under any circumstance, including for type-only imports.
- No IntelligenceOS module may import anything from any BrandOS package, in either direction, for any reason. IntelligenceOS's `domains/` extensibility point may model BrandOS as *a* consumer, generically, but must never import BrandOS's own types to do so.
- No BrandOS package other than `cognition-client` may construct or hold a concrete `CognitionProvider` implementation.
- No operation outside the five defined in §3 may exist between the platforms, regardless of transport (HTTP, RPC, shared database, message queue, or any other mechanism).
- No field may exist in any cross-boundary type that is not defined in this document — an ad hoc "just for now" field added to satisfy one call site is a violation the moment it is written, not a technical debt to clean up later.
- No shared mutable state of any kind between the platforms — not a shared database table both write to, not a shared cache, not a shared in-memory object. The contract types are the entire shared surface, and they are immutable by rule 5 in §2.

---

## 7. Design Principles

1. **One source of truth.** For any cognitive question, exactly one system can answer it authoritatively, and every other system that needs the answer asks that system through this contract.

2. **Business contracts over implementation contracts.** This contract is written in the language of brand outcomes — identity, voice, positioning — never in the language of either platform's internal architecture. A contract expressed in implementation terms is a leak waiting to happen; a contract expressed in business terms can survive a complete rewrite of either platform's internals untouched.

3. **Immutable cognition.** A `CognitionContext` is a snapshot, not a live object. It is resolved once, used, and discarded — never edited, never merged with local state, never treated as something that can be kept "up to date" by anything other than requesting a fresh resolution.

4. **Pure execution vs. pure cognition.** Every line of code in either platform is either purely about executing a request or purely about understanding a workspace. Code that is a little of both is a sign the boundary has already been crossed, even if no import statement proves it yet.

5. **No duplicated intelligence.** If a capability is described in §4, it exists in exactly one implementation, inside IntelligenceOS. A second, simplified, local, or "temporary" version of any cognitive capability — anywhere, for any reason — is a direct violation of this document.

6. **The contract is the product of this relationship, not a side effect of it.** Changes to how BrandOS and IntelligenceOS work together are changes to this document first. Code changes that alter the cross-platform relationship without a corresponding change here are not implementations of the architecture — they are departures from it.
