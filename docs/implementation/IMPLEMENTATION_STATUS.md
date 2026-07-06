# IMPLEMENTATION_STATUS.md
**IntelligenceOS — Implementation Handover Document**

> **Canonical reference for all implementation sessions.**
> Read this document before modifying any code.
> Update this document at the end of every session.
>
> Last updated: Session 5 — Epic 2 (Platform Publication)
> Repository: `intelligenceOS/intelligence-os/`
> Authority documents: `docs/IntelligenceOS_Engineering_Roadmap.md`, `docs/IntelligenceOS_Implementation_Guide.md`, `docs/ADR/ADR-001-VISUAL-INTELLIGENCE.md`, `docs/ARCHITECTURE_REVIEW_E2-0.md`, `GAP_ANALYSIS.md`
>
> **Supersedes:** `docs/IMPLEMENTATION_STATUS_EI-PhaseC.md` (Session 4, Epic 1 core-complete) and `docs/IMPLEMENTATION_STATUS _Epic1.md` (Stage Gate Review). Both are kept in the repository as historical session records; this file is the only one that should be read for current status. Nothing in either superseded file contradicts this one — Session 5 added to that record, it didn't revise it.

---

## Current Repository State

| Field | Value |
|---|---|
| **Current Epic** | Epic 2 — Platform Publication |
| **Current Milestone** | Epic 2 platform-side scope complete; live-infrastructure items and consumer-side (BrandOS) work remain |
| **Current Task** | See "Next Recommended Implementation Task" below |
| **Build Status** | ✅ TypeScript clean (`pnpm -r typecheck`, Session 5) |
| **Test Status** | ✅ 391 / 391 passing across 21 test files (Session 5) |
| **Boundary Status** | ✅ `pnpm --filter @intelligence-os/core run check:boundaries` clean (RULE-IOS-ISOLATION + RULE-SIT-ISOLATION, 0 violations) |
| **Package versions** | `@intelligence-os/core@0.2.0`, `@intelligence-os/shared-types@0.2.0` |

### Epic 2 reframing (read this before anything else in this section)

The Stage Gate Review that closed Epic 1 concluded IntelligenceOS already contains the required intelligence capabilities. Epic 2 was reframed accordingly: **not** BrandOS integration, but **platform publication** — making IntelligenceOS independently consumable by any external application through published contracts, an SDK, a provider implementation, documentation, and versioned packages, without requiring any consumer's source code and without modifying or assuming access to BrandOS.

Concretely, this changed how several Engineering-Roadmap-specified E2 tasks were implemented:
- Tasks that the Roadmap placed inside a BrandOS-owned package (`@brandos/contracts`) were **relocated into this platform's own published surface** — see Decision 7 below. The platform now owns its provider contract; it doesn't depend on a consumer to define it.
- Tasks that are inherently consumer-side (DI registration, BrandOS's CPL orchestrator wiring, BrandOS's own legacy-provider wrapper, BrandOS's own route/package boundary rules) were **not implemented** — they're documented as Consumer Adoption tasks instead. See `docs/EPIC2_CONSUMER_ADOPTION_CHECKLIST.md`.
- Everything else in the original E2-0' through E2-6 backlog that belongs entirely inside IntelligenceOS **was implemented**, including some platform-identity cleanup (Gap Analysis G-1's `@brandos/*` namespace) that wasn't a named E2 task but blocked "package publication readiness" from being meaningful — see "Epic 2 — Implementation Record" below.

### Epic 1 Exit Criteria Checklist (unchanged since Session 4, except #6)

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | E1-1 reviewLearning — merged and integration-tested | ⚠️ Partial | Core implementation complete. Unit tests pass. Integration test against live Supabase not run (no live Supabase instance available in this environment). |
| 2 | E1-2 workspace voice — merged and integration-tested | ⚠️ Partial | Phase C implemented (Session 4). Unit + integration tests (mocked Supabase) pass. Live-DB integration test not run. Schema migrations not applied. |
| 3 | E1-3 getBrandSummary — merged and integration-tested | ⚠️ Partial | Core implementation complete. Unit tests pass. Integration test against live Supabase not run. |
| 4 | E1-5 classification compat — merged and unit-tested | ✅ Met | Unchanged since Session 3. |
| 5 | IOS test suite passes in CI against test Supabase project | ⬜ Not Met | No live Supabase project or CI runner available in this environment. Test suite passes fully against mocked Supabase (391/391). |
| 6 | `RULE-IOS-ISOLATION` check passes with zero violations | ✅ **Met (Session 5)** | `scripts/check-boundaries.mjs` now exists, is wired to `pnpm run check:boundaries`, and passes with 0 violations. Was vacuous (no enforcement script) as of Session 4; criterion is no longer vacuous. |

