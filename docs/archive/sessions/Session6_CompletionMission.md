# IMPLEMENTATION_STATUS.md
**IntelligenceOS — Implementation Handover Document**

> **Canonical reference for all implementation sessions.**
> Read this document before modifying any code.
> Update this document at the end of every session.
>
> Last updated: Session 6 — Completion Mission (post-Epic-2 architectural completion pass)
> Repository: `intelligenceOS/intelligence-os/`
> Authority documents: `docs/IntelligenceOS_Engineering_Roadmap.md`, `docs/IntelligenceOS_Implementation_Guide.md`, `docs/ADR/ADR-001-VISUAL-INTELLIGENCE.md`, `docs/ARCHITECTURE_REVIEW_E2-0.md`, `GAP_ANALYSIS.md`
>
> **Supersedes:** `docs/IMPLEMENTATION_STATUS_EI-PhaseC.md` (Session 4, Epic 1 core-complete) and `docs/IMPLEMENTATION_STATUS _Epic1.md` (Stage Gate Review). Both are kept in the repository as historical session records; this file is the only one that should be read for current status. Nothing in either superseded file contradicts this one — Session 5 added to that record, it didn't revise it.

---

## Current Repository State

| Field | Value |
|---|---|
| **Current Epic** | Epic 2 — Platform Publication (complete, platform-side); Session 6 — Completion Mission (architectural completion pass, in progress — see below) |
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

## Completion Mission — Implementation Record (Session 6)

**Scope.** Following the Capability Audit & Activation Roadmap (delivered as a separate document), this session's mandate was completion, not redesign: finish partial implementations, connect dormant-but-implemented capabilities, remove architectural inconsistencies, and strengthen correctness/tests — in that priority order, preserving the existing architecture throughout. No live Supabase or npm-registry access was available in this sandboxed session, same as Session 5; all work is code, tests, and documentation.

