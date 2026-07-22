# IntelligenceOS — Vision

**Status:** Living document. This is the project's architectural north star — the thing every other
document, ADR, and PR should be consistent with. It is deliberately stable; it should change only
when the mission itself changes, not when an implementation detail does.

> This document is written for both human engineers and AI agents picking up this project cold.
> If you have only one document to read before touching this codebase, read
> [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) first — it is the canonical, code-accurate onboarding
> reference. This document sits one level above it: it explains *why* the architecture described
> there is shaped the way it is, and where it is deliberately headed.

---

## 1. Purpose

IntelligenceOS turns a Subject's accumulated context — what they've said, written, uploaded,
accepted, and corrected — into structured, machine-consumable understanding that a downstream
generation system can act on directly.

Two narrow, stable promises define the platform, regardless of which application is calling it:

1. **Before generation:** given everything validated about a Subject, produce a complete set of
   generation instructions (voice, structure, vocabulary, audience calibration, compliance
   constraints, conflicts already detected and resolved) — before a single word of an artifact is
   written.
2. **After delivery:** accept a report of what happened to that artifact (accepted, edited,
   rejected, deployed, critiqued) and use it to get measurably better next time.

Everything else the platform does — signal extraction, evidence accumulation, hypothesis
corroboration, learning validation, profile synthesis, knowledge ingestion, conflict resolution —
is an internal mechanism in service of those two promises. A calling application should never need
to know any of those internal names.

## 2. Long-Term Vision

IntelligenceOS is built to be the **single, canonical intelligence substrate** for any system that
generates artifacts — documents, posts, proposals, updates, or any other structured written
output — on behalf of a **Subject**. A Subject is a user, a workspace, or a future subject type not
yet built. The architecture is deliberately **subject-centric** rather than tied to any one calling
application or any one kind of subject: a Subject's accumulated intelligence is a durable asset
that should compound in value the more it's used, independent of which generation system is
consuming it this quarter, and independent of whether the Subject behind it is a person or a
workspace.

This is a generalization of the platform's original design, not a departure from it.
IntelligenceOS was first built around a single subject — the user. That design was already
correct; it simply hadn't yet been asked to serve a second kind of subject. **User** and
**Workspace** are today's two subject types; the architecture is designed so that a future subject
type extends the same model rather than requiring a redesign of it.

The system is designed to grow along three deliberately separated axes, each activated by real
demand rather than a calendar date:

- **Depth of intelligence per Subject** — from a flat default experience for a brand-new Subject,
  through a validated multi-dimensional profile, to (eventually) anticipatory generation that
  doesn't wait to be asked.
- **Breadth of context scope** — from Subject-only intelligence, to project-scoped intelligence, to
  workspace/team-scoped governance, to named-relationship-level audience calibration.
- **Confidence in what's learned** — every piece of intelligence enters as a low-confidence
  hypothesis and only becomes a trusted `Learning` after it survives a corroboration gate. Nothing
  is ever assumed correct just because it was inferred once.

The platform's intelligence is built from two structurally distinct, deliberately unmerged
categories of input, and this separation is one of the vision's most load-bearing ideas:

- **Knowledge** — explicit information a Subject states or supplies directly (an uploaded document,
  a stated preference, a declared configuration). Does not need corroboration to be trusted; it
  needs provenance.
- **Experience** — behavior inferred from accumulated observation (feedback on generated artifacts,
  corrections, patterns over time). Earns trust only through corroboration across multiple
  independent observations.

A Subject's synthesized understanding — its **Cognition** — is a point-in-time read over both,
never a stored blend of the two. Knowledge and Experience are allowed to corroborate each other
(see §4, Evidence), but a single Knowledge item is never permitted to become trusted, durable
intelligence by itself, no matter how confidently it's extracted. That gate is not friction to be
optimized away — it is the platform's central trust model.

## 3. Architectural Philosophy

These are the recurring judgment calls this codebase has already made, consistently, across every
major decision record. They are the lens future decisions should be evaluated through.

1. **Ship a real, bounded capability now, with an honest stub and a documented activation trigger
   for what comes later — never a half-built version of everything.** Visible throughout the domain
   layer: `RelationshipIntelligenceDomain` is fully inert behind a real, checked activation trigger
   rather than half-implemented; a third Subject type is explicitly not modeled until a real
   consumer demonstrates the need. This discipline is a feature, not a gap to be closed by filling
   in every stub at once.