**Summary, unchanged in substance from Session 4:** all capability implementations are complete and passing against mocked infrastructure. The only remaining blockers are environmental (a live Supabase test project and a CI runner), not implementation gaps. Session 5 closed exit criterion 6 as a side effect of Epic 2 platform-boundary work.

---

## Verified Completed Work (Epic 1 — unchanged from Session 4)

### E1-1 — Human Learning Review API ✅ Core complete
- `IntelligenceOS.reviewLearning()`, `UserIntelligenceDomain.reviewLearning()`, `intelligence.learning.reviewed` event + `LearningReviewedPayload` — confirmed. 7 unit tests passing.

### E1-2 — Workspace-Scoped Brand Voice ✅ ALL PHASES COMPLETE (Session 4)
Phase A (index SQL) not applied to live DB (tracked below). Phase B (`WorkspaceIntelligenceDomain` write path) confirmed, 6 unit tests. Phase C (`NarrativePlanner` 4-level voice hierarchy + `BlueprintBuilder` workspace fetch) implemented Session 4 — see that session's record in `docs/IMPLEMENTATION_STATUS_EI-PhaseC.md` for full implementation detail, unchanged by Session 5 except for the `degraded`-tracking refactor noted under Epic 2 below (behavior-preserving).

### E1-3 — Brand Summary Query API ✅ Core complete
`IntelligenceOS.getBrandSummary()`, `countActiveLearnings()`, `getTopTaxonomyCategories()`, `IntelligenceSummary` — confirmed. 9 unit tests passing.

### E1-4 — VLM Visual Intelligence Bridge ✅ Stage 4 complete
`VisualFeatureExtractor` wired as Stage 4 in `KnowledgeProcessor`; visual types exported. 26 unit tests. Visual → Learning promotion (ADR-001 §5) still not implemented (unchanged technical debt, non-blocking).

### E1-5 — A–C Classification Compat ✅ Complete
`toLegacyClassification()`, 18 unit tests passing.

---

## Epic 2 — Implementation Record (Session 5)

Each item below states what the Engineering Roadmap originally specified, what was actually done, and why — per the reframing above, several items deliberately deviate from the original BrandOS-coupled spec.

### E2-0' — Contract Distribution Setup

| Sub-task | Status | Notes |
|---|---|---|
| T1: Publish `shared-intelligence-types` as a versioned package | ✅ Done | Real `package.json` (`@intelligence-os/shared-types@0.2.0`), `publishConfig` pointing at compiled `dist/`, `build` script, `sideEffects: false`, no longer `private: true`. Not actually published to a registry (no registry access/credentials in this environment) — see "Package Publication Readiness" below for exactly what "ready" means here vs. what still requires a real publish step. |
| T2: Field-shape reconciliation for `ArtifactBlueprint` | ✅ Done | See E2-1-T1 below — same work, listed once. |
| T3: Fix `check-boundaries.mjs` | ✅ Done (IOS-side scope) | The original script lived in BrandOS's tooling and scanned BrandOS's `package.json` declarations — that part is Consumer Adoption (BrandOS must write its own equivalent against its own tree; nothing in this platform can do that for it). What *is* IOS-side: a standalone `packages/intelligence-os/scripts/check-boundaries.mjs`, owned by this platform, enforcing RULE-IOS-ISOLATION and RULE-SIT-ISOLATION against this platform's own two packages. See "Platform Boundary Rules" below. |

### E2-1 — Shared Type Reconciliation

