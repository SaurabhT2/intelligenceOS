# ADR-004 — Cognitive Consolidation: Synthesizing Knowledge and Experience into Derived Understanding

**Status:** Implemented
**Decision:** Generalized `ProfileBuilder`/`IntelligenceProfile` — the platform's existing precomputed,
versioned, off-critical-path synthesis mechanism — to also read a Subject's Knowledge
(`KnowledgeIntelligenceDomain`), not only its Experience (`Learning`s), and to produce three of the
six previously-unimplemented sections of `CognitionContext` (`knowledge`, `reasoning`,
`positioning`; `audience` and `guidance` remain out of scope — see §6). No new domain, no new
storage paradigm, no new pipeline orchestrator class — `ProfileBuilder` gained a Knowledge input
and a richer output shape; `ContextBuilder` gained a short, thin read of the result, following the
exact pattern `identitySynthesis.ts` already established for reading precomposed data ahead of
live composition.

---

## 1. Context

`ADR-003` established that Cognition is synthesized from two distinct inputs — Knowledge
(explicit, provenance-carrying, non-decaying) and Experience (corroborated, decaying,
behavioral) — and generalized `identity`/`voice` synthesis to draw on both. `PLATFORM_CONTRACT.md`
§5 specifies `CognitionContext`'s full eleven-section target vocabulary; five sections were
implemented before this ADR (`identity`, `voice`, `visualIdentity`, `confidence`, `provenance`),
six were not (`knowledge`, `reasoning`, `positioning`, `audience`, `guidance` — and `narrative`,
which the Engineering Blueprint's validation pass folded into `knowledgeSummary`'s named-framework
scope rather than a seventh separate field, once the actual extraction inputs were traced; see §5
of the Engineering Blueprint).

Separately, and prior to this ADR, `IntelligenceProfile` — the entity `ProfileBuilder` (Stage 6 of
the Learning Pipeline) precomputes for every Subject, versioned, rebuilt on a documented trigger
(>3 high-confidence Learnings since last rebuild, any permanent-stability-class change, or >60
days since last validation) — already carried a field named `vocabularySnapshot`. Read directly
against `pipeline/ProfileBuilder.ts` prior to this change: this field was populated exclusively
from `Learning` rows tagged `domain_specific_vocabulary`/`cultural_and_linguistic_context`. It had
never read `KnowledgeIntelligenceDomain.getAssets()`'s `extractedVocabulary` — the literal output
of the Knowledge Pipeline's document-vocabulary extractor, sitting in the same database, scoped to
the same Subject. This was the clearest available evidence that the platform's own design already
anticipated Knowledge feeding this kind of synthesized field, and that the implementation simply
hadn't caught up.

## 2. Problem