2. **One pipeline, every subject/source — never a second, simplified, parallel version of a
   cognitive capability.** `PLATFORM_CONTRACT.md`'s Principle 5 names this directly, and `ADR-003`
   and `ADR-005` are both, at root, corrections of the same anti-pattern reappearing: a
   workspace-scoped path that re-derived a weaker version of the Learning Pipeline (`ADR-003`), and
   a rejected design that would have let Knowledge shortcut around the Hypothesis/corroboration
   gate entirely (`ADR-005` §2). When a new source or subject type needs to feed an existing
   capability, the answer is a new adapter into the existing pipeline, not a new pipeline.
3. **Descriptive and evidentiary synthesis are different concepts and must stay visibly separate.**
   What a Subject's current documents say right now (`knowledgeSummary`, `vocabularySnapshot`) is
   not the same claim as what a Subject has been shown, repeatedly, across sources and time
   (`Learning`, identity). Collapsing them — letting the descriptive read double as proof — was
   explicitly rejected in `ADR-005` and should be rejected again if proposed elsewhere.
4. **Every trust decision must be explainable, not just correct.** A promoted `Learning`'s
   confidence float alone cannot answer "which documents contributed, and why." `ADR-005`'s
   `evidence_trail` exists because a confidence number without provenance was judged insufficient —
   this standard should generalize to future trust-bearing mechanisms, not stay a one-off.
5. **A source-agnostic contract beats a source-specific one, even when only one source exists
   today.** `EvidenceExtractor` takes a generic `EvidenceSourceInput` envelope with exactly one
   producer (`KnowledgeAssetEvidenceAdapter`) today, specifically so a second producer (a connector,
   a web import, a repository, a conversation) is a new adapter file and one new enum value, not a
   parallel Stage-1-through-6 build. Prefer this shape whenever a "just this one case" design is on
   the table and a second case is foreseeable.
6. **Documentation drift is treated as a defect, tracked as such, and fixed by correcting the
   document — never by rewriting history to match it.** `ARCHITECTURE.md`'s own maintenance note
   states plainly: if the document disagrees with the source code, the source code is correct, and
   the disagreement is a bug in the document. Past ADRs are not rewritten to match current reality
   if reality has drifted — a dated addendum is added instead, and the drift is logged in
   `IMPLEMENTATION_STATUS.md`.
7. **Boundaries are enforced mechanically where possible, not just by convention.**
   `scripts/check-boundaries.mjs` checks `packages/intelligence-os`'s isolation from any consumer's
   source tree as a build-time rule, not a code-review reminder. Prefer a checked rule over a
   documented one whenever a boundary is worth having at all.

## 4. Core Architectural Building Blocks

A precise vocabulary, not a repetition of `ARCHITECTURE.md` §3's full glossary (read that for the
complete, current list) — the handful of concepts that most shape how the system is meant to grow:

- **Subject** — the organizing concept everything scopes to. Today: User, Workspace.
- **Knowledge Asset** — a document, playbook, framework, methodology, or template a Subject
  supplies directly. Feeds the platform through its own extraction pipeline (vocabulary,
  frameworks, structural patterns), independent of the Learning Pipeline.
- **Signal → Observation → Hypothesis → Learning** — the Learning Pipeline: the fixed path any
  candidate piece of intelligence travels, regardless of where it originated, from raw and
  unvalidated to durable and trusted. A `Hypothesis` only becomes a `Learning` after clearing a
  stability-class-specific corroboration threshold with no unresolved contradiction.
- **Evidence** (`ADR-005`) — the source-agnostic bridge that lets Knowledge feed the same Learning
  Pipeline Experience always has, via a generic `EvidenceSourceInput` envelope and a single
  evidence-quality gate, without ever letting a single document bypass corroboration. This is the
  mechanism that lets Knowledge and Experience corroborate the *same* Hypothesis.
- **Intelligence Profile** — the versioned, rebuilt-on-demand synthesis of a Subject's active
  Learnings into one queryable object (voice, goals, constraints, preferences, expertise,
  vocabulary). A derived snapshot, never itself a source of new intelligence.
- **Cognition** — the synthesized, point-in-time runtime projection of a Subject's current
  Knowledge plus Experience. Has two current projections: `ArtifactBlueprint` (in-process,
  User-subject) and `CognitionContext` (HTTP, Workspace-subject, the cross-repository contract with
  consumers like BrandOS).
- **The dual public surface** — `IIntelligenceProvider` (in-process, 6 methods, for a same-process
  consumer) and `CognitionProvider` (HTTP, 5 methods, for a cross-repository Domain Operating
  System consumer). Both are built from the same six domains and three pipelines; there is one
  engine and two doors into it.
- **Domains** — six bounded ownership areas (User, Project, Artifact, Knowledge, Relationship,
  Workspace Intelligence), each implemented as exactly one class that is the only code permitted to
  read or write its tables.