| Sub-task | Status | Notes |
|---|---|---|
| T1: Add `degraded`, `confidenceScore`, `buildDurationMs` to the real `ArtifactBlueprint` | ✅ Done | See Decision 8, 9 below for exact semantics and the confidence-score formula. `BlueprintBuilder.build()`, `ProjectContextBuilder.build()`, and `AudienceCalibrator.calibrate()` all now use a shared `trackedCatch()` helper (`blueprint/internal/trackedFetch.ts`) so a genuine fetch failure can be distinguished from data that's simply, legitimately absent. 17 new tests in `tests/unit/epic2/E2-1.degradedConfidence.test.ts` plus 2 strengthened existing tests. **Not yet persisted** to `artifact_blueprints` — see Known Gaps below. |
| T2: `IIntelligenceProvider`-facing alias types in `@brandos/contracts` | 🔄 Re-scoped, done differently | The original task assumed a second, consumer-owned package mirroring this platform's types. Epic 2's "never require consumer source" rule rules that out, and on reflection it was never necessary — see Decision 7. `IIntelligenceProvider` is now published from `@intelligence-os/core` itself, referencing the real `ArtifactBlueprint`/`ArtifactRequest`/`FeedbackEvent`/`IntelligenceSummary` types directly. No parallel alias type was created. |
| T3: ArtifactType ↔ TaskType translation spike | ✅ Resolved — no translation layer needed | `ArtifactRequest.artifactType` is already an open string union. Both `StructurePlanner` and `NarrativePlanner` already have tested, documented fallback paths for any unrecognized value (3 generic fallback sections; a generic narrative frame derived from the type string). New test `tests/unit/epic2/E2-1-T3.artifactTypeOpenness.test.ts` confirms this against realistic external vocabulary (`carousel`, `caption`, `deck`, `reel_script`, `press_release`) rather than the placeholder names (`unknown_type`, `custom_doc_type`) the existing suites already used. Per the "never require consumer source" rule, IntelligenceOS does not — and should not — enumerate any one consumer's specific vocabulary; the open-union + fallback design already gives every consumer this for free. |
| T4: `FeedbackEvent` field naming (`blueprintId` vs `blueprintRef`) | ✅ Already correct | Checked the real type: it's `blueprintId`. No change needed; the Roadmap's concern didn't match the as-implemented shape. |
| T5: RULE-SIT-ISOLATION enforcement | ✅ Done | Folded into the same `check-boundaries.mjs` as E2-0'-T3 — see "Platform Boundary Rules" below. |

### E2-2 — `IIntelligenceProvider` Interface

✅ **Done, relocated.** Published from `packages/intelligence-os/src/IIntelligenceProvider.ts`, exported via `@intelligence-os/core`'s `index.ts`. Covers `buildBlueprint`, `recordFeedbackEvent`, `ingestKnowledgeAsset`, `upsertProject`, `reviewLearning`, `getBrandSummary` — deliberately excludes `.eventBus` (see the file's own docblock for why). `IntelligenceOS` now `implements IIntelligenceProvider` directly, which means TypeScript itself enforces that the two never drift apart — confirmed by a clean `pnpm -r typecheck` the moment the `implements` clause was added. See Decision 7 for the full reasoning on why this interface is published from here rather than from a BrandOS-owned package as the Roadmap originally specified.

### E2-3 — `BrandOSLegacyIntelligenceProvider`

📋 **Consumer Adoption — not implemented, by design.** This class wraps BrandOS's own pre-IntelligenceOS legacy intelligence code. It cannot be written without BrandOS's source, and Epic 2's rules forbid assuming access to it. Documented in `docs/EPIC2_CONSUMER_ADOPTION_CHECKLIST.md`.

### E2-4 — `IntelligenceOSProvider` (platform-side adapter)