Three of `CognitionContext`'s unimplemented sections (`knowledge`, `reasoning`, `positioning`)
cannot be populated by a single-fact field read, the mechanism every implemented section used
before this ADR. Each answers a question about *patterns across many facts* — recurring themes,
conclusions beyond direct recall, market standing — not about any one stored `Learning` or
`KnowledgeAsset`. No component in the codebase performed that kind of computation. The closest
analog, `ProfileBuilder`, did the right *kind* of thing (precompute, version, cache, rebuild on
trigger) but only over one of the platform's two named inputs, leaving a structural gap that was
both a completeness problem (the contract's own target design was unfinished) and a
compounding-value problem (Knowledge accumulation produced no visible improvement in Cognition
outside one narrow, explicit-configuration path — Compliance Audit finding D-5).

## 3. Decision

1. **`ProfileBuilder` gains a Knowledge input.** Constructor now takes a `KnowledgeIntelligenceDomain`
   alongside `UserIntelligenceDomain`. `rebuildForSubject()` reads
   `KnowledgeIntelligenceDomain.getCurrentAssetsForSubject(subject)` (a new, Subject-generic
   method, mirroring the `...ForSubject` convention ADR-003 established) alongside its existing
   `getAllActiveLearningsForSubject()` read — never on the request path, exactly the boundary
   `ProfileBuilder` already respected for Experience.
2. **`IntelligenceProfile` gains three additive fields**, all typed `SynthesizedCollection<T> | null`
   (a new shared shape — see §4): `knowledgeSummary`, `reasoningSummary`, `positioningSummary`.
   `vocabularySnapshot` (existing field, unchanged type) is corrected to also read
   `KnowledgeAsset.extractedVocabulary` — a bug fix riding along with the generalization, not a
   new field.
3. **Rebuild triggers extend, not replace.** The existing three triggers (>3 high-confidence
   Learnings, a permanent-stability change, >60-day staleness) gain a fourth: a new or changed
   `isCurrent` `KnowledgeAsset` for the Subject, evaluated by a new, dedicated method
   (`shouldRebuildForSubjectFromKnowledge()`), debounced to at most one Knowledge-triggered rebuild
   per Subject per 5 minutes (`KNOWLEDGE_REBUILD_DEBOUNCE_MS`) to prevent a bulk-upload rebuild
   storm. All four triggers cause the same one rebuild executor (`rebuildForSubject()`), producing
   one new profile version — not a separate Knowledge-triggered rebuild path.
4. **The Knowledge trigger is wired through the existing event bus, not a new event.**
   `KnowledgeProcessor` already emitted `intelligence.signal.extracted` on extraction completion
   (`entityType: 'knowledge_asset'`) before this ADR — an existing, previously-unconsumed hook.
   `FeedbackProcessor` (the Learning Pipeline's existing orchestrator for milestone-event-triggered
   pipeline stages) gained a fourth entry point, `processKnowledgeExtraction()`, subscribed to this
   event, filtered to `entityType === 'knowledge_asset'`.
5. **`ContextBuilder` reads the current profile's new fields** to populate
   `CognitionContext.knowledge`/`.reasoning`/`.positioning`, the same thin, synchronous read it
   already performed for `identity`/`voice` — no new query pattern, no new latency characteristic
   on the critical path. `ContextBuilder` performs zero synthesis for these fields.
6. **No new domain, no new table, no new pipeline orchestrator.** `profiles` already had the
   versioning/`isCurrent` lifecycle this needed; `ProfileBuilder` already had the rebuild-trigger
   lifecycle; `UserIntelligenceDomain`/`WorkspaceIntelligenceDomain` already owned both.

## 4. Architecture

```
Knowledge (KnowledgeAsset, via KnowledgeIntelligenceDomain)  ─┐
                                                               ├─→  ProfileBuilder (rebuild-triggered,
Experience (Learning, via UserIntelligenceDomain)            ─┘      off critical path, debounced
                                                                       Knowledge trigger)
                                                                          │
                                                                          ▼
                                                              IntelligenceProfile (versioned,
                                                              cached; knowledgeSummary,
                                                              reasoningSummary,
                                                              positioningSummary: new
                                                              SynthesizedCollection<T> fields;
                                                              vocabularySnapshot: corrected;
                                                              expertiseDomains, voiceSummary,
                                                              goalSummary, constraintSummary,
                                                              preferenceSummary — unchanged)
                                                                          │
                                                                          ▼
                                                              ContextBuilder (thin, synchronous read,
                                                              contract-shape projection only)
                                                                          │
                                                                          ▼
                                                              CognitionContext.knowledge /
                                                              .reasoning / .positioning
                                                              (+ existing .identity / .voice,
                                                              unchanged mechanism)
```

### `SynthesizedCollection<T>` — the union-with-provenance shape

Unlike `identity`/`voice`'s singular-value fields (one `tone`, one `brandName`, combined via the
existing override rule — explicit Knowledge configuration replaces Experience-derived values),
`knowledge`/`reasoning`/`positioning`/`vocabularySnapshot` are genuinely **collections** — a
workspace can have several real, coexisting frameworks or themes at once. They combine via a
distinct, new rule:

- Gather every eligible item from Knowledge and Experience, each carrying its own confidence.
- **Deduplicate by normalized value** (case-insensitive, whitespace-trimmed exact match — a
  deliberately conservative rule; no fuzzy/embedding matching).
- On a tie, keep the higher-confidence item; if confidence ties, prefer the more recently observed
  item; if that also ties, prefer the Knowledge-sourced item.