**1. Gap Analysis G-2 resolved in full.** `HypothesisEngine`, `LearningValidator`, and `ProfileBuilder` (`pipeline/`) no longer hold a `SupabaseClient` — each takes a `UserIntelligenceDomain` instance and calls its methods instead. `UserIntelligenceDomain` gained: real `upsertProfile()`/`insertLearning()` (previously stubs), `markPreviousProfilesNonCurrent()`, `getAllActiveLearnings()`, `countLearningsSince()`, `getLatestValidatedLearning()`, `confirmLearning()`, and a full Hypothesis CRUD surface (`findOpenHypothesis`/`createHypothesis`/`updateHypothesis`/`markHypothesisPromoted`/`discardExpiredHypotheses`) — added to this domain rather than a new one, per the design question G-2 itself left open (see `UserIntelligenceDomain.ts`'s header docblock). `knowledge/KnowledgeProcessor.ts` similarly no longer holds a `SupabaseClient` — it takes a `KnowledgeIntelligenceDomain`, which gained a new `persistExtracted()` method; the validator's duplicate-lookup closure was also re-routed through `KnowledgeIntelligenceDomain.getAssets()`. **Found in the same pass, not originally in G-2's scope:** `pipeline/FeedbackProcessor.ts` itself held a `SupabaseClient` for one `feedback_events` update; `ArtifactIntelligenceDomain` gained `markSignalsExtracted()` and `FeedbackProcessor` now takes `ArtifactIntelligenceDomain` as a constructor argument instead. **Mechanical enforcement added:** `RULE-PIPELINE-NO-DIRECT-DB` in `check-boundaries.mjs` fails the boundary check if `pipeline/`, `knowledge/`, `blueprint/`, or `context/` import `@supabase/supabase-js` — covered by 6 new tests in `E2-checkBoundaries.test.ts`.

**2. `POST /v1/knowledge/ingest` wired up (Gap Analysis G-12, finding 1).** Both `apps/api/src/server.ts` and `apps/api/api/cognition.ts` now pass `intelligenceOS` as `createCognitionHttpServer`'s third (`KnowledgeIngestPort`) argument — this route returned 501 on every real deployment before this session, despite the Knowledge Pipeline behind it being fully implemented and already reachable via the SDK path. `apps/demo/src/index.ts` gained a sixth smoke-test step exercising this route.

**3. `intelligence.user.correction` connected end-to-end, consumer side (Gap Analysis G-12, finding 2).** `LearningValidator.maybeConfirm()` and the `UserCorrectionPayload` event contract existed before this session but had no caller anywhere — `FeedbackProcessor.register()` now also subscribes to `intelligence.user.correction` and routes it through a new `processCorrection()` method. New test file: `tests/unit/pipeline/UserCorrection.test.ts` (7 tests). **Not done:** the emitter side (a public `IntelligenceOS.recordCorrection()`-equivalent method) — see Known Gaps below for why this was deliberately left for a separate session.

**4. `ArtifactBlueprint.degraded`/`.confidenceScore` now persisted (Epic 2 / E2-1-T1 follow-through).** `persistBlueprint()` was already a real, fully-implemented, already-called method — its own Sprint 0 header docblock incorrectly listed it as a stub, corrected this session (a documentation-drift finding, not a code finding: the method never actually threw `PhaseNotImplementedError`). Session 5 deferred a decision on whether to add columns for `degraded`/`confidenceScore`/`buildDurationMs`; this session made that decision: `degraded` and `confidenceScore` are genuine row-level blueprint state and got columns (`schema.sql`, migration #4 — not yet applied to a live instance, same as migrations #1–3); `buildDurationMs` was judged a performance metric better suited to an observability pipeline and deliberately left unpersisted, per Session 5's own reasoning.

**Test/type/boundary status at end of session:** 450/450 tests passing (437 pre-existing + 13 new: 7 in `UserCorrection.test.ts`, 6 in `E2-checkBoundaries.test.ts`'s new `checkNoDirectDb()` suite), up from 437/437. `pnpm -r typecheck` clean across all 6 buildable workspace packages. `pnpm check:boundaries` clean, now checking 3 rules instead of 2.

**Deliberately not attempted this session** (documented here rather than silently skipped, consistent with this file's own stated purpose): live-database migration application and the 5 blocked integration tests (no Supabase credentials in this sandbox — unchanged constraint from every prior session); `RelationshipIntelligenceDomain`'s activation trigger (Gap Analysis G-6 — a product decision about *when* to activate, not an engineering task this session was positioned to make unilaterally); `WorkspaceIntelligenceDomain.enforceComplianceConstraints()`/`.syncSharedVocabulary()` (Phase 2 governance work, explicitly scoped later than this platform's current phase); visual-feature → Learning promotion (ADR-001 §5, no consumer until Epic 3, per Session 5's own note, unchanged); `IntelligenceOS.recordCorrection()` (see item 3 above); root `tsconfig.base.json`/lint config/CI definition (Gap Analysis G-8 — standard hygiene, genuinely lower-leverage than the completion work above, and not blocking anything the audit or this mission flagged as broken).

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

-- 4. Epic 2 / E2-1-T1 — decided and applied to schema.sql in Session 6
-- (Completion Mission): `degraded` and `confidenceScore` are genuine
-- row-level blueprint state and now have columns + a persistBlueprint()
-- write path. `buildDurationMs` was deliberately NOT added — per this
-- migration's own original note, it's a performance metric, not blueprint
-- state, and a better fit for an observability pipeline than a row-level
-- audit column; it remains returned to the caller only. Still needs to be
-- APPLIED to a live Supabase instance (schema.sql is the source of truth
-- but nothing in this sandboxed session had live DB access) — this is now
-- migration #4 in the "apply to live Supabase" queue below, alongside #1–3.
ALTER TABLE intelligence.artifact_blueprints
  ADD COLUMN IF NOT EXISTS degraded BOOLEAN,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC;
```

### Required: Integration tests against live infrastructure

| Test | Depends on |
|---|---|
| E1-1: `reviewLearning` persists to `intelligence.learnings` | Live Supabase, migration #3 |
| E1-2: two users, same workspace, shared voice in blueprint | Live Supabase, migrations #1–3 |
| E1-3: `getBrandSummary` returns correct counts | Live Supabase |
| E1-4: visual features column write + read | Live Supabase, migration #1 |
| **Blueprint persistence with `degraded`/`confidence_score`** *(new, Session 6)* | Live Supabase, migration #4 |
| Epic 2: `npm publish --dry-run` against built `dist/` for both packages | Registry access/credentials |

### Optional / deferred (not blocking)

| Item | Priority | Notes |
|---|---|---|
| Visual mood → Learning promotion | Medium | ADR-001 §5 requirement; no consumer until Epic 3. Still open after Session 6 — see Next Recommended Implementation Task. |
| E1-5 threshold calibration | Low | Calibrate against real classification data once a consumer exists |
| Raise vitest coverage thresholds | Low | Still 40/30 from the Sprint 0 annotation (Gap Analysis G-4). Session 6 added dedicated coverage for one previously-untested method (`LearningValidator.maybeConfirm()`, via `UserCorrection.test.ts`) but did not add the remaining `HypothesisEngine`/`LearningValidator.evaluate()`/`ProfileBuilder`/`ProjectContextBuilder` unit files G-4 calls for, so the threshold is still left at its Sprint 0 value. |
| Persist `buildDurationMs` to `artifact_blueprints` | Low | Deliberately NOT done in Session 6 — see migration #4 above; `degraded`/`confidenceScore` were persisted, `buildDurationMs` was judged out of scope for a row-level audit column and left for an observability pipeline instead. |
| Rename `ProjectInput.brandosProjectId` (and the matching DB column, `getProjectByBrandosId()`) | Low | Identified Session 5, **still not acted on** — same reasoning as before: it's a live DB column rename that should be bundled with the next live-DB migration pass, not done in isolation from a sandboxed session with no DB access. |
| `IntelligenceOS.recordCorrection()` (emitter side of `intelligence.user.correction`) | Medium | New finding, Session 6 (Gap Analysis G-12). The event's *handler* side is now fully wired (`FeedbackProcessor.processCorrection()` → `LearningValidator.maybeConfirm()`); nothing yet *emits* the event. This is a public `IIntelligenceProvider`/`IntelligenceOSProvider` contract addition and deserves its own considered session, not a quick addition to this one — see Session 6 entry below for the reasoning. |

---

## Known Gaps (Epic 2 additions — see `GAP_ANALYSIS.md` for the full pre-existing list, G-1/G-2/G-3/G-9/G-11 of which are now marked resolved/addressed there as of Session 6)

| Item | Severity | Description |
|---|---|---|
| `buildDurationMs` not persisted | 🟢 Low | Deliberately deferred (see migration #4 above) — `degraded`/`confidenceScore` were persisted in Session 6, `buildDurationMs` was judged a better fit for an observability pipeline than a row-level audit column. Still returned to the caller. |
| `ProjectInput.brandosProjectId` / `getProjectByBrandosId()` field & method naming | 🟢 Low | A platform meant for any consumer shouldn't have a field named after one specific one. Identified Session 5, **still not fixed** as of Session 6 — same reasoning as before: it touches a live DB column name and should be bundled with the next live-DB migration pass rather than done in isolation. |
| `IntelligenceOS.recordCorrection()` does not exist | 🟡 Medium | New this session (Gap Analysis G-12). `FeedbackProcessor` can now handle `intelligence.user.correction` if something emits it, but nothing does yet — the emitter side of this capability is unbuilt. Deliberately left out of Session 6's scope: it's a new addition to the `IIntelligenceProvider`/`IntelligenceOSProvider` public contract and deserves its own considered decision about method signature and versioning (see Decision 7/8 for how seriously this platform treats public-contract changes), not a quick addition alongside an internal wiring pass. |

Everything else flagged in `GAP_ANALYSIS.md` (G-4 through G-8, G-10) is **unchanged and untouched** this session except where noted above (G-4 partially addressed) — those remain Epic 1 architecture/process concerns.

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

### Decision 14 (Session 6, Completion Mission): hypotheses belong to `UserIntelligenceDomain`, not a seventh domain

Gap Analysis G-2 left this as an explicit open question when it was first written: "whether `intelligence.hypotheses` should get a dedicated owning domain method set of its own... the current code doesn't cleanly fit 'hypotheses are owned by UserIntelligenceDomain' without that domain also picking up the in-progress, not-yet-validated parts of the model." Session 6 resolved it in favor of extending `UserIntelligenceDomain` rather than creating a new domain: hypotheses are pipeline-internal, in-progress precursors to Learnings — the table `UserIntelligenceDomain` already owns — with no independent product concept of their own outside the Learning Pipeline's own state machine. Nothing outside `pipeline/` reads or writes a Hypothesis directly. A dedicated domain would add a boundary with no distinct consumer on the other side of it, which runs against the same "smallest implementation that satisfies the contract" philosophy Decision 8 already applied elsewhere (Bootstrap §12). If a future need emerges for hypotheses to be independently queryable by something outside the Learning Pipeline, that's the trigger to revisit this decision — not before.

### Decision 15 (Session 6, Completion Mission): `degraded`/`confidenceScore` get columns; `buildDurationMs` doesn't

Session 5 (Decision 9/10) defined what these three `ArtifactBlueprint` fields mean but deferred the schema question entirely. Session 6 decided it: `degraded` and `confidenceScore` describe the blueprint itself — they're as much "blueprint state" as `sections` or `voiceDirectives`, just computed rather than assembled, and an audit trail of blueprints that's silently missing this state for every row is a real gap. `buildDurationMs` is different in kind: it's a measurement *about* the build process, not a property *of* the resulting blueprint, and the codebase already has a clear pattern for where process-performance data belongs (nowhere yet, but explicitly not in an entity's own persisted row) — bundling it into `artifact_blueprints` would conflate "what was built" with "how long building it took" in a way that makes the table harder to reason about for exactly the audit/correlation purpose it exists for. If build-duration tracking becomes a real need, it should get its own observability path (structured logging, a metrics table, or an APM integration), not a column here.

---

## Public Platform Surface

Maintained separately, in full, in **`docs/EPIC2_PUBLIC_PLATFORM_SURFACE.md`** — exported interfaces, DTOs, events, adapters, provider implementations, and SDK entry points, with an explicit statement that everything not listed there is internal. Read that file for the actual list; this document doesn't duplicate it.

## Consumer Adoption Checklist

Maintained separately in **`docs/EPIC2_CONSUMER_ADOPTION_CHECKLIST.md`** — every task this session identified as belonging to a consumer application (BrandOS or otherwise) rather than to this platform, with enough detail that a consumer's engineer could act on each item without needing anything from this repository beyond what's already published.

---

## Next Recommended Implementation Task

**There is no further platform-side implementation work that doesn't require either live infrastructure (a real Supabase project + registry credentials), a consumer's source tree (BrandOS), or a product decision this session wasn't positioned to make unilaterally (Relationship Intelligence activation, Workspace Compliance governance scope).** Session 6 closed the highest-leverage engineering-only gaps identified by the Capability Audit; what's left genuinely needs one of those three things.

Recommended next steps, in priority order:
1. **Apply the 4 pending schema migrations** (the original 3 from Epic 1, plus Session 6's `degraded`/`confidence_score` columns) to a real Supabase test project, then run the 5 (now 6, including the new blueprint-persistence assertion) live-infrastructure integration tests listed under "Remaining Work." This closes Epic 1 exit criteria 1, 2, 3, and 5, plus verifies Session 6's blueprint-persistence work against a real database for the first time.
2. **Build `IntelligenceOS.recordCorrection()`** (or the equivalent `IIntelligenceProvider` addition) — the emitter half of the `intelligence.user.correction` capability Session 6 connected the handler side of. This is a public-contract addition; treat it with the same care as Decision 7/8 (Epic 2) — a considered method signature and a CHANGELOG entry, not a quick addition.
3. **`npm publish --dry-run`** for both packages against their built `dist/` output, on a machine with registry credentials — unchanged from Session 5, still blocked on the same missing credentials.
4. Hand `docs/EPIC2_CONSUMER_ADOPTION_CHECKLIST.md` to whoever owns BrandOS's codebase. Nothing further on the platform side blocks them from starting.

---

## Session History

| Session | Scope | Outcome |
|---|---|---|
| Session 1 | Blueprint Assembly + Sprint 0 core | Blueprint pipeline, core domain stubs, Sprint 0 write paths |
| Session 2 | Learning Pipeline + Knowledge Intelligence | `FeedbackProcessor`, `KnowledgeProcessor`, `HypothesisEngine`, `LearningValidator`, `ProfileBuilder` |
| Session 3 | Epic 1 (E1-1 through E1-5) | All 5 Epic 1 tasks implemented; 66 new tests; 316/316 passing; TypeScript clean |
| Stage Gate | Epic 1 / Epic 2 boundary review | Repository verified; Epic 2 assessed; E1-2 Phase C identified as blocking gap |
| Session 4 | E1-2 Phase C — Workspace Voice Layer | `NarrativePlanner` 4-level hierarchy; `BlueprintBuilder` workspace fetch; 16 new tests; 332/332 passing; TypeScript clean |
| Session 5 | Epic 2 — Platform Publication | Platform identity cleanup (G-1: npm scope + event namespace, one breaking pass); `ArtifactBlueprint.degraded`/`.confidenceScore`/`.buildDurationMs` (E2-1-T1); `IIntelligenceProvider` + `IntelligenceOSProvider` published from this platform (E2-2/E2-4, Decision 7); ArtifactType-openness spike resolved with no translation layer needed (E2-1-T3); standalone `check-boundaries.mjs` enforcing RULE-IOS-ISOLATION + RULE-SIT-ISOLATION (E2-0'-T3/E2-1-T5/E2-4-T2/E2-6); package publication readiness for both packages (versions, `publishConfig`, build scripts, READMEs, CHANGELOGs, `.gitignore`); 4 pre-existing `noImplicitAny` typecheck errors fixed (environmental, surfaced by an installed TS patch version newer than the one last verified against); 59 new tests (391/391 passing, up from 332/332); TypeScript clean; boundary check clean. E2-3, E2-5, and the BrandOS-side half of E2-6 documented as Consumer Adoption, not implemented, per Epic 2's "never require consumer source" rule. |
| **Session 6** | **Completion Mission — post-Epic-2 architectural completion pass** | Gap Analysis G-2 resolved in full (`pipeline/`+`knowledge/` no longer hold a `SupabaseClient`; `UserIntelligenceDomain`/`KnowledgeIntelligenceDomain`/`ArtifactIntelligenceDomain` gained the real write/read methods their intended callers now use; `RULE-PIPELINE-NO-DIRECT-DB` added to `check-boundaries.mjs` to prevent regression); `POST /v1/knowledge/ingest` wired up in both HTTP hosts (was 501 on every real deployment despite the capability being fully implemented); `intelligence.user.correction` connected on the consumer side (`FeedbackProcessor.processCorrection()` → `LearningValidator.maybeConfirm()`, previously a fully-built but uncalled capability); `ArtifactBlueprint.degraded`/`.confidenceScore` now persisted to `artifact_blueprints` (schema migration #4 drafted, not yet applied); one documentation-drift correction (`persistBlueprint()` was already real, a stale docblock said otherwise); `GAP_ANALYSIS.md` G-2 and G-4 status updated, new G-12 finding added documenting the "implemented but disconnected" pattern found in items 2 and 3; 13 new tests (450/450 passing, up from 437/437); TypeScript clean across all 6 workspace packages; boundary check clean (3 rules, up from 2). |