| Sub-task | Status | Notes |
|---|---|---|
| T1: Implement the adapter, export from `index.ts` | ✅ Done | `packages/intelligence-os/src/compat/IntelligenceOSProvider.ts`. Thin 1:1 delegation over an injected `IntelligenceOS` instance; `IntelligenceOSProvider.fromConfig()` convenience factory; `.underlying` escape hatch back to the concrete instance for `.eventBus` access. 11 tests in `tests/unit/epic2/E2-4.intelligenceOSProvider.test.ts`, one per interface method plus both construction paths. New `compat/AGENT_CONTEXT.md` documents the directory's scope and the rule that this adapter must never grow business logic of its own. |
| T2: RULE-IOS-ISOLATION enforcement | ✅ Done | Same script as E2-0'-T3/E2-1-T5. |

### E2-5 — CPL Provider Wiring

📋 **Consumer Adoption — not implemented, by design.** Registering a provider in BrandOS's own CPL orchestrator and `IdentityContributor` requires BrandOS's source tree. Documented in `docs/EPIC2_CONSUMER_ADOPTION_CHECKLIST.md`.

### E2-6 — Boundary Rule Additions

| Sub-task | Status | Notes |
|---|---|---|
| RULE-IOS-ISOLATION, RULE-SIT-ISOLATION | ✅ Done (IOS-side) | `scripts/check-boundaries.mjs`, generalized beyond the original `@brandos/*`-specific scan to flag a dependency on *any* package outside this platform's own minimal, declared allowlist — see "Platform Boundary Rules" below for why this is a strictly better rule, not just a renamed one. |
| RULE-IOS-CPL-ONLY, RULE-IOS-OCL-NONE | 📋 Consumer Adoption | These scan BrandOS's own route/package structure for accidental IntelligenceOS imports outside its CPL layer. Nothing in this platform's repository can implement a rule about a different repository's folder structure. Documented in `docs/EPIC2_CONSUMER_ADOPTION_CHECKLIST.md`. |

### Platform identity cleanup (Gap Analysis G-1 — not a numbered E2 task, but a precondition for "package publication readiness" to mean anything)

A package that claims to be an independent platform cannot be installed under the name `@brandos/intelligence-os`. This was already flagged as the repository's single highest-priority ("actively misleading") finding before Epic 2 began. Carried out in full this session:
- npm scope: `@brandos/shared-intelligence-types` → `@intelligence-os/shared-types`; `@brandos/intelligence-os` → `@intelligence-os/core`; root workspace `brandos-workspace` → `intelligence-os-workspace`.
- All 14 event-type strings unified under the `intelligence.*` namespace (previously 5 of 14 used `brandos.*`).
- `intelligence.blueprint.built`'s payload was promoted from the generic `BaseEventPayload` fallback to a dedicated, properly-typed `BlueprintBuiltPayload` — a direct consequence of writing tests against it and noticing `processingMs` had no declared type.

See `GAP_ANALYSIS.md` G-1 for the full before/after record, and both packages' `CHANGELOG.md` for the itemized breaking changes.

### Package Publication Readiness