- The collection's own `confidence` is the **maximum** across its items, not an average.
- Knowledge-sourced items are capped at a confidence ceiling (`KNOWLEDGE_EXTRACTION_CONFIDENCE_CEILING
  = 0.75`) below the 1.0 ceiling `explicit_statement`-tier Knowledge (e.g. `identityConfiguration`)
  can reach — extracted text is not the same epistemic tier as a human declaration.

### `positioning` is Experience-only

No Knowledge Pipeline extractor (`VocabularyExtractionResult`, `FrameworkExtractionResult`,
`PatternExtractionResult`) produces competitive/market framing. `positioningSummary` is sourced
exclusively from `competitive_intelligence`-tagged Learnings. This is a deliberate, documented
scope decision, not an oversight — see the Engineering Blueprint §0.1. A future Knowledge-side
positioning extractor is real, valuable follow-up work, correctly sequenced as its own decision.

## 5. Alternatives Considered

- **A Knowledge Graph / Intelligence Graph as the storage substrate.** Rejected. Applying
  `ADR-001`'s domain/ownership test directly: the demonstrated query need was aggregation over a
  Subject's own Knowledge and Experience, not traversal across a network of entities. A graph is a
  plausible future storage choice for `RelationshipIntelligenceDomain`'s still-unactivated scope,
  not a fit for this problem.
- **Live synthesis inside `ContextBuilder`, computed fresh per request.** Rejected. Breaks
  `PLATFORM_CONTRACT.md`'s critical-path rule; would make `resolveCognitionContext`'s cost scale
  with a workspace's total accumulated data instead of staying flat.
- **A new, separate "Synthesis" entity and pipeline, distinct from `IntelligenceProfile`.**
  Considered — rejected in favor of extending `IntelligenceProfile` because the lifecycle this
  capability needed (versioned, rebuild-triggered, cached, owned by the Subject's existing domain)
  was already `IntelligenceProfile`'s lifecycle exactly, and `vocabularySnapshot`'s existing
  half-implementation was direct evidence the platform's own design already intended this entity
  to carry this kind of content.
- **Mechanically fill in all remaining `CognitionContext` sections as single-fact reads, no
  synthesis.** Rejected — doesn't work for `knowledge`/`reasoning`/`positioning` by construction.
- **Do nothing further; leave the sections unimplemented indefinitely.** Rejected as the sole
  direction — a second DomainOS integrating before this gap closed was a real, growing risk of
  duplicated, locally-invented "positioning" logic elsewhere.

## 6. Consequences

- **Positive:** Closes Compliance Audit finding D-5 as a consequence of a correctly-scoped
  generalization, not a bespoke patch. Fixes `vocabularySnapshot`'s existing latent bug in the same
  change. Gives Knowledge a compounding return for the first time outside the narrow
  explicit-configuration path. Advances `CognitionContext` from 5/11 to 8/11 constitutional
  sections implemented, using entirely existing machinery. Generalizes for free to every future
  DomainOS this platform serves, with zero consumer-specific code.
- **Negative / trade-offs:** `IntelligenceProfile`'s shape grows (three new fields, plus a new
  shared `SynthesizedCollection<T>`/`SynthesizedItem<T>` shape that deliberately does *not* match
  the five pre-existing summary fields' plain-`Record` shape — see §4's Engineering Blueprint
  cross-reference, §0.2, for why this asymmetry is accepted rather than retrofitted in this
  change). `ProfileBuilder` gains a second data-source dependency, widening its blast radius
  slightly (mitigated: it reads Knowledge only through `KnowledgeIntelligenceDomain`, never a
  direct query — `RULE-PIPELINE-NO-DIRECT-DB` covers this automatically).
