# IntelligenceOS — Architecture

**This is the canonical onboarding document for IntelligenceOS.** Read it before touching any code. It is written so that a new engineer or a new AI agent, with access to this repository alone, can become productive without asking anyone a question.

> **Maintenance note:** This document describes structure, ownership, and rules — things that change only when an architectural decision is made. If you find this document disagreeing with the source code, the source code is correct; treat the disagreement as a bug in this document and fix the document, not the other way around. Known, currently-unresolved disagreements are tracked in [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md)'s Known Issues section rather than hidden.

---

## 1. Mission

IntelligenceOS turns a user's accumulated context — what they've said, written, uploaded, accepted, and corrected — into a structured set of generation instructions (a **Blueprint**) that a downstream artifact-generation system can consume directly.

Concretely, IntelligenceOS exists to answer one question well: *given everything we've validated about this user, what should the next artifact look like before a single word of it is written?*

It does this through two narrow, stable promises to whatever system calls it:

1. **Before generation:** call `buildBlueprint(request)` and get back a fully-formed `ArtifactBlueprint` — sections, structure, voice, vocabulary, audience calibration, compliance constraints, and any conflicts that were detected and resolved along the way. This call always succeeds, even for a user IntelligenceOS knows nothing about yet.
2. **After delivery:** call `recordFeedbackEvent(event)` to report what happened (accepted, edited, rejected, deployed, or explicitly critiqued). This closes the loop — every recorded event is a chance for the system to get measurably better next time.

Everything else — signal extraction, hypothesis accumulation, learning validation, profile rebuilding, conflict resolution, knowledge ingestion — is an internal concern. The calling system never needs to know any of those names exist.

A second, narrower promise exists over HTTP instead of an in-process call, for any consumer that isn't running in the same process — today BrandOS, and, by design, any future Domain Operating System built on this platform — see §4.

## 2. Vision

IntelligenceOS is built to be the **single, canonical intelligence substrate** for any system that generates artifacts on behalf of a **Subject** — a user, a workspace, or a future subject type not yet built — documents, posts, proposals, updates, or any other structured written output. The architecture is deliberately **subject-centric** rather than tied to any one calling application or any one kind of subject: a subject's accumulated intelligence (its voice, goals, expertise, constraints, vocabulary) is a durable asset that should compound in value the more it's used, independent of which generation system happens to be consuming it this quarter, and independent of whether the subject behind it is a person or a workspace.

This is a generalization of the platform's original design, not a departure from it. IntelligenceOS was first built around a single subject — the user — and everything about that design (the Learning Pipeline, the taxonomy, the confidence and decay model) was already correct; it simply hadn't yet been asked to serve a second kind of subject. **User** and **Workspace** are today's two subject types (see §3, "Subject," and [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md)); the architecture is designed so a future subject type is an extension of the same model, not a redesign of it.

The system is designed to grow along three deliberately separated axes, each with its own activation trigger rather than a fixed calendar date:

- **Depth of intelligence per subject** — from a flat default experience for a brand-new subject, through a validated multi-dimensional profile, to (eventually) anticipatory generation that doesn't wait to be asked.
- **Breadth of context scope** — from subject-only intelligence, to project-scoped intelligence, to workspace/team-scoped governance, to named-relationship-level audience calibration.
- **Confidence in what's learned** — every piece of intelligence enters as a low-confidence hypothesis and only becomes a trusted `Learning` after it survives a corroboration gate. Nothing is ever assumed correct just because it was inferred once.

A non-goal worth stating explicitly: IntelligenceOS does not try to be maximally clever on day one. The architecture consistently chooses "ship a real, bounded capability now, with an honest stub and a documented activation trigger for what comes later" over "half-build everything." That pattern — visible throughout the domain layer (§6) — is intentional and should be preserved by future contributors, not "fixed" by filling in every stub at once. The same discipline applies to subject types: User and Workspace exist because real consumers need them today; a third subject type (an organization, say) is deliberately not modeled until a real need demonstrates it — see [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md) §5.

### A note on history

IntelligenceOS was originally conceived as a companion system to an existing product's brand-intelligence runtime (BrandOS), with an eventual integration path in mind. That context shaped some naming the code carried for a while — event types prefixed `brandos.*`, an npm scope of `@brandos/*` — but this has since been cleaned up: as of Epic 2 (Platform Publication), the npm scope is `@intelligence-os/*` and every event type shares the `intelligence.*` namespace. Comments that say "Source: BrandOS_..." still exist throughout the codebase, deliberately — they're accurate citations to the specification documents this system's design came from (now archived under [`archive/foundations/`](./archive/foundations/)), not a sign the cleanup is incomplete.

**Treat IntelligenceOS as a fully independent platform** — that's the current architecture, not just the goal. The one place BrandOS still shows up structurally is the cross-platform HTTP contract described in [`PLATFORM_CONTRACT.md`](./PLATFORM_CONTRACT.md) — a deliberate, named integration boundary, not a leftover dependency.

## 3. Core Concepts

These thirteen terms recur throughout the codebase. Knowing them precisely will make every file you open legible on the first pass.