- **The Platform Contract** (`PLATFORM_CONTRACT.md`) — the explicit, named boundary between
  IntelligenceOS and any cross-repository consumer. The one place a consumer (BrandOS today, and by
  design any future Domain Operating System) is allowed to show up structurally in this repository.

## 5. Long-Term Roadmap

This is intentionally a shape, not a schedule — see [`ROADMAP.md`](./ROADMAP.md) for the current,
maintained, item-level plan, and [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) for what's
actually built today. Directional themes, roughly ordered by how close to activation they are:

1. **Close the remaining `CognitionContext` sections** (`audience`, `guidance`, and the rest of the
   eleven-section constitutional target) — each added only when a real consumer need drives the
   specific field, never speculatively.
2. **Grow the Evidence Bridge's producer set** — connectors, web imports, repositories,
   conversations — each as a new adapter into the existing `EvidenceExtractor`, per the pattern
   `ADR-005` established. No new evidence source should ever require a second Stage-1-through-6
   pipeline.
3. **Activate `RelationshipIntelligenceDomain`** once its documented trigger condition
   (≥3 external artifacts with named recipients, or an explicit onboarding signal) is real for an
   actual consumer, not before.
4. **Resolve the cross-repository contract-package duplication** (`@platform/cognition-contract`
   physically exists in two repositories today) once a shared registry or workspace-protocol
   mechanism is agreed with consumer-repository maintainers.
5. **Consider a third Subject type** only once a real consumer demonstrates the need, following the
   same open-string-union precedent `ArchetypeType` already sets — not designed against
   speculatively.
6. **Multi-user Workspace governance** (`WorkspaceIntelligenceDomain` Phase 2 — shared-vocabulary
   enforcement, a standards board, composing more than one contributing user's identity into a
   workspace's) once a genuinely multi-user consumer is scheduled.

## 6. Explicit Non-Goals

Stated plainly, because a system this extensible needs an equally explicit list of what it
deliberately does not try to be:

- **Not maximally clever on day one.** The architecture consistently prefers a real, bounded
  capability with a documented activation trigger over a half-built version of everything. This
  applies to every axis in §2 and every domain in §4 — do not "complete" a deliberately-partial
  capability without a real consumer need driving it.
- **Not a second intelligence system per consuming application.** Any application that generates
  artifacts on behalf of a Subject should be able to consume this platform rather than building its
  own parallel accumulation/synthesis logic. A consumer-side reimplementation of Learning Pipeline
  concepts is an architecture violation, not a valid integration.
- **Not a single-subject-type system, but also not a speculative multi-subject-type one.** Two
  subject types exist because two real consumers need them. A third is not pre-built.
- **Not a system where a single Knowledge item can unilaterally become trusted identity.** No
  future feature should reintroduce the "direct Knowledge → Learning promotion" shortcut `ADR-005`
  explicitly rejected, regardless of how confident the extraction is.
- **Not a system that infers durable facts from role-play, hypothetical statements, or momentary
  emotional state.** The Learning Pipeline's quarantine gate is a safety property, not a
  configurable default — a user adopting a persona, speculating, or venting must never be mistaken
  for a durable statement about who they are.
- **Not a hand-rolled cross-repository contract maintained by convention alone where a checked
  mechanism is feasible.** Boundary rules, published contract packages, and typed interfaces are
  preferred over "please don't do X" comments wherever real enforcement is practical.
- **Not a platform that treats its own documentation as optional.** Architectural decisions, known
  issues, and roadmap items are expected to stay reconciled with what's actually shipped — see §3
  item 6 above. A future agent should be able to trust this document set, not have to re-derive
  ground truth from source alone.

## 7. Relationship to Consumer Repositories

IntelligenceOS is designed to be consumed, not to depend on its consumers. Today's primary
consumer is BrandOS (this workspace's `BOS` repository), integrated exclusively through the
Platform Contract (`PLATFORM_CONTRACT.md`, `CognitionProvider`/`CognitionContext`) — a deliberate,
named boundary, not an incidental coupling. `packages/intelligence-os`'s own boundary rules
(`AGENT_CONTEXT.md`, `scripts/check-boundaries.mjs`) forbid any dependency, anywhere in its source,
on a consumer application's package or source tree. Future Domain Operating Systems are expected to
integrate the same way BrandOS does — through the published contract, not through a bespoke
integration path per consumer.

---

*This document should be updated when the mission, the philosophy, or the long-term roadmap shape
genuinely changes — not on every PR. If you're updating it because of a single implementation
detail, that detail almost certainly belongs in `ARCHITECTURE.md`, `IMPLEMENTATION_STATUS.md`, or
`ROADMAP.md` instead.*