- **Resolved documentation gap (originally logged as an open follow-up, closed by IntelligenceOS
  Completion Plan, no code change):** §7's union rule calls for reusing "each source's own
  existing contradiction signal" to set `hasConflict`. On implementation, only Experience has one
  — a `Learning.state === 'FLAGGED'` value. `KnowledgeAsset` carries no persisted field indicating
  two *current* assets conflict with each other (its `version`/`isCurrent` mechanism only
  distinguishes historical from current, which synthesis never even sees — superseded versions are
  already excluded by `getCurrentAssetsForSubject()`'s `isCurrent` filter before synthesis runs).
  **Resolution: this ADR's own text is narrowed, rather than a Knowledge-side conflict signal being
  built.** No consumer has demonstrated a need for Knowledge-side conflict detection, and inventing
  a heuristic for "when do two `KnowledgeAsset`s conflict" without one would be exactly the kind of
  speculative machinery ADR-001 and ADR-003 already declined to build elsewhere in this platform.
  `hasConflict` is Experience-only by design until a real need demonstrates otherwise — see
  `docs/PLATFORM_CONTRACT.md`'s `knowledge`/`reasoning`/`positioning` field documentation, which
  states this plainly rather than as an open question.
- **Known implementation-time correction — `intelligence.signal.extracted`'s payload:**
  `processKnowledgeExtraction()` needs to resolve a `SubjectRef` (User or Workspace) for the
  uploaded asset, but the pre-existing emission of this event only carried `userId`, never
  `ownerType`/`workspaceId` (even though `KnowledgeProcessor` already had both values in scope at
  the emission point, for `persistAsset()` immediately above it — this was a true omission, not a
  missing capability). Fixed by adding `ownerType`/`workspaceId` to that one existing emit call.
  Not a redesign of `KnowledgeProcessor`'s responsibilities — the Knowledge Pipeline's own behavior
  is otherwise completely unchanged; this is a data-completeness fix to an event payload one of its
  existing emit sites already had the values for.
- **Known implementation-time correction — schema strategy.** The Engineering Blueprint's File
  Impact Matrix called for modifying `schema.sql`'s baseline `profiles` table directly. On
  implementation, `schema.sql`'s `profiles` table was found to still reflect the *pre-ADR-003*
  shape — neither `002_workspace_learning_owner.sql` nor `004_subject_centric_intelligence.sql`
  (both of which changed this exact table) had been folded back into the baseline
  (`IMPLEMENTATION_STATUS.md` §4 already documents this as this repository's established,
  demonstrated convention for profiles-table changes specifically). This ADR's schema change
  (`005_cognitive_consolidation.sql`) follows that same, already-established precedent — a
  migration file only, `schema.sql` untouched — rather than introducing a third, inconsistent
  convention.
- **Follow-up:** `audience` and `guidance` (the two `CognitionContext` sections this ADR does not
  address) need their own, separate scoping — `audience` likely extends the existing, already-real
  `AudienceProfile`/`AudienceCalibrator` rather than `IntelligenceProfile`; `guidance` has no
  obvious existing home and needs a first-principles pass of its own once a real consumer need is
  demonstrated.

## 7. Migration Strategy

No breaking changes. `IntelligenceProfile`'s three new fields default to `null` for every existing
profile row until its Subject's next natural rebuild — the same honest "nothing synthesized yet"
state ADR-003's `identity` already established. `CognitionContext`'s three new fields are
optional/nullable — every consumer must already tolerate unknown/absent fields per
`PLATFORM_CONTRACT.md`'s forward-compatibility rule, so no BrandOS-side change is required for
BrandOS to remain correct. Contract version bumped `1.0.0` → `1.1.0` (minor, additive) per
`PLATFORM_CONTRACT.md` §5's evolution rules. `@intelligence-os/core` bumped `0.3.0` → `0.4.0`
(minor) — `IIntelligenceProvider`'s public surface is unchanged; the bump reflects
`IntelligenceProfile`'s additive shape growth.

## 8. Repository Impact

See the Engineering Blueprint's §1 Repository Impact Matrix / File Impact Matrix for the complete,
exact list. Summary: `pipeline/ProfileBuilder.ts` and `pipeline/FeedbackProcessor.ts` (modified),
`domains/KnowledgeIntelligenceDomain.ts` (one new method), `context/ContextBuilder.ts` (modified),
`types/entities.ts` (new shared types, additive `IntelligenceProfile` fields),
`domains/UserIntelligenceDomain.ts` (new columns read/written), `knowledge/KnowledgeProcessor.ts`
(one emit-call payload completeness fix), `IntelligenceOS.ts`/`api/CognitionProviderImpl.ts`
(constructor wiring), `packages/cognition-contract/src/CognitionContext.ts` (three new sections,
this repository's copy only — the BrandOS-side duplicate copy is outside this repository's reach),
one new migration file. No file deleted. No public `IIntelligenceProvider`/`CognitionProvider`
method added or changed.