What "ready" means concretely, for both `@intelligence-os/core` and `@intelligence-os/shared-types`:
- Real semantic versions (`0.2.0`), not placeholder `0.1.0`s.
- `publishConfig` pointing `main`/`types`/`exports` at compiled `dist/` output, while the top-level `main`/`types`/`exports` continue pointing at `src/` for zero-build-step workspace development (confirmed: `pnpm -r typecheck` and `pnpm -r test` both still resolve against source, unaffected by this change).
- A working `build` script for each package (`tsc -p tsconfig.json` for `shared-types`; `tsc -p tsconfig.build.json` for `core` — the latter needed a dedicated build tsconfig, since the package's existing single `tsconfig.json` intentionally typechecks `tests/**` alongside `src/**` for the `typecheck` script, which is incompatible with `rootDir`-based flat `dist/` output. Verified: `pnpm -r build` now produces `dist/index.js` + `dist/index.d.ts` at the expected flat path for both packages).
- `sideEffects: false` on both (true for both — confirmed by inspecting module-level code for side effects beyond class/function definitions).
- `files` arrays limited to `dist`, `src`, `README.md` — no `tests/`, no `scripts/`, no config files in the published tarball.
- `private: true` removed from both packages (the root workspace `package.json` correctly remains `private: true` — it's never meant to be published itself).
- A real `README.md` for each package (previously: none existed anywhere in the repository — Gap Analysis G-3) and a `CHANGELOG.md` for each (previously: none — Gap Analysis G-9). Both gaps are now marked resolved in `GAP_ANALYSIS.md`.
- A root-level `README.md` pointing at `INTELLIGENCEOS_BOOTSTRAP.md` (the other half of G-3).
- A root `.gitignore` (previously: none existed at all — `node_modules/` and `dist/` were unignored).

**What "ready" does not mean:** this was not actually published to any npm registry. There's no registry access, credentials, or organization configured in this environment, and doing so would be a real, irreversible action a maintainer should take deliberately, not something to simulate. Everything above is the work that has to be true *before* `npm publish` is a reasonable thing to run — `npm publish --dry-run` against the built `dist/` output is the natural next verification step for whoever has registry access.

### Platform Boundary Rules

`packages/intelligence-os/scripts/check-boundaries.mjs` (zero new dependencies — just Node's `fs`/`path`/`url`) enforces:
- **RULE-IOS-ISOLATION**: `packages/intelligence-os/src/**` may only import relative paths, `@intelligence-os/shared-types`, `@supabase/supabase-js`, or Node built-ins.
- **RULE-SIT-ISOLATION**: `packages/shared-intelligence-types/src/**` may only import relative paths or Node built-ins (zero runtime dependencies, as that package's own `AGENT_CONTEXT.md` already stated).

This generalizes the original Epic 1 spec (a hardcoded scan for `@brandos/*`) into an allowlist that catches a dependency on *any* future consumer package, not just one we happened to name — Epic 2 has no single privileged consumer to hardcode against. Run via `pnpm --filter @intelligence-os/core run check:boundaries`; exits 1 with a file:line report on any violation. Pure functions (`checkPackage`, `extractSpecifiers`, `iosIsolationAllowed`, `sitIsolationAllowed`) are exported separately from the CLI entry point and covered by 26 tests in `tests/unit/epic2/E2-checkBoundaries.test.ts`, including the case a naive line-by-line regex would miss (a multi-line `import type { ... } from '...'` statement).

---

## Remaining Work (environmental, not implementation — unchanged in substance since Session 4)

### Required: Schema migrations (must apply to live Supabase before integration tests)

```sql
-- 1. extracted_visual_features column (E1-4)
ALTER TABLE intelligence.knowledge_assets
  ADD COLUMN IF NOT EXISTS extracted_visual_features JSONB;

-- 2. Workspace index (E1-2 Phase A)
CREATE INDEX IF NOT EXISTS intelligence_learnings_workspace_domain
  ON intelligence.learnings(workspace_id, domain, state)
  WHERE workspace_id IS NOT NULL;

-- 3. Nullable user_id for workspace-scoped learnings (E1-2 FK resolution)
-- Review with schema owner before applying.
ALTER TABLE intelligence.learnings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE intelligence.learnings ADD CONSTRAINT learnings_owner_required
  CHECK (user_id IS NOT NULL OR workspace_id IS NOT NULL);

-- 4. Epic 2 / E2-1-T1 — NEW this session: columns for the three new
-- ArtifactBlueprint fields, if persisting them to the audit trail is wanted.
-- Not applied; degraded/confidenceScore/buildDurationMs are currently
-- returned to the caller only. See "Known Gaps" below before writing this —
-- decide column types and whether buildDurationMs belongs in this table at
-- all (it's a performance metric, arguably better suited to an observability
-- pipeline than a row-level audit column) before migrating.
-- ALTER TABLE intelligence.artifact_blueprints
--   ADD COLUMN IF NOT EXISTS degraded BOOLEAN,
--   ADD COLUMN IF NOT EXISTS confidence_score NUMERIC,
--   ADD COLUMN IF NOT EXISTS build_duration_ms INTEGER;
```

### Required: Integration tests against live infrastructure

| Test | Depends on |
|---|---|
| E1-1: `reviewLearning` persists to `intelligence.learnings` | Live Supabase, migration #3 |
| E1-2: two users, same workspace, shared voice in blueprint | Live Supabase, migrations #1–3 |
| E1-3: `getBrandSummary` returns correct counts | Live Supabase |
| E1-4: visual features column write + read | Live Supabase, migration #1 |
| Epic 2: `npm publish --dry-run` against built `dist/` for both packages | Registry access/credentials |

### Optional / deferred (not blocking)

| Item | Priority | Notes |
|---|---|---|
| Visual mood → Learning promotion | Medium | ADR-001 §5 requirement; no consumer until Epic 3 |
| E1-5 threshold calibration | Low | Calibrate against real classification data once a consumer exists |
| Raise vitest coverage thresholds | Low | Still 40/30 from the Sprint 0 annotation (Gap Analysis G-4, untouched this session — out of Epic 2's scope) |
| Persist `degraded`/`confidenceScore`/`buildDurationMs` to `artifact_blueprints` | Low | See migration #4 above. Deliberately deferred, not dropped. |
| Rename `ProjectInput.brandosProjectId` (and the matching DB column, `getProjectByBrandosId()`) | Low | New finding this session, **not yet acted on** — see Known Gaps below. |

---

## Known Gaps (Epic 2 additions — see `GAP_ANALYSIS.md` for the full pre-existing list, G-1/G-3/G-9/G-11 of which are now marked resolved/addressed there)

| Item | Severity | Description |
|---|---|---|
| `degraded`/`confidenceScore`/`buildDurationMs` not persisted | 🟡 Medium | Returned to the caller (the public-contract part Epic 2 cares about); no `artifact_blueprints` columns yet. See migration #4 above. Same deferred treatment the codebase already gives `quality_score`. |
| `ProjectInput.brandosProjectId` / `getProjectByBrandosId()` field & method naming | 🟢 Low | A platform meant for any consumer shouldn't have a field named after one specific one. Identified this session by the same reasoning as Gap Analysis G-1, but **not fixed** — unlike the npm-scope/event-name rename, this one touches a live DB column name (`brandos_project_id`), which means a real schema migration, and there were already three pending migrations from Epic 1 before this was found. Fixing it compounds risk rather than reducing it; flagging it here is the responsible move until a maintainer with live-DB access can do the rename and migration together. |
| Persisted-blueprint schema vs. new contract fields will drift further if more `ArtifactBlueprint` fields are added before migration #4 ships | 🟢 Low | Worth fixing in the same pass as whoever applies migration #4, not before. |

Everything else flagged in `GAP_ANALYSIS.md` (G-2, G-4 through G-8, G-10) is **unchanged and untouched** this session — those are Epic 1 architecture/process concerns, explicitly out of Epic 2's "do not revisit Epic 1 architecture" scope.

---

## Architectural Decisions

*(Decisions 1–6 are unchanged from Session 4 — see `docs/IMPLEMENTATION_STATUS_EI-PhaseC.md` for the full original text. Restated briefly here for continuity; Decision 6 is superseded by Decision 7.)*

1. E1-2 Phase C voice taxonomy filtering — `VOICE_TAXONOMY_CATEGORIES` allowlist.
2. E1-2 Phase C — `avoidPatterns` (voice) vs. `forbiddenTerms` (vocabulary) are distinct fields.
3. E1-2 — nullable `user_id`, not a sentinel UUID, for workspace-scoped learnings.
4. E1-5 — confirmed 3-value (`A|B|C`) classification scheme, not the Roadmap's 5-value description.
5. E1-4 — text signals only in Phase 1; pixel/image analysis deliberately deferred.
6. ~~E2-0 superseded by E2-0'~~ — superseded in turn by Decision 7's broader reframing.

### Decision 7 (Epic 2): `IIntelligenceProvider` is published from this platform, not from a BrandOS-owned package

The Engineering Roadmap (E2-2) specified this interface living in `@brandos/contracts`, authored by the BrandOS team, so BrandOS's CPL orchestrator could depend on an interface rather than a concrete class. The Stage Gate Review's reframing — "never require another application's source code," "expose everything necessary through this platform's own public interfaces" — makes that placement untenable: an interface that only exists inside one consumer's private package can't be depended on by any other application without first depending on BrandOS, which is exactly the coupling Epic 2 exists to remove.

`IIntelligenceProvider` is now defined and exported directly from `@intelligence-os/core` (`src/IIntelligenceProvider.ts`). `IntelligenceOS` implements it directly; `IntelligenceOSProvider` (`src/compat/`) is the platform's own adapter for consumers who want the interface type specifically. Any consumer — BrandOS or otherwise — imports the interface from here. A consumer is free to write its own alternative implementation against the same interface (e.g. BrandOS's planned `BrandOSLegacyIntelligenceProvider` — see E2-3 above) without this platform needing to know that implementation exists.

A second-order consequence: this eliminated the need for E2-1-T2's planned parallel "alias type" for `ArtifactBlueprint` inside a BrandOS contracts package. With only one provider-contract package (this one) instead of two, the real `ArtifactBlueprint` simply *is* the public result type — see Decision 8.

### Decision 8 (Epic 2 / E2-1-T1): one `ArtifactBlueprint`, not two

Given Decision 7, there's no second package that would need its own copy of `ArtifactBlueprint`'s shape. The three new fields (`degraded`, `confidenceScore`, `buildDurationMs`) were added directly to the real type in `@intelligence-os/shared-types`, additively — no breaking change to existing fields, no parallel "Result" type maintained in lockstep with the original. This is the same "smallest implementation that satisfies the contract" philosophy the Bootstrap already states (§12), applied to the platform's own published contract rather than to an internal implementation detail.

### Decision 9 (Epic 2 / E2-1-T1): what `degraded` does and doesn't mean

`degraded: true` means a Step-1 intelligence fetch in `BlueprintBuilder.build()` (or one of its helpers, `ProjectContextBuilder`/`AudienceCalibrator`) **errored** and fell back to its documented fail-soft default. It deliberately does **not** mean "this data doesn't exist" — a brand-new user with no stored profile gets `degraded: false`, because the system correctly used defaults; nothing failed. Implemented via a shared `trackedCatch()` helper (`blueprint/internal/trackedFetch.ts`) that preserves the exact existing fail-soft behavior while additionally reporting whether the fallback actually fired, which a bare `.catch(() => null)` cannot do. Locked in by 17 tests covering each of the 5 independently-failing sources.

### Decision 10 (Epic 2 / E2-1-T1): the `confidenceScore` formula

`confidenceScore = clamp01(0.7 × profile.compositeConfidence + 0.3 × audienceCalibration.confidence)`, where `profile.compositeConfidence` is `0` when no profile exists. Weighted toward the profile because it aggregates many learnings over time; audience calibration is one narrower signal. Deliberately **not** reduced when `degraded` is true — degradation and confidence answer different questions ("did something fail just now" vs. "how much do we actually know about this user"), and folding one into the other would make neither legible to a consumer reading the field.

### Decision 11 (Epic 2 / E2-1-T3): no artifact-type translation layer

The spike's original framing (BrandOS's `TaskType` vocabulary vs. IntelligenceOS's `ArtifactType`) doesn't generalize to "platform consumed by anyone," and turned out not to need solving even in its original form: `ArtifactType` is already an open string union, and the structure/narrative planners already have tested fallback paths for any unrecognized value. No code change; the finding is the verification itself, now backed by a dedicated test using realistic external vocabulary.

### Decision 12 (Epic 2): generalizing RULE-IOS-ISOLATION beyond a `@brandos/*` scan

The original spec hardcoded the rule against one consumer's package scope. Epic 2 has no single privileged consumer to hardcode against — so the rule became an allowlist (relative imports, `@intelligence-os/shared-types`, `@supabase/supabase-js`, Node built-ins) rather than a denylist of one foreign scope. This is strictly stronger: it would have caught the original `@brandos/*` leak just as well, and it additionally catches a leak toward any future consumer or any accidentally-added npm dependency that was never reviewed.

### Decision 13 (Epic 2): the `@brandos/*` namespace rename shipped in one pass, not a deprecation window

Per Gap Analysis G-1's own recommendation: a deprecation window (supporting both old and new event names for a transition period) is the right move only when there's a real existing caller to protect. There is none — BrandOS integration hasn't happened yet, by this engagement's own framing — so the rename (npm scope + all 14 event-type strings unified under `intelligence.*`) shipped as a single breaking change in 0.2.0, documented in both packages' `CHANGELOG.md`, rather than carrying forward a known-wrong name through an unnecessary transition period.

---

## Public Platform Surface

Maintained separately, in full, in **`docs/EPIC2_PUBLIC_PLATFORM_SURFACE.md`** — exported interfaces, DTOs, events, adapters, provider implementations, and SDK entry points, with an explicit statement that everything not listed there is internal. Read that file for the actual list; this document doesn't duplicate it.

## Consumer Adoption Checklist

Maintained separately in **`docs/EPIC2_CONSUMER_ADOPTION_CHECKLIST.md`** — every task this session identified as belonging to a consumer application (BrandOS or otherwise) rather than to this platform, with enough detail that a consumer's engineer could act on each item without needing anything from this repository beyond what's already published.

---

## Next Recommended Implementation Task

**There is no further Epic 2 platform-side implementation work that doesn't require either live infrastructure (a real Supabase project + registry credentials) or a consumer's source tree (BrandOS).** The platform-side Epic 2 backlog described in the Engineering Roadmap and Implementation Guide is complete to the extent it can be without those two things.

Recommended next steps, in priority order:
1. **Apply the 3 pending Epic 1 schema migrations** (plus, optionally, migration #4 above) to a real Supabase test project, then run the 5 live-infrastructure integration tests listed under "Remaining Work." This closes Epic 1 exit criteria 1, 2, 3, and 5 — the last ones not yet fully met.
2. **`npm publish --dry-run`** for both packages against their built `dist/` output, on a machine with registry credentials, to verify the `publishConfig` settings actually produce an installable tarball — this repository's sandboxed environment could verify the build output but not a real publish round-trip.
3. Hand `docs/EPIC2_CONSUMER_ADOPTION_CHECKLIST.md` to whoever owns BrandOS's codebase. Nothing further on the platform side blocks them from starting.

---

## Session History

| Session | Scope | Outcome |
|---|---|---|
| Session 1 | Blueprint Assembly + Sprint 0 core | Blueprint pipeline, core domain stubs, Sprint 0 write paths |
| Session 2 | Learning Pipeline + Knowledge Intelligence | `FeedbackProcessor`, `KnowledgeProcessor`, `HypothesisEngine`, `LearningValidator`, `ProfileBuilder` |
| Session 3 | Epic 1 (E1-1 through E1-5) | All 5 Epic 1 tasks implemented; 66 new tests; 316/316 passing; TypeScript clean |
| Stage Gate | Epic 1 / Epic 2 boundary review | Repository verified; Epic 2 assessed; E1-2 Phase C identified as blocking gap |
| Session 4 | E1-2 Phase C — Workspace Voice Layer | `NarrativePlanner` 4-level hierarchy; `BlueprintBuilder` workspace fetch; 16 new tests; 332/332 passing; TypeScript clean |
| **Session 5** | **Epic 2 — Platform Publication** | Platform identity cleanup (G-1: npm scope + event namespace, one breaking pass); `ArtifactBlueprint.degraded`/`.confidenceScore`/`.buildDurationMs` (E2-1-T1); `IIntelligenceProvider` + `IntelligenceOSProvider` published from this platform (E2-2/E2-4, Decision 7); ArtifactType-openness spike resolved with no translation layer needed (E2-1-T3); standalone `check-boundaries.mjs` enforcing RULE-IOS-ISOLATION + RULE-SIT-ISOLATION (E2-0'-T3/E2-1-T5/E2-4-T2/E2-6); package publication readiness for both packages (versions, `publishConfig`, build scripts, READMEs, CHANGELOGs, `.gitignore`); 4 pre-existing `noImplicitAny` typecheck errors fixed (environmental, surfaced by an installed TS patch version newer than the one last verified against); 59 new tests (391/391 passing, up from 332/332); TypeScript clean; boundary check clean. E2-3, E2-5, and the BrandOS-side half of E2-6 documented as Consumer Adoption, not implemented, per Epic 2's "never require consumer source" rule. |
