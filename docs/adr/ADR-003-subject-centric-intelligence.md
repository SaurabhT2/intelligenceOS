# ADR-003 — Subject-Centric Intelligence: Generalizing IntelligenceOS Beyond the User

**Status:** Decided — target architecture. Implementation is not part of this decision record and is tracked separately (see [`IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) Known Issues and [`ROADMAP.md`](../ROADMAP.md)).
**Decision:** IntelligenceOS's intelligence model is generalized from **user-centric** to **subject-centric**. A **Subject** — the entity intelligence is accumulated for and synthesized about — is the platform's organizing concept. Two subject types exist today, **User** and **Workspace**, both served by the same Learning Pipeline, the same taxonomy, and the same confidence/decay machinery. No second, subject-specific pipeline may be built to serve a new subject type or a new consuming surface.

---

## 1. Context

IntelligenceOS was built around a single subject — the user — and every piece of that design (§9's Learning Pipeline, the 25-category taxonomy, the confidence-ceiling and corroboration model) is correct as far as it goes. A second public surface was later added for cross-repository consumers (`CognitionProvider`, §4 of `ARCHITECTURE.md`), scoped to a workspace rather than a user, to serve BrandOS and — by design — every future Domain Operating System built on this platform.

That second surface was given its own workspace-scoped read/write path (`ContextBuilder`, `WorkspaceIntelligenceDomain.upsertWorkspaceLearning`) instead of being connected to the existing Learning Pipeline. In production use, this produced two concrete, observed gaps: a workspace-scoped `CognitionContext` could never carry a real `identity` (hardcoded `null`, unconditionally), and workspace-scoped `voice` could not improve past its defaults regardless of how many observations a workspace accumulated, because nothing on that path ever ran real taxonomy classification — every write was hardcoded to a single category.

Both gaps trace to the same root cause, not two independent ones: the workspace-scoped path was built as a second, simplified pipeline sitting beside the real one, rather than as the real one serving a second subject. This is the specific pattern `PLATFORM_CONTRACT.md`'s Principle 5 ("no duplicated intelligence — a second, simplified, local, or temporary version of any cognitive capability anywhere is a direct violation") already names and forbids across the BrandOS boundary; it had reappeared inside this repository's own boundaries, between its two internal surfaces.

Two pieces of evidence already inside this codebase point at the correct fix:

- **Migration `002_workspace_learning_owner.sql`** already made `learnings.user_id` nullable specifically to let a `Learning` be owned by a workspace instead of a user, and its own comments already state plainly that a workspace's identity should be represented as workspace-scoped `Learning` rows, not a separate profile table — while explicitly declining to thread workspace-ownership through the rest of the pipeline as "materially larger than minimal" at the time.
- **`NarrativePlanner`** (§10, Blueprint Pipeline) already implements a real, working, documented composition pattern for exactly this problem on the User-subject surface — a fixed authority ordering (workspace-declared voice, then user voice, then archetype default, then system default) reading the same `WorkspaceIntelligenceDomain` data the workspace-scoped surface reads. The second surface never adopted this pattern; it re-derived a strictly weaker one from scratch.

This ADR closes the gap migration 002 anticipated, using the pattern `NarrativePlanner` already proved out.

## 2. Decision

### 2.1 — Subject is the organizing concept

A **Subject** is the entity IntelligenceOS accumulates intelligence for and synthesizes intelligence about. Two subject types exist today:

- **User** — a person. The original, most mature subject type; unaffected by this decision except in name (§3, "Core Concepts," now describes `IntelligenceProfile` in terms of "a Subject's" Learnings rather than "a user's").
- **Workspace** — a brand, team, or tenant. Promoted by this decision from a *scoping key* (a lookup used to find a compliance-constraints record and a bucket of shortcut-written rows) to a **first-class Subject**, standing beside User, with the same standing to accrue and own its own intelligence.

A Subject is never a lookup key for finding some other Subject's intelligence. A Workspace with no known individual owner is not a degraded case of the model — it is the ordinary case for many future consumers (a headless NewsletterOS workspace, a multi-editor MarketingOS workspace) and must resolve a real, synthesized identity from its own accumulated signals alone.

A third subject type (e.g., Organization) is explicitly **not** introduced by this decision. Per `ARCHITECTURE.md` §2's standing non-goal ("IntelligenceOS does not try to be maximally clever on day one"), a new subject type is added only when a real consumer demonstrates the need — see §5, Alternatives Considered.

### 2.2 — One Learning Pipeline serves every subject

The Signal → Observation → Hypothesis → Learning → Profile pipeline (`ARCHITECTURE.md` §9) is generalized to operate over a Subject reference rather than an assumed user. This is a generalization of the existing pipeline's parameters, not a new pipeline: classification, the quarantine gate, confidence ceilings, corroboration thresholds, and decay behavior are already subject-agnostic in what they do; they simply haven't yet been asked to do it for a second subject type.

Every observation, from any originating surface or any future Domain Operating System, is expected to enter this same pipeline, at the same `SignalExtractor` stage, and earn trust through the same corroboration gate. A second, hand-written, or "temporary" path that writes directly to a `Learning`-shaped row without passing through classification and corroboration — regardless of which subject type or which surface it's built for — is the specific pattern this ADR exists to rule out. `ARCHITECTURE.md` §11 Rule 12 codifies this as a standing rule, not a one-time fix.

### 2.3 — Identity is synthesized, not configured

Identity — a Subject's stable, cross-output voice and self-presentation — is an **emergent property of accumulated intelligence**, derived fresh at read time from a Subject's own Knowledge and Experience (§2.4). It is:

- **Synthesized**, the same way `ProfileBuilder` already synthesizes a User's `IntelligenceProfile` from active Learnings — generalized to any Subject, not reimplemented per subject type.
- **Not configured** — a caller never hands IntelligenceOS an identity payload to store and play back; it only ever contributes signals (behavioral, or explicit — §2.4) that identity is derived from.
- **Not duplicated** — there is exactly one synthesis path per Subject type's Cognition projection (Blueprint for User, `CognitionContext` for Workspace today), reusing the one authority-ordered composition pattern `NarrativePlanner` already established (§10), not a second, differently-coded projection function per surface.
- **Not stored independently from its underlying intelligence** — per §1's evidence from migration 002, there is no separate "identity" or "workspace profile" table. A Subject's identity is a view over its Learnings and Knowledge Assets, rebuilt on demand, exactly as `IntelligenceProfile` already is for a User.

Where a Workspace has a known contributing User, that User's own synthesized identity may compose into the Workspace's, additively, via the same authority-ordered pattern `NarrativePlanner` already uses (workspace-level signal outranking an individual contributor's, an individual's still outranking bare defaults) — but a Workspace's identity is never *required* to have a contributing User to exist. It accrues directly from the Workspace's own signals, the same way a User's does from theirs.

### 2.4 — Knowledge and Experience are the two inputs Cognition is synthesized from

This decision names, as a core architectural distinction, something the codebase already implements as two separate pipelines without previously naming the underlying concept:

- **Knowledge** — explicit information a Subject states or supplies directly (an uploaded playbook, a declared compliance requirement, an explicitly configured brand-voice setting). Modeled today as `KnowledgeAsset` and `WorkspaceContext.complianceConstraints`, extracted via the Knowledge Pipeline (`ARCHITECTURE.md` §10, "Knowledge Pipeline, briefly"). Knowledge does not require corroboration to be trusted — it requires provenance. It does not decay the way inferred intelligence does.
- **Experience** — learned behavioral and stylistic patterns accumulated through observation, requiring corroboration before they are trusted. Modeled today as `Learning`, produced only by the Learning Pipeline (§9). Experience decays according to `stabilityClass` and `decayRate`; nothing is trusted on a single observation.

**Cognition** (§2.5) is synthesized from both. A practical consequence: explicit, human-declared configuration (e.g., an admin-entered brand-voice override — `cognition-contract/README.md`'s "Known contract gap #2") is Knowledge, not a shortcut Experience signal. It should enter IntelligenceOS through the same kind of ingestion path a `KnowledgeAsset` already uses — a narrow, explicit, provenance-carrying write — and be read alongside Experience-derived Learnings when identity and voice are synthesized, rather than being merged externally by a calling DomainOS (which would be a second, uninspected copy of a cognitive judgment, forbidden by `PLATFORM_CONTRACT.md` Principle 5) or being hand-mapped into a fabricated `Learning` row (a violation of §2.2 above).

### 2.5 — Cognition is a projection, not a store

`CognitionContext` and `ArtifactBlueprint` are IntelligenceOS's two current projections of **Cognition**: the synthesized, point-in-time answer to "what does IntelligenceOS currently understand about this Subject." Cognition is assembled fresh on every read from a Subject's Knowledge and Experience; it has nothing of its own to persist and nothing of its own to decay. This was already true in practice (`CognitionContext.ts`'s own docblock: "resolved once, used, and discarded... never mutated") — this decision makes it an explicit, named architectural property rather than an implementation detail of one contract type, so it applies equally to `ArtifactBlueprint` and to any future Cognition projection a new surface might need.

## 3. What this changes, concretely (target state — not implemented by this ADR)

This ADR is a decision record, not an implementation plan; the following describes the shape of the change this decision commits the platform to, consistent with `ARCHITECTURE.md`'s existing "documented gap, not silently fixed" convention:

- The Learning Pipeline's classes accept a Subject reference instead of an assumed user identifier.
- Workspace-scoped observations are translated into `Signal`s and enter the pipeline at `SignalExtractor`, rather than being hand-mapped into an already-classified `Learning` row.
- `ContextBuilder` gains a real identity-synthesis path for the Workspace subject, using the same authority-ordered composition `NarrativePlanner` already implements, so `identity` and `voice` are both derived the same way for both of IntelligenceOS's current subject types.
- Explicit workspace-level configuration (persona overrides, brand-voice declarations) is ingested as Knowledge, through a narrow path modeled on the existing Knowledge Ingest precedent, rather than left unreachable or bolted onto the Learning Pipeline as a special case.

None of the above is asserted as done in this ADR. `IMPLEMENTATION_STATUS.md`'s Known Issues is the authoritative record of what is and is not yet built against this target.

## 4. Why this generalizes

This decision is deliberately shaped around what every Domain Operating System this platform is meant to serve — BrandOS today; SalesOS, MarketingOS, ProposalOS, NewsletterOS, and others tomorrow — will need identically: a workspace or account operated by any number of people (one, many, or none IntelligenceOS has any record of), whose accumulated intelligence should compound the same way a person's already does. Nothing in this decision is BrandOS-specific: no field, table, or rule introduced above references BrandOS, "brand," or any concept that doesn't already exist in this platform's own vocabulary (Subject, Knowledge, Experience, Cognition). A future DomainOS onboarding requires no consumer-specific logic anywhere in this repository — it calls the same five-operation `CognitionProvider` contract BrandOS already calls, against a Workspace subject that synthesizes its own intelligence regardless of which product is asking.

## 5. Alternatives considered

- **Add an optional `userId` to `CognitionRequest`, and resolve identity by calling the User-subject path when it's present.** Rejected. This activates identity only for the one shape of workspace BrandOS happens to operate today — a single-owner workspace — and leaves every multi-user or zero-owner workspace exactly as broken as before, for every future consumer. It also has no defined behavior for two contributing users, and it reintroduces, inside a single surface, the same "identity live in one case, silently absent in another" risk this repository's own capability audit already flagged as a top production risk. This is the specific shortcut §2.2's rule exists to prevent.
- **A separate `WorkspaceProfile` table, parallel to `IntelligenceProfile`.** Rejected, consistent with migration 002's own reasoning: it would duplicate `ProfileBuilder`'s synthesis logic behind a second schema rather than reusing it, the exact pattern Principle 5 and §2.2 forbid. A generalized `ProfileBuilder` operating over a Subject reference, reusing the existing `profiles` table, does the same job without a second implementation to keep in sync.
- **Introduce an `Organization` subject type now, anticipating future rollups.** Rejected for lack of a demonstrated need. `ArchetypeType`'s open-string-union pattern is the model to follow if and when a real consumer needs this — extend the subject-type union without redesigning the model around it, exactly as archetypes already do.
- **Model explicit brand-voice configuration as a high-confidence Signal into the Learning Pipeline (an `explicit_statement`-sourced observation).** Considered and rejected in favor of modeling it as Knowledge. Explicit, admin-declared configuration doesn't carry the risk profile the quarantine gate and corroboration thresholds exist to manage (a single inferred behavior being over-trusted); treating it as a corroboration-gated Experience signal would apply the wrong kind of scrutiny to something that is, definitionally, already ground truth. Knowledge's existing, lighter-weight provenance model fits it directly (§2.4).

## 6. Consequences

- **Positive:** Both runtime issues this decision responds to (a workspace-scoped `CognitionContext` with no identity; workspace voice unable to improve) close as a consequence of one generalization, not two separate patches — and the same generalization is what makes the platform genuinely ready for a second DomainOS, which neither issue's narrow, BrandOS-shaped fix would have achieved. `ARCHITECTURE.md` §9's and §10's existing descriptions of the Learning and Blueprint Pipelines required no structural rewrite — only naming an intent they already pointed toward.
- **Negative / trade-offs:** The pipeline classes' signatures widen (a Subject reference instead of a bare user id), which is a real, if mechanical, refactor touching every pipeline call site — sequenced as its own milestone rather than attempted inside this decision record. Until that refactor lands, the gap this ADR describes remains open in the running system; this ADR records the target, not the completion.
- **Follow-up:** `IMPLEMENTATION_STATUS.md` tracks the concrete, code-level steps and their current status. `ROADMAP.md` sequences them. This ADR is the decision both are measured against.

## 7. Relationship to other decisions

- **`ADR-001` (Visual Intelligence Domain Status)** reached its "not a new domain — a modality expressed through existing ones" conclusion using the same discipline this ADR applies to subjects: extend what already exists along a new dimension rather than building a parallel structure. The two decisions reinforce each other.
- **`ADR-002` (Apps Runtime Layer)** established that `packages/*` stays a pure, host-agnostic platform and `apps/*` owns runtime concerns. This ADR does not touch that boundary — the Subject generalization lives entirely inside `packages/intelligence-os`.
- **`PLATFORM_CONTRACT.md` §5** ("target design: the full contract") is updated alongside this ADR to state the Subject model as a first-class part of the contract's target design, and to add a seventh design principle ("one pipeline, many subjects") alongside its existing six.

## 8. Addendum — implementation status (added at the next code-level session)

§3 above states plainly that this ADR is a decision record, not an implementation, and that none of its four target-state bullets were asserted as done by it. All four have since been implemented, in a single session, following `ROADMAP.md`'s sequenced steps exactly:

1. **Subject reference threaded through the Learning Pipeline.** `types/subject.ts` (`SubjectRef = { subjectType: 'user' | 'workspace', subjectId: string }`). `SignalExtractor`, `ObservationBuilder`, `HypothesisEngine`, `LearningValidator`, and `ProfileBuilder` all operate on it. §6's stated trade-off ("the pipeline classes' signatures widen... a real, if mechanical, refactor touching every pipeline call site") was resolved without a breaking signature change anywhere: every pre-existing User-scoped method on `UserIntelligenceDomain` is retained, unchanged, as a thin wrapper over a new `...ForSubject` counterpart. This was a deliberate scoping choice beyond what §3 specified, made to keep the refactor's blast radius proportionate to its risk — see `IMPLEMENTATION_STATUS.md` for the full account.
2. **`ObservationInput → Signal[]` translation implemented** at `SignalExtractor.extractFromObservation()`, replacing the hand-mapped `context/observationToWorkspaceLearning.ts` this ADR's §1/§3 describes (that file has been deleted). `FeedbackProcessor.processObservation()` is the Workspace-subject pipeline orchestrator; `CognitionProviderImpl.observe()` calls it.
3. **`ContextBuilder` identity synthesis implemented** at `context/identitySynthesis.ts`, reusing `NarrativePlanner`'s authority-ordered composition pattern as §3 specified — projecting a Workspace subject's identity-relevant Learnings into an `IdentityContribution`, gated by confidence, highest-confidence-wins per field.
4. **Explicit workspace configuration ingestion implemented** — `IntelligenceOS.ingestWorkspaceConfiguration()` → `KnowledgeIntelligenceDomain.upsertWorkspaceConfiguration()`, persisting as a `KnowledgeAsset` per §2.4's reasoning, read by `ContextBuilder` with precedence over Learning-derived voice.

**Two things this addendum narrows, both flagged as separate, still-open decisions rather than folded into this implementation:**
- **A contributing User's identity is still not composed additively into a Workspace's.** §2.3's model contemplates it; `CognitionRequest` still carries no `userId` to identify one, so this session did not attempt it — see `IMPLEMENTATION_STATUS.md` Known Issues.
- **`ingestWorkspaceConfiguration()` is a concrete method, not yet part of `IIntelligenceProvider`, and not yet reachable over `CognitionProvider`'s HTTP surface.** Both are public-contract questions this ADR's own §2.4 does not settle and this implementation session deliberately did not settle either — consistent with Architectural Rule 7's treatment of public-contract changes as separate, considered decisions.

`IMPLEMENTATION_STATUS.md` is the authoritative, continuously-re-verified record of current status; this addendum records that the target state changed from "decided" to "implemented," not the ongoing detail.

## 9. Second addendum — independent audit verification and partial closure (added at the next code-level session)

An independent `ADR-003 Compliance Audit` was produced after §8's session and supplied as reference material (not source of truth) to the session that added this addendum, with an explicit instruction to re-verify every claim against source rather than implement its recommendations mechanically. Every claim it made was independently checked against the actual method bodies, types, and test suite; all were accurate. Disposition:

- **This addendum's own §8, item 2, is now accurate rather than aspirational.** The audit found `context/observationToWorkspaceLearning.ts` — which §8 already claimed was deleted — still present as unimported dead code. It has now actually been deleted.
- **§8's second narrowing bullet is now half-resolved.** `ingestWorkspaceConfiguration()` has been promoted onto `IIntelligenceProvider` (an additive, non-breaking interface change — Architectural Rule 7's "considered, separately-reviewed decision" happened this session, not skipped) and is now reachable over HTTP at `POST /v1/workspace-configuration`, a route sibling to `CognitionProvider` rather than a sixth `CognitionProvider` operation (consistent with `PLATFORM_CONTRACT.md` §5, which forbids the latter but says nothing about the former — `/v1/knowledge/ingest` already established this precedent). **Still open, unchanged:** a contributing User's identity is still not composed additively into a Workspace's; `CognitionRequest` still carries no `userId`.
- **§2.3's "Cognition is synthesized from both [Knowledge and Experience]" is now true of `identity`, not only `voice`.** `identitySynthesis.ts` previously drew only from Learnings (Experience) — the audit's principal finding. `WorkspaceConfigurationInput`/`WorkspaceContext` gained a Knowledge-sourced `identityConfiguration` field, symmetric with the existing `voiceConfiguration`, applied by `ContextBuilder` with the same authority (explicit declaration outranks inferred pattern) `voiceConfiguration` already had.
- **One gap the audit correctly identified as the largest remaining piece of this ADR's own text was deliberately not closed this session.** Ordinary document-extracted Knowledge (the general Knowledge Pipeline output every real upload produces — `VocabularyExtractionResult`, `FrameworkExtractionResult`, `PatternExtractionResult`) still has no path into `voice`/`identity` synthesis; only the narrow, explicit `upsertWorkspaceConfiguration()` path does. Closing this requires a genuine design decision (which extracted fields matter, at what confidence, ranked how against explicit configuration and Learnings), not a mechanical read-path fix, and this session's judgment was that inventing that heuristic under time pressure would itself be the kind of shortcut §2.2 and `ARCHITECTURE.md` §13 exist to prevent. Recorded as the top item in `IMPLEMENTATION_STATUS.md` §6 Recommended next steps.
- **A latent duplication risk, not a runtime bug, was also flagged and left open.** `identitySynthesis.ts`, `voiceMapping.ts`, and `NarrativePlanner` independently implement the same confidence-ordered field-merge pattern. No disagreement exists between them today; consolidating them into one shared helper is recorded as a contained follow-up, not urgent enough to justify touching three working modules under this session's scope.

See `docs/IMPLEMENTATION_STATUS.md` §3 (third session) for the full account, including test counts and the specific file changes.