| Concept | Definition |
|---|---|
| **Subject** | The entity intelligence is accumulated for and synthesized about — the organizing concept everything else in this table scopes to. Two subject types exist today, **User** and **Workspace** (see [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md)); the model is deliberately open to future subject types without redesign, and deliberately does not pre-build ones no real consumer needs yet. A Subject is never a lookup key for finding some other subject's intelligence — each subject accrues and owns its own. |
| **Signal** | A single raw, unvalidated observation extracted from an event (a feedback event, an upload, a conversation) about a Subject. Transient — never persisted to its own table; consumed immediately by the next stage. |
| **Observation** | A Signal after source-quality scoring and taxonomy classification. Carries a *confidence ceiling* determined by where it came from (an explicit statement caps higher than a single inferred behavior). |
| **Hypothesis** | An accumulating, not-yet-trusted proposition built from one or more Observations about a Subject. Lives in `PROVISIONAL` or `ACCUMULATING` state until it either earns enough corroboration to become a `Learning`, or is discarded/rejected. |
| **Learning** | A validated, trusted atom of intelligence about a Subject. Has a `stabilityClass` (`permanent` / `long_term` / `medium_term`) that determines how readily it can decay, and a `taxonomyCategory` (one of 25 — see §6) that determines what kind of fact it is. A Learning is IntelligenceOS's unit of **Experience** — behavior inferred from accumulated observation, corroborated before it's trusted — as distinct from **Knowledge** (see Knowledge Asset, below), which is explicit rather than inferred. |
| **Intelligence Profile** | The versioned, rebuilt-on-demand synthesis of a Subject's active Learnings into a single queryable object: voice, goals, constraints, preferences, expertise, vocabulary. Every rebuild increments the version and supersedes the previous one. This is Experience synthesized to a point-in-time snapshot — it is never itself a source of new intelligence, only a derived view of Learnings that already exist. |
| **Archetype** | A classification of *who a user professionally is* (founder, engineering leader, consultant, researcher, ...). Drives which structural and narrative defaults apply before any user-specific calibration exists. Currently a User-only concept — there is no workspace analog, and none is assumed to be needed. |
| **Knowledge Asset** | A document, playbook, framework, methodology, template, or reference a Subject (a user, a project, or a workspace) provides directly. Run through its own extraction pipeline (vocabulary, frameworks, structural patterns) independent of the Learning Pipeline. This is IntelligenceOS's unit of **Knowledge** — explicit information a Subject states or supplies directly, as distinct from **Experience** (see Learning, above), which is inferred from behavior and earns trust through corroboration. Knowledge does not need corroboration to be trusted; it needs provenance. |
| **Artifact Pattern** | A structural template for a type of generated artifact, at one of three levels of specificity: `universal` (everyone starts here), `archetype` (refined for a class of user), `user_calibrated` (refined for one specific user once they've accepted ≥2 artifacts of that type). |
| **Artifact Blueprint** | The single object `buildBlueprint()` returns for a User subject. Everything the generation system needs: section structure, narrative frame, voice/vocabulary directives, audience calibration, compliance requirements, and a transparent record of any conflicts that were detected and how they were resolved. One of Cognition's two current projections — see below. |
| **Cognition** | The synthesized, point-in-time runtime projection of a Subject's current Knowledge plus Experience — "what does IntelligenceOS currently understand about this Subject," assembled fresh on read. Cognition is never itself a storage model or a learning model; it has nothing to persist and nothing to decay — it is a *view* over Knowledge Assets and Learnings that already exist. It currently has two concrete projections, differing only in shape and transport, not in what they're derived from: **Artifact Blueprint** (in-process, User-subject, §10) and **`CognitionContext`** (HTTP, Workspace-subject today, §4 and [`PLATFORM_CONTRACT.md`](./PLATFORM_CONTRACT.md)). |
| **Conflict** | A structural tension between two intelligence sources that disagree about how an artifact should sound or what it should contain (e.g., a user's usual register vs. what a board audience expects). Conflicts are *expected*, not exceptional — every blueprint assembly run checks for them and resolves them via a fixed authority ordering. |
| **Domain** | One of six bounded ownership areas (User, Project, Artifact, Knowledge, Relationship, Workspace Intelligence), each implemented as exactly one TypeScript class that is the only code permitted to read or write its tables. `UserIntelligenceDomain` and `WorkspaceIntelligenceDomain` are the two domains that own a Subject's intelligence directly; the other four own intelligence that composes into a Subject's Cognition without being a Subject themselves. See §6 and §11. |

## 4. Two ways IntelligenceOS is consumed

IntelligenceOS exposes **two independent public surfaces**, both real, both maintained, serving two different integration shapes. Neither is a legacy path being phased out — they coexist because they solve different problems.

| | **`IIntelligenceProvider`** | **`CognitionProvider`** |
|---|---|---|
| Shape | In-process TypeScript interface, 6 methods | Cross-platform HTTP contract, 5 methods |
| Consumed via | `npm install @intelligence-os/core`, construct `IntelligenceOS` directly | HTTP calls to a deployed `apps/api` instance |
| Designed for | Any consumer willing to run IntelligenceOS in the same process/deploy | Any cross-repository Domain Operating System consumer — BrandOS today, by construction not by assumption (§2, "Vision"; [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md)) |
| Full detail | [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) | [`PLATFORM_CONTRACT.md`](./PLATFORM_CONTRACT.md) and [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) |

Both are built from the exact same six domains and three pipelines described in this document — `IntelligenceOS.asCognitionProvider()` constructs a `CognitionProviderImpl` from the same domain instances the concrete class already owns. There is one engine; there are two doors into it.

## 5. Repository Structure

```
intelligenceOS/                             (workspace root)
├── package.json                            root scripts: typecheck / test / test:coverage / clean / validate
├── pnpm-workspace.yaml                     workspace package glob
├── packages/
│   ├── shared-intelligence-types/          boundary types for the IIntelligenceProvider surface
│   │   └── src/
│   │       ├── ArtifactRequest.ts          ArtifactRequest, ArtifactType, AudienceReference
│   │       ├── ArtifactBlueprint.ts        ArtifactBlueprint and every sub-type it's built from
│   │       ├── FeedbackEvent.ts            FeedbackEvent (input shape), EditDiff, VocabularyChange
│   │       ├── IntelligenceSummary.ts      return type of getBrandSummary()
│   │       └── index.ts                   re-exports
│   │
│   ├── cognition-contract/                 boundary types for the CognitionProvider surface (§4)
│   │   └── src/
│   │       ├── CognitionContext.ts         the entire cognitive vocabulary BrandOS may see (see PLATFORM_CONTRACT.md)
│   │       ├── CognitionProvider.ts        the 5-method interface, plus createDegradedCognitionContext()
│   │       └── index.ts
│   │
│   └── intelligence-os/                    the engine
│       └── src/
│           ├── IntelligenceOS.ts           root class — implements IIntelligenceProvider, exposes asCognitionProvider()
│           ├── IIntelligenceProvider.ts    the published in-process provider contract
│           ├── index.ts                    public export surface (see INTEGRATION_GUIDE.md)
│           ├── errors.ts                   typed error hierarchy
│           ├── types/                      internal types (entities, domains, events) — not exported wholesale
│           ├── domains/                    the 6 domain stores — the only classes allowed to touch the DB per-table
│           ├── pipeline/                   Learning Pipeline: Signal → Observation → Hypothesis → Learning → Profile
│           ├── blueprint/                  Blueprint Pipeline: context → structure → narrative → conflict → assembly
│           ├── knowledge/                  Knowledge Pipeline: upload → vocabulary/framework/pattern extraction → validation
│           ├── events/                     IntelligenceEventBus interface + InProcessEventBus default
│           ├── context/                    ContextBuilder — assembles a CognitionContext from the domains (§4)
│           ├── api/                        CognitionProviderImpl, HealthChecker, the HTTP route handler
│           ├── compat/                     IntelligenceOSProvider — IIntelligenceProvider adapter
│           ├── dev/                        serve.ts — a standalone local-dev HTTP launcher (see Known Issues: this
│           │                               duplicates apps/api/src/server.ts; kept for now, not the recommended path)
│           ├── utils/                      internal helpers (e.g. the A–C classification compat shim)
│           └── db/
│               ├── schema.sql              the entire Postgres schema — authoritative, hand-maintained
│               ├── migrations/             schema changes not yet folded into schema.sql (apply before use)
│               └── queries/                placeholder folder for query-builder extraction — still empty, see
│                                            IMPLEMENTATION_STATUS.md Known Issues
│       └── tests/
│           ├── unit/                       one subfolder per pipeline/epic/milestone
│           └── integration/                full-stack tests with a mocked Supabase client
│
├── apps/
│   ├── api/                                the deployable runtime — hosts IntelligenceOS over HTTP (ADR-002)
│   ├── demo/                                integration-validation client (not a production UI)
│   └── playground/                          scaffold for a future interactive developer tool
│
└── docs/                                   (this documentation set)
```

**Two-layer shape, on purpose.** `packages/*` are the platform: reusable SDKs with no knowledge of any specific host, deployment target, or environment variable. `apps/*` are runtimes: the only place process lifecycle, environment loading, and deployment configuration are allowed to live. `apps/* → packages/*` dependencies are allowed; `packages/* → apps/*` must never happen. See [`ADR-002`](./adr/ADR-002-apps-runtime-layer.md) for the full reasoning.

Within `packages/intelligence-os`, a calling system should never need to import from `src/*` directly except via the package's public `index.ts`; if you find yourself reaching into `src/domains/` or `src/pipeline/` from outside the package, that's a signal something is being designed wrong, not a shortcut to take.

## 6. Package Responsibilities

### `@intelligence-os/shared-types` (`packages/shared-intelligence-types`)

Owns the contract types for the `IIntelligenceProvider` surface: what a request into IntelligenceOS looks like (`ArtifactRequest`), what comes back (`ArtifactBlueprint`), and what feedback looks like going in (`FeedbackEvent`). Zero runtime logic — types only, zero runtime dependencies.

### `@platform/cognition-contract` (`packages/cognition-contract`)

Owns the contract types for the `CognitionProvider` surface — the cross-repository boundary with BrandOS. Also type-only, zero runtime dependencies, with one exception: `createDegradedCognitionContext()`, a pure data-construction function both sides use so their fallback shapes can never drift apart. **This package is currently physically duplicated, byte-for-byte, in both the IntelligenceOS and BrandOS repositories** — there is no shared registry both can resolve against yet. See [`PLATFORM_CONTRACT.md`](./PLATFORM_CONTRACT.md) and `IMPLEMENTATION_STATUS.md`'s Known Issues.

### `@intelligence-os/core` (`packages/intelligence-os`)

Owns everything else. Internally it is nine sub-areas. The one rule that holds across all of them: **`IntelligenceOS.ts` is the only file a calling system should construct.** Every other class in this package is reachable only through it, directly or via the pipelines and builders it wires together.

#### `domains/` — the six Domain Stores

Each domain is a class that owns one set of tables and is meant to be the *only* code allowed to read or write them. This is the hardest boundary rule in the codebase (see §11) and the one most worth understanding before writing anything new. Status below is verified directly against each domain file's current method bodies, not against docblock claims:

| Domain | Owns (tables) | Real (implemented) | Still stubbed |
|---|---|---|---|
| `UserIntelligenceDomain` | `profiles`, `learnings`, `archetypes`, `hypotheses`, generic rows in `audience_profiles` | Everything — `getCurrentProfile`, `getActiveLearnings`, `getCurrentArchetype`, `getGenericAudienceProfile`, `upsertProfile`, `markPreviousProfilesNonCurrent`, `getAllActiveLearnings`, `countLearningsSince`, `insertLearning`, `getLatestValidatedLearning`, `confirmLearning`, the full Hypothesis CRUD (`findOpenHypothesis`/`createHypothesis`/`updateHypothesis`/`markHypothesisPromoted`/`discardExpiredHypotheses`), `reviewLearning`, `reviewLearningForWorkspace`, `countActiveLearnings`, `getTopTaxonomyCategories`. `upsertProfile`/`insertLearning` were stubs until the Completion Mission session closed Gap Analysis G-2 — see §11 Rule 1. Hypotheses were deliberately added to this domain rather than a seventh one; see this file's own header docblock for the reasoning. **ADR-003:** every read/write method scoped by a User (`getCurrentProfile`, `getAllActiveLearnings`, `countLearningsSince`, `markPreviousProfilesNonCurrent`, `findOpenHypothesis`, `createHypothesis`, `discardExpiredHypotheses`) now has a `...ForSubject` counterpart taking a `SubjectRef` instead — real for both User and Workspace subjects. The original names are unchanged, thin wrappers over the new ones. | *(none)* |
| `ProjectIntelligenceDomain` | `projects` | `getProject`, `getProjectByBrandosId`, `getActiveProjects`, `upsertProject`, `requireProject` | `updateLifecycleState` |
| `ArtifactIntelligenceDomain` | `artifact_patterns`, `artifact_exemplars`, `feedback_events`, `artifact_blueprints` | `getPattern`, `recordFeedbackEvent`, `persistBlueprint`, `markSignalsExtracted` (added in the Completion Mission session — backs `FeedbackProcessor`, which previously wrote `feedback_events.signals_extracted` directly with its own client) | `promoteExemplar` |
| `KnowledgeIntelligenceDomain` | `knowledge_assets` | `getAssets`, `getAssetById`, `requireAsset`, `persistExtracted` (added in the Completion Mission session — the real write path the Knowledge Pipeline now uses, taking a fully-extracted vocabulary/frameworks/patterns/visual-features payload), `upsertWorkspaceConfiguration` (ADR-003 §2.4 — persists explicit, admin-declared workspace voice/identity/compliance configuration as a `KnowledgeAsset` via `persistExtracted`; backs `IntelligenceOS.ingestWorkspaceConfiguration()`, now on `IIntelligenceProvider` and reachable at `POST /v1/workspace-configuration`), `getCurrentAssetsForSubject` (ADR-004 — Subject-generic read, mirroring `UserIntelligenceDomain`'s `...ForSubject` convention; `ProfileBuilder`'s sole Knowledge read) | `ingestAsset` — a *different*, narrower-signature method (raw un-extracted input, no extraction fields) explicitly deferred to Sprint 3 (Onboarding Intelligence); not the same gap `persistExtracted` closed |
| `WorkspaceIntelligenceDomain` | workspace-scoped knowledge assets, workspace-scoped `learnings`, compliance constraints | `getContext`, `getWorkspaceLearnings`, `upsertWorkspaceLearning` | `enforceComplianceConstraints`, `syncSharedVocabulary` — full multi-user governance is an explicit later capability, not an oversight |
| `RelationshipIntelligenceDomain` | `relationships`, named rows in `audience_profiles` | `checkActivationTrigger` (advisory only — see below) | Every method but `checkActivationTrigger` throws `DomainNotActivatedError`. Activates when a user has ≥3 external artifacts with named recipients, or via an explicit onboarding signal — see §6 Taxonomy note. `checkActivationTrigger()` (added in the IntelligenceOS Completion Plan execution session — see `IMPLEMENTATION_STATUS.md` §3) gives a real, tested answer to whether that trigger has fired, using `ArtifactIntelligenceDomain.countArtifactsWithNamedRecipients()`; it does not itself flip any switch — every other method here is unaffected by what it returns. Nothing else in the codebase calls into this domain yet. |

**On `WorkspaceIntelligenceDomain`'s target shape:** the table above states current implementation status only. Architecturally, `WorkspaceIntelligenceDomain` is one of the two domains that own a Subject's intelligence directly (§3, "Subject"; [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md)) — a workspace is a first-class subject the platform synthesizes intelligence *for*, not a scoping key used to find some other subject's intelligence. Its current methods (`getContext`, `getWorkspaceLearnings`, `upsertWorkspaceLearning`) are real and correct as far as they go. **As of ADR-003's implementation:** workspace-scoped observations (`CognitionProvider.observe()`) now enter the same Learning Pipeline a user's `FeedbackEvent`s do — see §9's "One pipeline, every subject" and `pipeline/SignalExtractor.ts`'s `extractFromObservation()`. `upsertWorkspaceLearning()` itself is unchanged and still available as a direct write for callers that genuinely want to bypass corroboration (it remains real, tested, and correctly scoped) — it's simply no longer the path `observe()` uses.

#### `pipeline/` — the Learning Pipeline

Six classes, wired together by exactly one orchestrator (`FeedbackProcessor`), implementing the Signal → Observation → Hypothesis → Learning → Profile flow described in §8. This is background processing — it runs off the event bus after a `recordFeedbackEvent()` call, never synchronously during blueprint assembly.

#### `blueprint/` — the Blueprint Pipeline

Five classes plus two internal helpers, implementing the assembly flow described in §9. `BlueprintBuilder` is the orchestrator; everything in `blueprint/internal/` is private to this pipeline.

#### `knowledge/` — the Knowledge Pipeline

Six classes implementing upload → normalize → extract (vocabulary / frameworks / structural patterns / visual features) → validate → persist, orchestrated by `KnowledgeProcessor`.

#### `events/` — the Event Bus

One interface (`IntelligenceEventBus`) and one production-grade default implementation (`InProcessEventBus`: synchronous, in-memory, fire-and-forget with per-handler error isolation). This is the seam a calling system uses to observe pipeline milestones if it wants to (it never has to).

#### `context/` — CognitionContext assembly (§4's HTTP surface)

`ContextBuilder` composes a `CognitionContext` by reading from `WorkspaceIntelligenceDomain`. This is the one module permitted to assemble that contract; `api/` calls it for reads but never assembles the shape itself. **Implemented (ADR-003):** the same subject-synthesis pattern §10's Blueprint Pipeline uses for a User subject — a fixed authority ordering over a subject's own accumulated Knowledge and Experience — generalized so `ContextBuilder` produces a real, non-default `identity` for a Workspace subject the same way it already produces a real, non-default `voice` (`context/identitySynthesis.ts`), and applies explicit workspace configuration (Knowledge — both `voiceConfiguration` and, as of the ADR-003 audit-closure session, the symmetric `identityConfiguration`) ahead of Learning-derived voice and identity respectively. `identity` still resolves to `null` for a workspace with neither identity-relevant Learnings nor an explicit `identityConfiguration` yet — the honest "nothing learned or declared yet" state, not an unimplemented path. See [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md).

**Implemented (ADR-004, Cognitive Consolidation):** `ContextBuilder` also reads a Subject's current `IntelligenceProfile` (via `UserIntelligenceDomain.getCurrentProfileForSubject`) and projects three of its fields — `knowledgeSummary`/`reasoningSummary`/`positioningSummary` — into `CognitionContext.knowledge`/`.reasoning`/`.positioning`. This closes the gap the previous paragraph used to describe here (ordinary document-extracted Knowledge having no path into Cognition, Compliance Audit finding D-5) — but the fix lives in `pipeline/ProfileBuilder.ts`, not in this class: `ContextBuilder` performs zero synthesis for these three fields, exactly the same discipline it already applies to `identity`/`voice`. See [`ADR-004`](./adr/ADR-004-cognitive-consolidation.md).

#### `api/` — the CognitionProvider implementation

`CognitionProviderImpl` (implements `CognitionProvider`), `HealthChecker`, and the HTTP route handler (`createCognitionHttpServer`) that `apps/api` hosts. See [`PLATFORM_CONTRACT.md`](./PLATFORM_CONTRACT.md) for the full contract and [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) for the routes.

#### `compat/` — the IIntelligenceProvider Adapter

One class, `IntelligenceOSProvider`: a thin adapter implementing `IIntelligenceProvider` over an injected `IntelligenceOS` instance, for calling systems that want to depend on an interface for dependency injection rather than a concrete class. Deliberately stays thin — must never grow business logic of its own.

#### `dev/` — local-dev HTTP launcher

`serve.ts`: a standalone script that wires a real Supabase client into `IntelligenceOS` and exposes it over HTTP locally. **This now duplicates `apps/api/src/server.ts`** (see `IMPLEMENTATION_STATUS.md` Known Issues) — prefer `apps/api` for anything beyond a quick local check.

#### `types/` — internal type definitions

`entities.ts` (16 of the 24 logical entities — see §6), `domains.ts` (domain-internal input/filter types, including `WorkspaceLearningInput`), `events.ts` (the 14-member event type union and its 9 payload contracts). Not all of this is re-exported from the package's public `index.ts` — see [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) for the maintained, annotated list of what actually is.

#### `db/`

`schema.sql` is the single source of truth for the Postgres schema: 13 tables, all under the `intelligence` Postgres schema (never `public`), with row-level security policies and seed data for the five universal artifact patterns. It now includes `artifact_blueprints.degraded`/`.confidence_score` columns, added directly to the baseline during the Completion Mission session (not yet applied to any live database — see `IMPLEMENTATION_STATUS.md`). `migrations/` holds schema changes made *after* `schema.sql` was last regenerated from a live database — currently one migration (`002_workspace_learning_owner.sql`, making `learnings.user_id` nullable for workspace-only learnings), not yet folded into `schema.sql` itself and not yet applied to any live database in this environment. `db/queries/` is six empty placeholder files awaiting query-builder extraction "when complexity warrants it" — still empty, still unreferenced by anything.

### `apps/*` — deployable runtimes

Per [`ADR-002`](./adr/ADR-002-apps-runtime-layer.md): the only places allowed to know about environment variables, process lifecycle, and deployment platform config.

| App | Purpose |
|---|---|
| `apps/api` | The production deployment target (`https://intelligence.saurabhtiwariai.com`). Two entrypoints sharing one request handler: a traditional Node server (`src/server.ts`) and a Vercel Node Function (`api/cognition.ts`). Hosts the `CognitionProvider` HTTP surface only — see `PLATFORM_CONTRACT.md`. |
| `apps/demo` | An integration-validation client. Calls all HTTP routes against a running `apps/api` instance using nothing but published contract types, to prove the platform is reachable independent of any consumer. Not a production UI. |
| `apps/playground` | A scaffold only — currently just confirms the workspace wiring resolves. Future interactive developer tool. |

## 7. The `AGENT_CONTEXT.md` convention

Beyond this document, individual directories inside `packages/intelligence-os/src/` (`domains/`, `pipeline/`, `blueprint/`, `knowledge/`, `events/`, `db/`, `compat/`) each carry their own `AGENT_CONTEXT.md`, and each package root should carry one too. Three layers, three different jobs, deliberately not overlapping:

1. **This document** — the *why* and the *whole-system* shape. Read once, fully, before writing any code.
2. **`AGENT_CONTEXT.md` files** — the *boundary rules and current pitfalls* for one specific area, read immediately before working in that area. Hand-maintained, because "what's a common mistake here" is a judgment call, not a mechanically derivable fact.
3. **Per-file docblocks** — the *current exact status* of one file (what's real, what's stubbed). These drift fastest and should be trusted least when they disagree with actual method bodies — see §6's domain table above for an example of checking a docblock's claim against the code and finding it stale.

A directory earns an `AGENT_CONTEXT.md` if it's (a) a bounded ownership unit with its own dependency rules, and (b) large or sensitive enough that a contributor working inside it needs boundary rules beyond what this document already covers. `types/` deliberately doesn't have one — it has no behavior and no dependency rules beyond "stay a pure type-definitions directory," which is already stated in one line at the package root.

**Resolved:** `packages/intelligence-os`'s own package-root `AGENT_CONTEXT.md` now lives at `packages/intelligence-os/AGENT_CONTEXT.md`, inside the package it describes, rather than at the repository root. See `IMPLEMENTATION_STATUS.md` for the record of this fix.

## 8. Domain Model

IntelligenceOS's logical entity model defines 24 first-class entities. 16 of them have concrete TypeScript shapes in `types/entities.ts`; the rest are either owned by another package, embedded as JSONB sub-structures rather than standalone tables, or are pipeline-internal and transient.

| Entity | Where it lives | Why |
|---|---|---|
| `IntelligenceProfile`, `Archetype`, `Learning`, `Hypothesis`, `Signal`, `ArtifactPattern`, `ArtifactExemplar`, `KnowledgeAsset`, `Project`, `Relationship`, `AudienceProfile`, `WorkspaceContext`, `FeedbackEventRecord` | `types/entities.ts` | Persisted entities with concrete tables |
| `ArtifactBlueprint`, `FeedbackEvent` (input shape) | `shared-intelligence-types` package | Cross the `IIntelligenceProvider` boundary; owned by the contract package, not the engine |
| `User`, `Artifact` | Referenced by ID only (`UserId`, `ArtifactId` type aliases) | Owned externally |
| `Goal`, `Constraint`, `Preference`, `Framework`, `Operating Principle`, `Vocabulary Model` | Embedded JSONB sub-structures on `IntelligenceProfile` / `Project` | Owned by `ProfileBuilder`'s internal structuring logic, not standalone |
| `Observation` | `pipeline/types.ts`, transient | Pipeline-internal; never persisted, never reaches any public API |
| `Conflict` | Modeled only as `DetectedConflict` / `ConflictResolution` inside `ArtifactBlueprint` | Ephemeral per the current contract — not yet a standalone persisted entity |

### Taxonomy

Every `Learning` carries a `taxonomyCategory` — one of exactly 25 fixed string values, from `professional_identity` down to `personal_brand_signal` (full list in `types/entities.ts`). Each category has a `stabilityClass` (`permanent` | `long_term` | `medium_term`) that determines decay behavior and the corroboration threshold required to promote a `Hypothesis` into a trusted `Learning`. Do not add a 26th category casually — every category has a downstream weight in `ProfileBuilder`'s composite-confidence scoring and a corroboration requirement in `HypothesisEngine`; adding one means updating both.

**On visual modality (color, typography, layout, mood, motion):** these are not a separate domain and never have been — they're style/identity/structure/governance facts expressed through a visual channel instead of a verbal one, and they belong inside the existing six domains exactly the way text-voice facts do. See [`ADR-001`](./adr/ADR-001-visual-intelligence-domain.md) for the full reasoning.

### Archetypes

`ArchetypeType` is an open string union (16 named values plus `| string` as an escape hatch), deliberately not closed: archetype classification is expected to grow as real user data comes in.

## 9. Learning Pipeline

The path from "the user did something" to "the system durably knows something new about them."

```
FeedbackEvent (or other input)
       │
       ▼
SignalExtractor        — classify source, apply the quarantine gate (see below), emit 0..N Signals
       │
       ▼
ObservationBuilder      — score source quality → assign a confidence ceiling, attach taxonomy category
       │
       ▼
HypothesisEngine        — match against existing Hypotheses (corroborate / contradict) or create new ones;
       │                  drive the state machine: PROVISIONAL → ACCUMULATING → VALIDATED / DISCARDED / REJECTED
       ▼
LearningValidator        — check corroboration threshold + unresolved contradictions; promote to a Learning
       │                   (state: VALIDATED), assign stabilityClass + decayRate
       ▼
ProfileBuilder           — decide whether the accumulated changes warrant a profile rebuild; if so, version
                            the profile, recompute composite confidence, emit `intelligence.profile.updated`
```

**Orchestration.** `FeedbackProcessor` is the only place these six classes are wired together. It subscribes to `intelligence.artifact.feedback` on the event bus and runs every signal produced by an event through the full pipeline, never letting one stage's failure stop the others — failures are collected into `PipelineRunResult.errors` and the run continues. This graceful-degradation behavior is load-bearing: a new user with zero profile, a feedback event with no project, or one failing extractor must never abort the whole pipeline run.

**One pipeline, every subject (implemented — [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md)).** The diagram above is drawn from `FeedbackEvent`, a User-subject input, but the same six classes now serve a Workspace subject too: `SignalExtractor.extractFromObservation()` translates a `CognitionProvider.observe()` payload (`ObservationInput`) into Signals at the same Stage 1 a `FeedbackEvent` enters at, and every subsequent stage — the quarantine gate, confidence ceilings, corroboration, decay — runs unmodified, because none of it was ever specific to the User subject; each stage already operated on rows and thresholds keyed by a `SubjectRef` (`types/subject.ts`), not a hardcoded notion of "user." `FeedbackProcessor.processObservation()` is the Workspace-subject orchestrator, mirroring `process()`'s existing User-subject orchestration exactly. There is no second, hand-written path that skips classification or corroboration for either subject type — `WorkspaceIntelligenceDomain.upsertWorkspaceLearning()` remains available as a direct write for a caller that deliberately wants to bypass the pipeline, but `CognitionProviderImpl.observe()` itself no longer uses it.

**The quarantine gate.** Before anything is extracted, every signal is checked against three flags: `role_play`, `hypothetical`, `emotional_state`. A signal carrying any of these is discarded immediately unless it carries an explicit identity declaration overriding the flag. This is the single most important safety property of the Learning Pipeline: a user adopting a persona for a task, speculating about a hypothetical, or venting in the moment must never be mistaken for a durable statement about who they are.

**Confidence ceilings.** A `Signal`'s source determines the maximum confidence any `Observation` built from it can ever carry, regardless of how many times it's corroborated:

| Source quality | Ceiling |
|---|---|
| `explicit_statement` | 1.00 |
| `demonstrated_behavior` | 0.90 |
| `uploaded_artifact` | 0.90 |
| `inferred` | 0.35 |

**Corroboration thresholds** (how many independent observations a Hypothesis needs before `LearningValidator` will promote it), by stability class:

| Stability class | Required corroborations |
|---|---|
| `permanent` | 2 |
| `long_term` | 3 |
| `medium_term` | 2 |

**Correction override.** An `intelligence.user.correction` event is the one input designed to bypass every gate above: `FeedbackProcessor.processCorrection()` routes it straight to `LearningValidator.maybeConfirm()`, which applies it immediately as a `CONFIRMED` learning via `UserIntelligenceDomain.confirmLearning()` — no corroboration wait, no quarantine check. **The handler side is real and tested** (`tests/unit/pipeline/UserCorrection.test.ts`), but as of this snapshot **there is no public method that emits this event** — `IntelligenceOS.recordCorrection()` (or an `IIntelligenceProvider` equivalent) doesn't exist yet, so nothing in this codebase currently triggers this path end-to-end. See `IMPLEMENTATION_STATUS.md` Known Issues.

**Why Signals and Hypotheses aren't written to their own pipeline-managed tables the way the schema suggests:** `intelligence.signals` and `intelligence.hypotheses` *do* exist as real tables in `schema.sql`, and `HypothesisEngine`/`LearningValidator` genuinely read and write `intelligence.hypotheses`/`intelligence.learnings` — but `SignalExtractor` deliberately keeps Signals in-memory rather than writing them, a documented early-stage scope decision. Worth knowing if you're debugging why `intelligence.signals` stays empty in a live database: that's expected with the current implementation, not a bug.

## 10. Blueprint Pipeline

The path from "the generation system is about to create an artifact" to "here is everything it needs to know to do that well."

```
ArtifactRequest
       │
       ▼ (Step 1 — parallel fetch, every call independently fails-soft to null/[])
   ┌───────────────┬──────────────────┬───────────────────────┬──────────────────────┐
   │ current        │ current archetype │ ProjectContextBuilder  │ AudienceCalibrator    │
   │ profile        │                   │ (project + workspace   │ (generic audience    │
   │                │                   │  + project-scoped      │  profile, falls back  │
   │                │                   │  learnings + knowledge │  to system defaults)  │
   │                │                   │  assets)               │                       │
   └───────────────┴──────────────────┴───────────────────────┴──────────────────────┘
       │
       ▼ Step 2 — StructurePlanner: pick sections + depth
         (priority: user_calibrated pattern → archetype pattern → universal pattern → FALLBACK_SECTIONS)
       │
       ▼ Step 3 — NarrativePlanner: assemble voice + vocabulary directives (synchronous, pre-loaded data only)
       │
       ▼ Step 4 — detectConflicts(): compare what the user's intelligence prefers against
         what workspace/audience/project actually require
       │
       ▼ Step 5 — ConflictResolutionModel: resolve every detected conflict via the fixed
         authority ordering (below)
       │
       ▼ Step 6 — extract compliance requirements from workspace context
       │
       ▼ Step 7 — assemble the ArtifactBlueprint (stable id, full audit trail of what was
         detected and how it was resolved, plus `degraded` / `confidenceScore` / `buildDurationMs`)
       │
       ▼ Step 8 — persist + emit `intelligence.blueprint.built` — both fire-and-forget;
         the blueprint is returned to the caller even if either fails
```

**The one guarantee that overrides everything else in this pipeline:** `buildBlueprint()` must always succeed and always return a usable blueprint — for a brand-new user with zero stored intelligence, for a request with no `projectId` or `workspaceId`, for an artifact type that isn't one of the five seeded universal patterns. Every step above is written to degrade to a documented default rather than throw.

**`degraded`, precisely.** `degraded: true` means a Step-1 intelligence fetch **errored** and fell back to its documented fail-soft default — it does **not** mean "this data doesn't exist." A brand-new user with no stored profile gets `degraded: false`, because the system correctly used defaults; nothing failed. Implemented via a shared `trackedCatch()` helper (`blueprint/internal/trackedFetch.ts`) that distinguishes "the fallback fired because of a genuine error" from a bare `.catch(() => null)`, which cannot.

**`confidenceScore`, precisely.** `clamp01(0.7 × profile.compositeConfidence + 0.3 × audienceCalibration.confidence)`, where `profile.compositeConfidence` is `0` when no profile exists. Deliberately **not** reduced when `degraded` is true — degradation and confidence answer different questions ("did something fail just now" vs. "how much do we actually know about this user").

**Authority ordering** (Step 5's resolution rules, highest to lowest):

```
USER_CORRECTION (10) > EXPLICIT_INSTRUCTION (9) > USER_ESTABLISHED_PATTERN (8)
  > WORKSPACE_COMPLIANCE (7) > PROJECT_CONTEXT (6) > AUDIENCE_CALIBRATION (5)
  > ARCHETYPE_INTELLIGENCE (4) > UNIVERSAL_PATTERN (3) > SYSTEM_DEFAULT (2)
```

Four named rules sit on top of this ordering and are checked in this sequence:

1. **COMPLIANCE** — a workspace compliance requirement always wins, full stop. This is the *Immutability Rule*: no other authority, including an explicit user correction, can override it.
2. **WORKSPACE** — for non-compliance conflicts where one side is workspace-scoped, workspace still wins for general governance.
3. **RECIPIENT** — for register conflicts between the user's usual voice and what an audience expects, the audience wins.
4. **PROJECT** — for vocabulary conflicts, the project's vocabulary model wins over the user's general vocabulary for project-scoped content.

Anything else falls through to plain authority-level comparison. When a resolution represents a *significant* departure from what the user would normally expect, a human-readable transparency note is attached to the resolution (the **Transparency Rule**).

**This ordering is the reference pattern for subject composition, not a User-only mechanism.** `NarrativePlanner` already resolves voice for a User subject through a layered hierarchy — workspace-declared voice, then the user's own established voice, then archetype defaults, then system defaults — reading the same `WorkspaceIntelligenceDomain` data `ContextBuilder` (§6, `context/`) reads for the HTTP surface. **Implemented (ADR-003):** Workspace-subject Cognition (§4) uses the same layered composition, not a separately invented one — `context/identitySynthesis.ts` synthesizes a workspace's own identity from its accumulated Learnings, and `context/ContextBuilder.ts` applies explicit workspace configuration (Knowledge — `voiceConfiguration` and `identityConfiguration`) ahead of it, mirroring this section's authority ordering rather than reinventing it. A contributing User's own identity is deliberately not composed in additively yet — `CognitionRequest` carries no `userId` to identify one (see `ADR-003` §2.3) — so today's Workspace identity is synthesized purely from the workspace's own Knowledge and Learnings. A second, differently-implemented composition rule for the same kind of decision is exactly what Rule 12 below forbids.

**Knowledge Pipeline, briefly:** runs independently of the above two (upload → normalize → extract vocabulary/frameworks/structural patterns/visual features → validate confidence → persist), feeding `KnowledgeAsset` rows that `ProjectContextBuilder` and `NarrativePlanner` read from. It is heuristic-only by design — no LLM calls inside any extractor — which keeps it deterministic and fast at the cost of being less semantically sophisticated than an LLM-based extractor would be.

## 11. Architectural Rules

These are the rules a pull request can be rejected for violating. Each is load-bearing for a specific failure mode the architecture is designed to prevent.

1. **One domain, one set of tables, one writer.** Each of the six domain classes owns a disjoint set of `intelligence.*` tables. No domain may write to another domain's tables, and no code outside the domains layer may write to `intelligence.*` directly. *(Resolved in the Completion Mission session, previously tracked here as an open exception: `HypothesisEngine`, `LearningValidator`, `ProfileBuilder`, and `KnowledgeProcessor` used to hold a raw Supabase client and write to `intelligence.hypotheses`, `intelligence.learnings`, `intelligence.profiles`, and `intelligence.knowledge_assets` directly. All four now take a domain instance — `UserIntelligenceDomain` or `KnowledgeIntelligenceDomain` — through their constructor instead, and `UserIntelligenceDomain.upsertProfile()`/`.insertLearning()` are real implementations rather than stubs. A related instance in `FeedbackProcessor.ts` itself, found during the same pass, was fixed the same way via `ArtifactIntelligenceDomain.markSignalsExtracted()`. This rule is now mechanically enforced — see Rule 11.)*
2. **All Blueprint-assembly intelligence access goes through domain APIs.** `BlueprintBuilder`, `ProjectContextBuilder`, `StructurePlanner`, `AudienceCalibrator`, and `NarrativePlanner` are explicitly forbidden from issuing direct Supabase queries. If a blueprint-assembly component needs new data, add a method to the owning domain; don't reach around it.
3. **`buildBlueprint()` never throws for missing data.** Every intelligence fetch inside blueprint assembly is wrapped in a fail-soft fallback. A blueprint must always be returned.
4. **The Learning Pipeline runs off the event bus, never synchronously inside request handling.** `recordFeedbackEvent()` persists immediately and emits an event; it does not await pipeline completion.
5. **Quarantine and corroboration gates are not optional, configurable, or bypassable** except by an explicit user correction (§9).
6. **Phase boundaries are activation triggers, not arbitrary flags.** `RelationshipIntelligenceDomain` is fully stubbed not because it's unfinished work sitting in a backlog, but because its activation condition (≥3 external artifacts with named recipients) hasn't been met by the system's design yet.
7. **The `IIntelligenceProvider` surface is fixed and versioned deliberately.** `buildBlueprint`, `recordFeedbackEvent`, `ingestKnowledgeAsset`, `ingestWorkspaceConfiguration`, `upsertProject`, `reviewLearning`, `getBrandSummary`, plus the bus accessor. `IntelligenceOS implements` it directly — a compile-time guarantee the two never drift apart. Treat any change to it as a deliberate, reviewed, versioned decision — `ingestWorkspaceConfiguration`'s own promotion onto this interface, during the ADR-003 audit-closure session, *was* that decision, not an exception to it: additive, non-breaking (every implementer already had the method), and recorded in `packages/intelligence-os/CHANGELOG.md`. The `CognitionProvider` surface (§4) is governed the same way, separately — see `PLATFORM_CONTRACT.md` §5.
8. **Compliance constraints are immutable by anyone except a workspace admin**, and once detected as a conflict, compliance always wins resolution (the Immutability Rule, §10). No Learning, no user correction, no audience calibration may override a compliance requirement.
9. **Taxonomy categories and stability classes are closed, coordinated unions.** `TaxonomyCategory` (25 values), `StabilityClass` (3 values), and `DecayRate` (4 values) each have downstream consumers in multiple files. Adding or removing a value means updating every consumer, not just the type definition.
10. **Every domain method's deferred/stub status should be documented in its own docblock**, using the `✓` (real) / `✗` (stub) convention. Several docblocks had gone stale relative to the code as of the prior documentation pass (most notably `UserIntelligenceDomain`'s, which claimed `upsertProfile`/`insertLearning` were real when they were stubs, and `ArtifactIntelligenceDomain`'s, which claimed `persistBlueprint` was a stub when it was already real and already called) — both were corrected during the Completion Mission session. Docblocks are trustworthy again as of this pass, but given they've drifted before, still worth spot-checking a method body directly for anything load-bearing.
11. **Direct database access from `pipeline/`, `knowledge/`, `blueprint/`, or `context/` is mechanically forbidden, not just discouraged.** `RULE-PIPELINE-NO-DIRECT-DB` in `check-boundaries.mjs` fails `pnpm check:boundaries` if any file in those four directories imports `@supabase/supabase-js` — added specifically because Rule 1's violation had already spread to a fifth call site (`FeedbackProcessor.ts`) by the time it was caught by hand. If a new pipeline stage genuinely needs a new read or write, add a method to the owning domain and inject the domain, not the client.
12. **One Learning Pipeline, one composition pattern, however many subjects.** Adding a new subject type, or serving a new consuming surface, is never grounds for a second, simplified, or subject-specific version of classification (`SignalExtractor`), corroboration (`HypothesisEngine`), validation (`LearningValidator`), synthesis (`ProfileBuilder`), or authority-ordered composition (§10). This is Principle 5 of `PLATFORM_CONTRACT.md` ("no duplicated intelligence") applied inside this package's own boundaries, not just across the BrandOS boundary — a second pipeline built to unblock one subject type or one caller is a violation of this rule regardless of how "minimal" or "temporary" it's intended to be. See [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md) for the decision record this rule codifies, including the specific shortcut it was written in response to.

## Boundary enforcement, currently: 3 rules

`pnpm --filter @intelligence-os/core run check:boundaries` enforces, in order: `RULE-IOS-ISOLATION` (this package's own import allowlist), `RULE-SIT-ISOLATION` (`shared-intelligence-types`' import allowlist), and `RULE-PIPELINE-NO-DIRECT-DB` (Rule 11 above). All three are currently clean.

## 12. Development Workflow

```bash
# From the workspace root:
corepack enable                   # if pnpm isn't already available
pnpm install                      # installs across all workspace projects
pnpm typecheck                    # tsc --noEmit, recursive across packages
pnpm test                         # vitest run, recursive across packages
pnpm test:coverage                # vitest run --coverage
pnpm validate                     # typecheck + check:boundaries (what CI would run, if CI existed — see Known Issues)
pnpm clean                        # rm -rf dist, recursive
```

Tests require no live infrastructure. Every Supabase interaction in every test file is mocked via a small factory that chains `.schema().from().select().eq().maybeSingle()` and friends. You do not need a Supabase project, a `.env` file, or network access to run the full test suite.

To stand up a real database (for manual testing or a staging deployment, not for the automated test suite): apply `packages/intelligence-os/src/db/schema.sql`, then the migration(s) in `db/migrations/`, then the `GRANT`/`ALTER DEFAULT PRIVILEGES` statements documented in the comment block at the top of `schema.sql`. The `intelligence` schema must be added to Supabase's exposed-schemas list before the client can query it.

There is currently no ESLint configuration and no CI workflow definition in this repository. The one mechanical boundary check that does exist is `packages/intelligence-os/scripts/check-boundaries.mjs`, runnable via `pnpm --filter @intelligence-os/core run check:boundaries` — it enforces `RULE-IOS-ISOLATION`, `RULE-SIT-ISOLATION`, and `RULE-PIPELINE-NO-DIRECT-DB` (three rules — see §11). It is not ESLint-based — it is a standalone Node script that statically validates import specifiers.

## 13. Implementation Philosophy

A handful of consistent decisions run through every pipeline in this codebase. Recognizing them will save you from re-deriving "is this a bug?" every time you hit one of these patterns:

- **"Smallest implementation that satisfies the contract."** Repeatedly, when a design choice has a simple version and a more complete version, the simple version ships first with an explicit comment naming what was deferred and why. This is not corner-cutting; it's a stated policy, visible in code comments across the codebase.
- **Heuristic, not LLM-based, pipeline internals.** Every extractor in the Knowledge Pipeline and every classifier in the Learning Pipeline is deterministic pattern-matching — no calls to a language model anywhere inside pipeline internals. If you're tempted to add an LLM call inside an extractor, that's a significant architectural change, not an incremental improvement — flag it for design review rather than slipping it in.
- **Confidence is earned, never assumed.** Nothing becomes a trusted `Learning` on a single observation (except an explicit user correction). Nothing becomes a `user_calibrated` artifact pattern on a single accepted artifact (the threshold is ≥2).
- **Graceful degradation is a tested property, not an incidental behavior.** Both the Learning Pipeline (`FeedbackProcessor.process()`) and the Blueprint Pipeline (`BlueprintBuilder.build()`) are written so that a failure in one stage doesn't abort the others, and this is exercised directly in tests.
- **Documentation lives next to the code it describes.** Nearly every file in this codebase opens with a docblock stating what it's responsible for and what's real vs. stubbed.

## 14. Testing Philosophy

- **Tests never touch a live database.** Every test, unit or integration, runs against a mocked Supabase client. This is what makes `pnpm test` runnable with zero setup, by a human or an agent, anywhere.
- **Unit tests mirror the pipeline structure.** `tests/unit/pipeline/`, `tests/unit/blueprint/`, `tests/unit/knowledge/`, plus epic/milestone-scoped folders for feature-specific test suites.
- **Integration tests exercise the public methods, not internals.** `tests/integration/intelligence-os.test.ts` calls `IntelligenceOS` exactly the way a generation system would.
- **Graceful degradation gets explicit test coverage**, not just incidental coverage from happy-path tests.
- **Current verified state** (re-run directly against this snapshot, not copied from a prior record): `pnpm -r typecheck` is clean across all packages; `pnpm --filter @intelligence-os/core test` passes 450/450 across 27 test files; `pnpm --filter @intelligence-os/core run check:boundaries` reports zero violations across all three enforced rules. See [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) for the full current-state record, including what these numbers don't cover (live-database integration tests).
- **Coverage thresholds are stale.** `vitest.config.ts`'s configured thresholds are low, dated to an early point in the project before three pipelines' worth of code had shipped. Don't treat the configured threshold as the bar to clear — see `IMPLEMENTATION_STATUS.md` Known Issues.

## 15. Read Order

Read these in order. Each step assumes only what came before it.

1. **This document, in full.**
2. **`packages/shared-intelligence-types/src/`** and **`packages/cognition-contract/src/`** (all files in both — they're short). Together, this is the entire vocabulary the outside world uses to talk to IntelligenceOS, across both integration surfaces (§4).
3. **`packages/intelligence-os/src/IntelligenceOS.ts`**. The whole system through its one entry point.
4. **`packages/intelligence-os/src/errors.ts`**. Five classes, five minutes. Knowing `PhaseNotImplementedError` vs. `DomainNotActivatedError` vs. `DatabaseError` up front means every stub you encounter later reads as "documented, deliberate gap" rather than "broken code."
5. **`types/entities.ts`**, then **`types/domains.ts`**, then **`types/events.ts`**.
6. **`db/schema.sql`**, top to bottom, including the comments, then `db/migrations/`.
7. **`domains/`** — read `UserIntelligenceDomain.ts` first (it's the richest and best-commented), then skim the other five, checking each method body against §6's table above rather than trusting the file's own docblock.
8. **`pipeline/`** in this order: `types.ts` → `SignalExtractor.ts` → `ObservationBuilder.ts` → `HypothesisEngine.ts` → `LearningValidator.ts` → `ProfileBuilder.ts` → `FeedbackProcessor.ts` last.
9. **`blueprint/`** in this order: `internal/defaults.ts` → `internal/conflictDetection.ts` → `ProjectContextBuilder.ts` → `AudienceCalibrator.ts` → `StructurePlanner.ts` → `NarrativePlanner.ts` → `ConflictResolutionModel.ts` → `BlueprintBuilder.ts` last.
10. **`knowledge/`** in this order: `types.ts` → `KnowledgeAssetExtractor.ts` → `VocabularyExtractor.ts` → `FrameworkExtractor.ts` → `PatternExtractor.ts` → `VisualFeatureExtractor.ts` → `KnowledgeValidator.ts` → `KnowledgeProcessor.ts` last.
11. **`events/IntelligenceEventBus.ts`**, then **`context/ContextBuilder.ts`** and **`api/CognitionProviderImpl.ts`** — the second public surface (§4).
12. **`tests/integration/intelligence-os.test.ts`**, fully — the fastest way to see the whole system exercised end-to-end.
13. **`tests/integration/blueprint.test.ts`**, then any unit test as needed.

From here, treat [`PLATFORM_CONTRACT.md`](./PLATFORM_CONTRACT.md) and [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) as the next reads if your work touches the HTTP surface or a consumer integration, [`ADR-003`](./adr/ADR-003-subject-centric-intelligence.md) if your work touches identity, workspace intelligence, or anything scoped to a subject other than a user, and [`archive/`](./archive/) only when you have a specific "why was it built this way" question this document and the ADRs don't already answer. A longer, time-estimated version of this same sequence lives at [`archive/planning/Repository_Read_Order_Detailed.md`](./archive/planning/Repository_Read_Order_Detailed.md).

---

## A note on `docs/archive/`

This repository's `docs/archive/` directory contains the original specification documents IntelligenceOS was built from, plus the roadmaps, implementation guides, and architecture-analysis documents written while building it. They remain useful as **deep-reference material** — see [`archive/README.md`](./archive/README.md) for what's in each subfolder and why it's kept.

They are not onboarding material, and they are not always literally accurate against the current code — several documented mismatches exist, and the documents themselves predate parts of the implementation. Treat this document, the `AGENT_CONTEXT.md` files, and [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) as authoritative for "how IntelligenceOS works today." Treat `archive/` as authoritative for "why it was designed this way" when this document doesn't already explain it.
