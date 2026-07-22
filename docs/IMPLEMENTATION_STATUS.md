# Implementation Status

**Current state of the repository, verified directly against source as of this update.** This supersedes every prior status document; earlier snapshots are preserved for continuity at [`archive/sessions/`](./archive/sessions/).

> **Maintenance note:** Update this document whenever a package version changes, a domain method moves from stub to real, or a Known Issue is resolved or newly discovered. Prefer re-verifying a claim against source (`grep` the actual method body, run the actual test suite) over copying forward a claim from the previous version of this file — several inaccuracies found in earlier documentation passes existed specifically because a claim was copied forward without re-verification. This update found the same lesson apply in the other direction too: the previous version of this document had already noted two issues (`G-2`'s domain-boundary bypass, and the un-wired Knowledge Ingest route) that turned out to have been fixed since — re-verify claims of *open* issues too, not just claims of *resolved* ones. **This update's own version of that lesson:** the immediately-prior documentation pass recorded `ADR-003`'s generalization as a decision only ("not yet implemented," throughout). It is implemented as of this update — re-verified directly against the method bodies and test run below, not carried forward from the ADR's own record of its intent.

## 1. At a glance

| | |
|---|---|
| **Packages** | `@intelligence-os/shared-types` `0.2.0` · `@intelligence-os/core` `0.5.0` · `@platform/cognition-contract` `1.1.0` |
| **Apps** | `@intelligence-os/api` `0.1.0` · `@intelligence-os/demo` `0.1.0` · `@intelligence-os/playground` `0.1.0` |
| **TypeScript** | Clean (`pnpm -r typecheck` — 0 errors, 6 of 7 workspace projects have a typecheck script) |
| **Tests** | 600 / 600 passing, 40 test files, `@intelligence-os/core` (`pnpm --filter @intelligence-os/core test`) — up from 509/509 across 34 files; 91 new tests added this update in the IntelligenceOS Completion Plan execution session (§3, fifth session): dedicated unit-test files for `HypothesisEngine` (23), `LearningValidator` (16), `ProfileBuilder`'s pre-ADR-004 logic (19), `ProjectContextBuilder` (12), the new activation-trigger counter (10), the new `confidenceMerge` helper (7), plus `recordCorrection()` emitter coverage folded into the existing `UserCorrection.test.ts`/`E2-4.intelligenceOSProvider.test.ts` (4) |
| **Boundary check** | Clean — `RULE-IOS-ISOLATION`, `RULE-SIT-ISOLATION`, `RULE-PIPELINE-NO-DIRECT-DB`: 0 violations each |
| **CI** | `.github/workflows/ci.yml` — runs `pnpm validate` (typecheck + boundary check + lint) and `pnpm test` on every PR/push. **New this update** (§3, fifth session); previously none configured. |
| **Lint** | `eslint.config.mjs` (workspace-wide, flat config) — `pnpm lint`, folded into `pnpm validate`. **New this update**; 0 errors, 8 pre-existing warnings in test-file dead code (unused test helpers), left as-is (warnings, not errors; not part of this session's scope). |
| **Live-database integration tests** | Not run in this environment — they require a real Supabase project (see §4). Unchanged this update: still `migrations/002`/`004`/`005`, none applied. |

## 2. What's implemented

Two independent public surfaces, both real (see [`ARCHITECTURE.md`](./ARCHITECTURE.md) §4 for the full picture):

- **`IIntelligenceProvider`** (in-process SDK): `buildBlueprint`, `recordFeedbackEvent`, `ingestKnowledgeAsset`, `ingestWorkspaceConfiguration`, `upsertProject`, `reviewLearning`, `getBrandSummary`, `recordCorrection` — all live. `IntelligenceOS` implements this directly. `recordCorrection` promoted onto the interface this update (§3, fifth session) — the emitter half of `intelligence.user.correction`; the handler side had existed since the first session this update.
- **`CognitionProvider`** (HTTP, cross-platform contract with BrandOS): `resolveCognitionContext`, `observe`, `review`, `summarizeCognition`, `checkHealth` — all live, hosted by `apps/api`, unchanged this update. See [`PLATFORM_CONTRACT.md`](./PLATFORM_CONTRACT.md).

Six domains, three pipelines, all described in detail in `ARCHITECTURE.md` §6–§10. **All domain-ownership boundary violations are now resolved** (see §3) — every write anywhere in the codebase to an `intelligence.*` table now goes through its owning domain, and this is now mechanically enforced rather than only documented. Five of six domains are fully real or real-except-one-deliberately-deferred-method; `RelationshipIntelligenceDomain` remains inert for every real operation (every method but one still throws `DomainNotActivatedError`), but its activation-trigger *check* is now real and tested (`checkActivationTrigger()`, §3 fifth session) rather than undetectable from code — the check itself does not activate anything. The Learning Pipeline, Blueprint Pipeline, and Knowledge Pipeline are all fully wired and exercised by the test suite end to end.

Two runtime hosts for the HTTP surface (`apps/api/src/server.ts` for long-running processes, `apps/api/api/cognition.ts` for Vercel), both calling the identical routing/auth logic (`createCognitionHttpServer`, from `@intelligence-os/core`), **and both now also wiring up the optional Knowledge Ingest route** (`POST /v1/knowledge/ingest`) — see §3. See [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## 3. What changed this update: the Completion Mission session

A session with an explicit mandate — *completion, not redesign*: finish partial implementations, connect dormant-but-implemented capabilities, remove architectural inconsistencies, strengthen correctness/tests, in that priority order, without altering the existing architecture. No live Supabase or npm-registry access was available (same constraint as every prior session); all of this is code, tests, and documentation.

1. **Gap Analysis G-2 resolved in full — the domain-ownership boundary violation this document previously listed as the top Known Issue.** `HypothesisEngine`, `LearningValidator`, and `ProfileBuilder` (`pipeline/`) no longer hold a `SupabaseClient` — each takes a `UserIntelligenceDomain` instance and calls its methods instead. `UserIntelligenceDomain` gained real `upsertProfile()`/`insertLearning()` (previously stubs — this document's prior claim that they only needed call-site routing was itself wrong; they had to be implemented for real first, which is what happened here), plus `markPreviousProfilesNonCurrent()`, `getAllActiveLearnings()`, `countLearningsSince()`, `getLatestValidatedLearning()`, `confirmLearning()`, and a full Hypothesis CRUD surface. `knowledge/KnowledgeProcessor.ts` similarly no longer holds a `SupabaseClient` — it takes a `KnowledgeIntelligenceDomain`, which gained `persistExtracted()`. **Found in the same pass, not originally in G-2's scope:** `pipeline/FeedbackProcessor.ts` itself held a `SupabaseClient` for one `feedback_events` update; `ArtifactIntelligenceDomain` gained `markSignalsExtracted()` and `FeedbackProcessor` now takes `ArtifactIntelligenceDomain` as a constructor argument instead. **Mechanical enforcement added:** `RULE-PIPELINE-NO-DIRECT-DB` in `check-boundaries.mjs` now fails the boundary check if `pipeline/`, `knowledge/`, `blueprint/`, or `context/` import `@supabase/supabase-js` — covered by 6 new tests.
2. **`POST /v1/knowledge/ingest` wired up — the other issue this document previously flagged as an open Known Issue.** Both `apps/api/src/server.ts` and `apps/api/api/cognition.ts` now pass `intelligenceOS` as `createCognitionHttpServer`'s third (`KnowledgeIngestPort`) argument. This route returned `501` on every real deployment before this session, despite the Knowledge Pipeline behind it being fully implemented and already reachable via the SDK path. `apps/demo/src/index.ts` gained a sixth smoke-test step exercising it, and `apps/api/README.md`/`apps/demo/README.md` (which this repository's prior documentation pass did not touch, since they weren't stale at the time) have been updated to match.
3. **`intelligence.user.correction` connected end-to-end, consumer side.** `LearningValidator.maybeConfirm()` and the `UserCorrectionPayload` event contract existed before this session but had no caller anywhere. `FeedbackProcessor.register()` now also subscribes to `intelligence.user.correction` and routes it through a new `processCorrection()` method. New test file: `tests/unit/pipeline/UserCorrection.test.ts` (7 tests). **Not done:** the emitter side (a public `IntelligenceOS.recordCorrection()`-equivalent method) — see §5 Known Issues.
4. **`ArtifactBlueprint.degraded`/`.confidenceScore` now persisted.** `persistBlueprint()` was already a real, fully-implemented, already-called method — its own header docblock incorrectly listed it as a stub, corrected this session (a documentation-drift finding, not a code finding). `degraded` and `confidence_score` columns were added directly to `artifact_blueprints` in `schema.sql`, and `persistBlueprint()`'s insert now writes both — verified directly in the method body. `buildDurationMs` remains deliberately unpersisted (judged a better fit for an observability pipeline than a row-level audit column).

**Test/type/boundary status at end of this change:** 450/450 tests passing (437 pre-existing + 13 new), up from 437/437. `pnpm -r typecheck` clean across all 6 buildable workspace packages. `pnpm check:boundaries` clean, now checking 3 rules instead of 2. All four claims above were independently re-verified against the actual method bodies and file contents for this documentation update, not taken on the strength of the session's own record of itself.

**Deliberately not attempted this session** (per that session's own record, carried forward here): live-database migration application (no Supabase credentials); `RelationshipIntelligenceDomain`'s activation trigger (a product decision, not an engineering task); `WorkspaceIntelligenceDomain.enforceComplianceConstraints()`/`.syncSharedVocabulary()` (Phase 2 governance, explicitly scoped later); visual-feature → Learning promotion (`ADR-001` §5, no consumer yet); `IntelligenceOS.recordCorrection()` (a public-contract addition judged to deserve its own considered decision); root `tsconfig.base.json`/lint config/CI definition (standard hygiene, lower leverage than the completion work above).

### Second session this update: Subject-Centric Intelligence (`ADR-003`, fully implemented)

The immediately-prior documentation-only pass recorded `ADR-003` as a decision record and updated `ARCHITECTURE.md`/`PLATFORM_CONTRACT.md`/`ROADMAP.md`/`packages/cognition-contract/README.md` to describe it as a *target*, explicitly not yet implemented. This session implements it, following `ROADMAP.md`'s sequenced steps exactly:

1. **`subject_type` discriminator added.** `migrations/004_subject_centric_intelligence.sql` — `learnings` gains the discriminator column (its `user_id`/`workspace_id` were already nullable per migration 002); `hypotheses`, `signals`, and `profiles` each gain a `workspace_id` column, a relaxed (nullable) `user_id`, the discriminator, and matching owner-required/discriminator-match `CHECK` constraints, following 002's pattern exactly. Not yet applied to any live database in this environment (see §4) — same constraint every prior session has recorded.
2. **The Learning Pipeline generalized to a `SubjectRef` (`types/subject.ts`: `{ subjectType: 'user' | 'workspace', subjectId: string }`).** `SignalExtractor`, `ObservationBuilder`, `HypothesisEngine`, `LearningValidator`, and `ProfileBuilder` all read/write via Subject rather than an assumed user id. **Backward compatible by construction, not by accident:** every existing User-scoped method on `UserIntelligenceDomain` (`getCurrentProfile`, `getAllActiveLearnings`, `countLearningsSince`, `markPreviousProfilesNonCurrent`, `findOpenHypothesis`, `createHypothesis`, `discardExpiredHypotheses`) is unchanged in name and behavior — each is now a one-line wrapper over a new `...ForSubject` counterpart (`getCurrentProfileForSubject`, etc.). `insertLearning()`/`upsertProfile()` needed no new counterpart at all: `Learning`/`IntelligenceProfile` already carry `workspaceId`/`subjectType` fields, so the same method now writes either Subject type depending on what its input carries.
3. **`ObservationInput → Signal[]` translation built.** `SignalExtractor.extractFromObservation()` is the new Stage-1 entry point for a Workspace subject, applying real (if intentionally conservative — no LLM, no textual analysis of `outputText`, per this codebase's heuristic-only Implementation Philosophy) taxonomy classification: `success_metrics` from the observed governance score (source quality downgraded to `inferred` when the artifact was governance-repaired), plus `expertise_domains` when a `topic` is reported. `context/observationToWorkspaceLearning.ts` — the hand-written, single-category shortcut this supersedes — has been deleted; nothing referenced it outside the files this session changed. `FeedbackProcessor.processObservation()` is the new Workspace-subject pipeline orchestrator, structurally identical to the existing `process()` (fire-and-forget, per-stage error containment into `PipelineRunResult.errors`, never throws). `CognitionProviderImpl.observe()` now calls it instead of writing directly to `WorkspaceIntelligenceDomain.upsertWorkspaceLearning()` (which remains a real, tested, available method — just no longer `observe()`'s path).
4. **Workspace-subject identity synthesis added to `ContextBuilder`.** New module `context/identitySynthesis.ts`: projects a workspace's identity-relevant Learnings (`professional_identity`, `intellectual_frameworks`, `strategic_thinking_patterns`, `personal_brand_signal`), confidence-gated at ≥0.5, into an `IdentityContribution` — highest-confidence Learning wins per field, the same merge discipline `voiceMapping.ts`'s `deriveVoiceProfile()` already used. Returns `null` only when a workspace genuinely has no identity-relevant Learnings yet. `ContextBuilder.build()` now also reads `WorkspaceIntelligenceDomain.getContext()` (previously unused by this builder) to apply explicit voice configuration ahead of Learning-derived voice — see next item.
5. **Known Contract Gap #2 closed.** `WorkspaceContext` gained a `voiceConfiguration` field; `KnowledgeIntelligenceDomain.upsertWorkspaceConfiguration()` persists explicit, admin-declared workspace configuration as a `KnowledgeAsset` (`ownerType: 'workspace'`, `assetType: 'reference'`, `confidence: 1.0` — Knowledge, not Experience, needs provenance rather than corroboration), upserting in place (at most one "current configuration" row per workspace) via the existing `persistExtracted()` write path rather than a new one. `IntelligenceOS.ingestWorkspaceConfiguration()` is the new in-process entry point — a concrete method, deliberately **not** yet added to `IIntelligenceProvider` (see Known Issues below). `ContextBuilder` applies it with full precedence over Learning-derived voice on every field it declares.

**Test/type/boundary status at end of this change:** 468/468 tests passing (450 pre-existing + 18 new), up from 450/450, across 28 test files (up from 27 — new: `tests/unit/knowledge/workspaceConfiguration.test.ts`). New/extended test coverage: `SignalExtractor.extractFromObservation()` (7 tests), `CognitionProviderImpl.observe()`'s pipeline delegation (2 new tests), `ContextBuilder`'s identity synthesis and voice-configuration precedence (3 new tests), `FeedbackProcessor.processObservation()` (3 new tests), `KnowledgeIntelligenceDomain.upsertWorkspaceConfiguration()` (3 new tests). `pnpm -r typecheck` clean across all 6 buildable workspace packages. `pnpm --filter @intelligence-os/core run check:boundaries` clean, all 3 rules, 0 violations. All of the above independently re-run against this session's own source, not taken on the strength of this session's own record of itself.

**Deliberately not attempted this session, recorded as follow-up decisions rather than silently deferred:**
- **`IntelligenceOS.ingestWorkspaceConfiguration()` is not part of `IIntelligenceProvider`.** Same treatment as `IntelligenceOS.recordCorrection()` below — Architectural Rule 7 asks that a public-contract addition be a considered, separately-reviewed decision about method signature and versioning, not bundled into a generalization session.
- **No `CognitionProvider` HTTP route or BrandOS-side admin surface for workspace configuration.** `PLATFORM_CONTRACT.md` §5 forbids a sixth `CognitionProvider` operation added to serve one feature; which transport/auth an admin-facing configuration write belongs behind is a separate, undecided question.
- **A contributing User's identity is not composed into a Workspace's, additively.** `CognitionRequest` still carries no `userId` — `ADR-003` §2.3/§5 explains why this was not attempted; today's Workspace identity is synthesized purely from the workspace's own Learnings.
- **Live-database verification of migration 004** — no Supabase credentials in this environment, same constraint as every prior session.
- **`ADR-002`'s incomplete migration, the remaining test-coverage gap (`HypothesisEngine`/`LearningValidator.evaluate()`/`ProfileBuilder`/`ProjectContextBuilder` still lack dedicated unit-test files — this session added dedicated coverage for the *new* Subject-generic behavior, not for the pre-existing gap), and CI** — unrelated to this session's scope, unchanged.

### Third session this update: Completion Mission — independent ADR-003 audit, verified and closed

An independent `ADR-003 Compliance Audit` was supplied alongside this session's mission brief, making specific, file-and-line claims about the Subject-Centric Intelligence work above. Per that brief's own instruction, every claim was independently re-verified against source rather than taken on trust — the audit turned out to be accurate on every claim checked (a rarer outcome than the phrasing "independently verified" might suggest is guaranteed; it is recorded here because it wasn't assumed in advance). Findings and disposition:

- **D-1 (documentation-accuracy only, no runtime effect):** the ADR-003 §8 addendum claimed `context/observationToWorkspaceLearning.ts` "has been deleted"; the file was still present, unimported dead code. **Fixed by deleting the file** — the addendum's own claim is now true rather than needing a correction to the claim itself.
- **D-2 (latent duplication risk, no runtime effect):** `identitySynthesis.ts`, `voiceMapping.ts::deriveVoiceProfile()`, and `NarrativePlanner` are three independently-coded implementations of the same confidence-ordered field-merge pattern. **Not addressed this session** — genuinely low-risk today (all three agree), but a real maintenance hazard if the merge-precedence rule ever needs to change. Recorded as a Known Issue below rather than refactored under this session's time budget; consolidating three call sites' merge logic into one shared helper is a contained, well-scoped follow-up.
- **D-3 (real gap, now closed):** `identitySynthesis.ts` drew only from `Learning[]` (Experience); ADR-003 §2.3's own text promises identity is derived from "a Subject's own Knowledge **and** Experience." **Closed:** `WorkspaceConfigurationInput`/`WorkspaceContext`/`upsertWorkspaceConfiguration()`/`getContext()` all gained a symmetric `identityConfiguration` field alongside the existing `voiceConfiguration` field, and `ContextBuilder` gained `applyIdentityConfiguration()` — the same authority relationship (`applyVoiceConfiguration()` already has with Learning-derived voice) applied to `identity` instead. 5 new tests.
- **D-4 (real gap, now closed):** `ingestWorkspaceConfiguration()` was a real, correct, fully-tested method with zero reachable callers — absent from `IIntelligenceProvider`, absent from any HTTP route. This was previously *disclosed*, not hidden (§5 below, "Deliberately not attempted"), but a correctly-implemented half of ADR-003 that nothing could ever call is not a completed architectural commitment. **Closed, as the Architectural-Rule-7-mandated "separate, considered decision" this gap was waiting on:** promoted onto `IIntelligenceProvider` (additive, non-breaking — every existing implementer, including `IntelligenceOS` itself, already had the method); `IntelligenceOSProvider` gained the delegating method; `KnowledgeIngestPort` gained an optional `ingestWorkspaceConfiguration` method, wired to a new `POST /v1/workspace-configuration` HTTP route in `api/http/server.ts`, following exactly the existing `ingestKnowledgeAsset`/`/v1/knowledge/ingest` precedent (optional port, 501 when unconfigured). Both `apps/api/src/server.ts` and `apps/api/api/cognition.ts` already pass the concrete `intelligenceOS` instance as this port, so both deployment targets picked up the new route with a comment-only change, no new wiring code. `packages/intelligence-os/src/dev/serve.ts` (which passes an object literal, not the concrete instance) was updated explicitly for parity. 6 new tests (delegation, HTTP route auth/validation/success, real `getContext()` read path).
- **D-5 (real, largest remaining gap — not closed this session):** ordinary document-extracted Knowledge (`VocabularyExtractionResult`/`FrameworkExtractionResult`/`PatternExtractionResult`, written by `KnowledgeProcessor.persistAsset()` on every real upload) is structurally invisible to `ContextBuilder`, which only reads the two narrow JSON keys (`complianceConstraints`, `voiceConfiguration`, now also `identityConfiguration`) that only `upsertWorkspaceConfiguration()` ever writes. **Deliberately not attempted this session** — closing it well requires an actual design decision (which fields of an arbitrary `FrameworkExtractionResult`/`VocabularyExtractionResult` should feed `voice`/`identity`, and with what confidence/precedence relative to explicit configuration and Learnings) rather than a mechanical wiring fix, and inventing that heuristic under this session's own time budget risked exactly the kind of "smallest implementation that satisfies the contract" corner-cutting `ARCHITECTURE.md` §13 warns against normalizing. See "Recommended next steps" below and the new Known Issue entry.

**Test/type/boundary status at end of this session:** 481/481 tests passing (468 pre-existing + 13 new), up from 468/468, across 29 test files (up from 28 — new: `tests/unit/milestone2/M2-domain.getContext.test.ts`). `pnpm -r typecheck` clean across all 6 buildable workspace packages. `pnpm --filter @intelligence-os/core run check:boundaries` clean, all 3 rules, 0 violations.

### Fourth session this update: EM-8 — ADR-004 (Cognitive Consolidation) implementation

Implements `docs/adr/ADR-004-cognitive-consolidation.md` per its accompanying Engineering
Blueprint. Faithful implementation, not a redesign — the blueprint's own §0 validation pass had
already resolved the major open design questions (union-vs-override combination rules,
`positioning`'s Experience-only scope, the debounced Knowledge rebuild trigger). Two further,
narrower gaps surfaced only once actual implementation traced the real entities and event
payloads involved, both documented rather than silently patched around:

- **`intelligence.signal.extracted`'s payload was missing `ownerType`/`workspaceId`.**
  `FeedbackProcessor.processKnowledgeExtraction()` needs to resolve the correct `SubjectRef` (User
  or Workspace) for an uploaded asset, but the event's pre-existing emission only ever carried
  `userId`. `KnowledgeProcessor` already had `job.ownerType`/`job.workspaceId` in scope at the
  emission point (used immediately above for `persistAsset()`) — genuinely a forwarding omission,
  not a missing capability. Fixed by adding both fields to that one emit call.
- **`SynthesizedCollection.hasConflict` has no Knowledge-side signal to reuse.** The ADR's §7.3
  called for reusing "each source's own existing contradiction signal." `Learning.state ===
  'FLAGGED'` is a real, existing Experience-side signal. `KnowledgeAsset` has no persisted
  equivalent — its `version`/`isCurrent` mechanism only distinguishes historical from current
  assets, which synthesis never sees in the first place (`getCurrentAssetsForSubject()`'s
  `isCurrent` filter already excludes superseded versions upstream). `hasConflict` is therefore
  only ever set from the Experience side today; this is recorded as a genuine, narrow ADR-versus-
  entity gap in the ADR's §6, not resolved by inventing a Knowledge-side heuristic in code.
- **Schema strategy corrected against demonstrated repository precedent.** The blueprint's File
  Impact Matrix called for modifying `schema.sql`'s baseline `profiles` table directly. On
  implementation, that table was found to still reflect the pre-ADR-003 shape — neither prior
  profiles-table migration (`002`, `004`) had been folded back into the baseline, an already-
  documented convention (§4 below). `005_cognitive_consolidation.sql` follows that same,
  established pattern (migration file only) rather than introducing a third, inconsistent one.

**What shipped:** `ProfileBuilder` reads a Subject's current Knowledge alongside Experience at
every rebuild (`KnowledgeIntelligenceDomain.getCurrentAssetsForSubject()`, new); `IntelligenceProfile`
gained `knowledgeSummary`/`reasoningSummary`/`positioningSummary` (new `SynthesizedCollection<T>`
shape) and a corrected `vocabularySnapshot`; a fourth, debounced rebuild trigger fires off the
Knowledge Pipeline's existing `intelligence.signal.extracted` event via a new
`FeedbackProcessor.processKnowledgeExtraction()` entry point; `ContextBuilder`/`CognitionContext`
expose the result as three new, additive, nullable fields (`knowledge`/`reasoning`/`positioning`;
contract bumped `1.0.0` → `1.1.0`). Closes Compliance Audit finding D-5.

**Test/type/boundary status at end of this session:** 509/509 tests passing (481 pre-existing +
28 new), up from 481/481, across 34 test files (up from 29 — new: `tests/unit/adr-004/` (4 files)
and `tests/integration/ADR-004.pipeline-wiring.integration.test.ts`). `pnpm -r typecheck` clean
across all 7 buildable workspace packages. `pnpm --filter @intelligence-os/core run
check:boundaries` clean, all 3 rules, 0 violations. One of the new `ContextBuilder` tests caught a
real bug during implementation (the profile-projection helper returned a generic `items` key
where the contract shape needed `themes`/`conclusions`/`statements`, and an unsafe type cast had
silently hidden the mismatch from `tsc`) — fixed before this entry was written; the corrected code
no longer relies on any unsafe cast for this projection.

### Fifth session this update: IntelligenceOS Completion Plan execution

A session with an explicit mandate — execute the previously-produced Completion Plan
(itself built from `ADR-005_Architecture_Governance_Synthesis.md`, treated as the
authoritative backlog), not produce further analysis. Scope: every remaining
Engineering/Technical-Debt/Operational-preparation item and the small architecture
decisions the plan had already identified as resolvable without a Product Question.
Product-gated items (`audience`/`guidance`/positioning's Knowledge-side input/
Multi-Subject identity) and any future DomainOS/Domain-Intelligence architecture were
explicitly out of scope and left untouched. Unlike every prior session, this one had a
working `pnpm`/Node toolchain and network access to the public npm registry — still no
Supabase/live-database access, and no BrandOS repository access.

1. **Hygiene, closed in full.** `db/queries/`'s six empty placeholder files deleted
   (nothing imported from them). `packages/intelligence-os`'s package-root
   `AGENT_CONTEXT.md` moved from the repository root to
   `packages/intelligence-os/AGENT_CONTEXT.md`. Root `tsconfig.base.json` added — every
   package's `tsconfig.json` now extends it rather than repeating the same compiler
   options six times; verified typecheck stays clean across all 6 buildable packages
   after the change. `eslint.config.mjs` added (workspace-wide flat config, `pnpm
   lint`) — found and fixed two real, deliberate-but-unflagged lint issues
   (`no-control-regex` on `KnowledgeAssetExtractor.ts`'s intentional control-character
   strip, silenced with an inline comment rather than removed; an unnecessary regex
   escape in `VisualFeatureExtractor.ts`, removed) plus half a dozen genuinely-unused
   imports/locals across `StructurePlanner.ts`/`WorkspaceIntelligenceDomain.ts`/
   `KnowledgeProcessor.ts`/`PatternExtractor.ts` — all fixed; 0 lint errors as of this
   update, 8 pre-existing warnings left in test-file dead code (out of scope).
   `.github/workflows/ci.yml` added — `pnpm validate` + `pnpm test` on every PR/push,
   no live infrastructure required (every test in this suite mocks Supabase).
2. **Test-coverage gap closed.** Five new dedicated unit-test files (91 new tests
   total — see §1): `HypothesisEngine.test.ts` (23 — corroboration/contradiction math,
   stability-class thresholds, Subject-generic discard path), `LearningValidator.test.ts`
   (16 — state eligibility, the contradiction block, the escalation rule, Subject-aware
   Learning creation), `ProfileBuilder.test.ts` (19 — the three `shouldRebuild` triggers,
   the ADR-004 Knowledge-trigger debounce, composite-confidence weighting, versioning,
   event emission; deliberately does not duplicate the existing
   `ADR-004.ProfileBuilder.synthesis.test.ts`'s union-with-provenance coverage),
   `ProjectContextBuilder.test.ts` (12 — the fail-soft `degraded` pattern across all
   four sources, the project/global learning-scope filter), and
   `RelationshipActivationTrigger.test.ts` (10 — see item 4 below). `vitest.config.ts`'s
   coverage thresholds raised from the Sprint 0 defaults (`lines: 40, branches: 30`) to
   `lines: 85, branches: 78` — real measured coverage as of this update is ~89%
   lines / ~84% branches; thresholds sit a few points below that as headroom.
3. **`IntelligenceOS.recordCorrection()` built — the emitter side `IIntelligenceProvider`
   was missing.** `UserCorrectionInput` (`types/domains.ts`) is the considered,
   separately-reviewed public-contract addition `ARCHITECTURE.md` §11 Rule 7 asks for,
   following the exact treatment `ingestWorkspaceConfiguration()` received in the third
   session (§3 above): additive, non-breaking, added to `IIntelligenceProvider` and
   `IntelligenceOSProvider`, a `CHANGELOG.md` entry, a minor version bump (`0.4.0` →
   `0.5.0`). No new persistence table — like `ingestWorkspaceConfiguration()`, a
   correction's only durable effect is the Learning it confirms via
   `LearningValidator.maybeConfirm()`, so this method purely emits
   `intelligence.user.correction` with a stamped `occurredAt`. 4 new tests, extending
   the existing `UserCorrection.test.ts` and `E2-4.intelligenceOSProvider.test.ts`
   rather than duplicating their existing handler-side coverage.
4. **`RelationshipIntelligenceDomain`'s activation-trigger counting logic built.**
   `ArtifactIntelligenceDomain.countArtifactsWithNamedRecipients()` counts
   `artifact_blueprints` rows whose persisted `audience_calibration.isNamedRelationship`
   is true (the table this domain already owns and already writes via
   `persistBlueprint()`). `RelationshipIntelligenceDomain.checkActivationTrigger()`
   combines that count against Contracts §J.3's threshold (≥3) with the explicit-
   onboarding-signal escape hatch, and returns a real, queryable answer. **Deliberately
   advisory only:** every stub method on `RelationshipIntelligenceDomain`
   (`getRelationship`/`getActiveRelationships`/`getNamedAudienceProfile`/etc.) still
   throws `DomainNotActivatedError` regardless of what this check returns — building
   real named-relationship storage and read paths is separate, larger Phase 2 feature
   work, not part of this session's scope. 10 new tests, including one that explicitly
   asserts the stub methods are unaffected even when the trigger has clearly fired.
5. **Three independent confidence-merge implementations (Compliance Audit finding
   D-2) reduced to two.** New shared helper `context/confidenceMerge.ts`
   (`mergeByAscendingConfidence()`), now the one implementation both
   `identitySynthesis.ts::deriveIdentityContribution()` and
   `voiceMapping.ts::deriveVoiceProfile()` call — both were byte-for-byte the same
   "sort ascending by confidence, fold fields, last write wins" algorithm. Verified
   behavior-preserving: the full existing test suite (`M2-context.voiceMapping.test.ts`,
   the ADR-003 identity-synthesis tests, etc.) passes unchanged after the refactor,
   with no test modifications needed. 7 new tests directly exercising the helper.
   **`NarrativePlanner`'s authority-ordered composition is intentionally NOT
   consolidated into this helper** — on inspection it is a materially different
   algorithm (an explicit named-priority chain per field, with array-valued fields
   *unioned* across levels rather than overwritten), and forcing it into this module's
   shape would mean rewriting genuinely different, already-correct logic for cosmetic
   uniformity rather than real deduplication. This narrows ADR-005's characterization
   of the finding — recorded here rather than silently reinterpreted. See
   `confidenceMerge.ts`'s own docblock for the full reasoning, including why
   `ProfileBuilder.ts`'s `buildSynthesizedCollection()` union rule (a fourth, distinct
   algorithm) was also never a candidate.
6. **`ADR-004`'s Knowledge-side `hasConflict` gap resolved by narrowing the ADR's own
   text**, not by inventing a Knowledge-side conflict heuristic. No consumer has
   demonstrated a need for Knowledge-side conflict detection; `ADR-004` §6 and
   `PLATFORM_CONTRACT.md`'s `knowledge`/`reasoning`/`positioning` documentation now
   both state plainly that `hasConflict` is Experience-only by design, matching what
   was actually implemented, rather than describing it as an open follow-up decision.
7. **`ADR-002`'s migration completed.** `packages/intelligence-os/src/dev/serve.ts`
   removed (its behavior had already fully converged with `apps/api/src/server.ts` per
   the ADR's own second addendum), along with its `serve` script and `dotenv`/`tsx`
   devDependencies, and `check-boundaries.mjs`'s `src/dev/**` carve-out —
   `RULE-IOS-ISOLATION` now applies uniformly to all of `packages/intelligence-os/src`.
   `README.md`'s "running the server locally" section now points at `apps/api`. Two
   stale in-code comments referencing the removed file (in `api/http/server.ts`) were
   also updated. A fourth addendum was added to `ADR-002` recording this closure.
8. **`npm publish --dry-run` run successfully** for both `@intelligence-os/core` and
   `@intelligence-os/shared-types` — no registry login is required for a dry run,
   unlike a real publish. Both packaged cleanly (70 files / 164.8 kB and 27 files /
   9.3 kB respectively); packaging readiness is confirmed, though the actual,
   non-dry-run publish still needs real registry credentials this environment doesn't
   have.

**Reconsidered and left undone, on reflection during this session (not merely
re-confirmed as blocked):** `ProjectInput.brandosProjectId`/`getProjectByBrandosId()`'s
rename had been recorded across three prior sessions as blocked purely on "needs a live
database migration." On this session's own reflection, that undersells the real
blocker: `brandosProjectId` is a public-contract field BrandOS's live integration
sends today, so renaming it (even alongside a coordinated schema migration) is a
breaking cross-repository API change that needs BrandOS-side coordination and adoption
timing — the same category of blocker as the `@platform/cognition-contract`
de-duplication, not a same-repository decision this session could safely execute
alone. Left unrenamed; recorded here as a corrected understanding of *why*, not just
*that*, it remains open.

**Deliberately not attempted this session, unchanged:** live-database migration
application and its full verification checklist (§4) and folding migrations back into
`schema.sql`'s baseline (no Supabase credentials in this environment — same constraint
every prior session recorded); `@platform/cognition-contract` de-duplication (needs
BrandOS-side coordination); `audience`/`guidance` scoping, positioning's Knowledge-side
input, and Multi-Subject identity composition (Product Questions, ADR-005 §6); any
future DomainOS/Domain-Intelligence architecture (Part B territory, already completed
in a prior session and explicitly out of scope for this one).

**Test/type/boundary/lint status at end of this session:** 600/600 tests passing (509
pre-existing + 91 new), up from 509/509, across 40 test files (up from 34 — 6 new:
`tests/unit/pipeline/HypothesisEngine.test.ts`,
`tests/unit/pipeline/LearningValidator.test.ts`,
`tests/unit/pipeline/ProfileBuilder.test.ts`,
`tests/unit/blueprint/ProjectContextBuilder.test.ts`,
`tests/unit/domains/RelationshipActivationTrigger.test.ts`,
`tests/unit/context/confidenceMerge.test.ts`; the
`UserCorrection.test.ts`/`E2-4.intelligenceOSProvider.test.ts` additions extended
existing files rather than adding new ones). `pnpm -r typecheck` clean across all 7
buildable workspace packages. `pnpm --filter @intelligence-os/core run
check:boundaries` clean, all 3 rules, 0 violations. `pnpm lint` (new this session)
clean, 0 errors. Coverage thresholds (raised this session) pass:
`pnpm --filter @intelligence-os/core test:coverage` exits 0 at ~89% lines / ~84%
branches against an 85/78 floor. All of the above independently re-run for this
documentation update, not taken on the strength of this session's own record of
itself.

## 4. Pending schema migrations

### Sixth session this update: Evidence/Identity Bridge (`ADR-005`, implemented)

Runtime investigation traced a reported defect (knowledge ingestion succeeds; `identity` never
synthesizes; `PromptCompiler` always reports `identity:NO`) to its root cause:
`identitySynthesis.ts`'s `deriveIdentityContribution()` reads exclusively from promoted `Learning`
rows in four taxonomy categories, and nothing in the codebase ever created a Hypothesis or
Learning from a knowledge asset's extracted content — Knowledge reached `ProfileBuilder`'s
descriptive `knowledgeSummary`/`vocabularySnapshot` fields directly, but never touched Stage 1 of
the Learning Pipeline. See `docs/adr/ADR-005-evidence-identity-bridge.md` for the full decision
record; summary of what changed:

1. **New source-agnostic Stage 1 producer: `pipeline/EvidenceExtractor.ts`.** Takes a generic
   `EvidenceSourceInput` envelope and applies an evidence-quality gate (confidence floor +
   supporting-item recurrence) before emitting ordinary `Signal[]`. `EvidenceSourceKind` is an open
   enum (`knowledge_asset | connector | web_import | repository | conversation | experience`) —
   adding a future evidence origin is a new adapter file, not a change to this class.
2. **First (and only Knowledge-specific) producer: `knowledge/KnowledgeAssetEvidenceAdapter.ts`.**
   Converts extracted frameworks/vocabulary into evidence candidates for exactly the four taxonomy
   categories `identitySynthesis.ts` reads, reusing extraction's own pre-existing
   `taxonomyCategory` tagging. Explicitly never emits `competitive_intelligence` (`ADR-004` §0.1)
   or non-identity vocabulary categories — those remain descriptive-only.
3. **Every downstream stage — `ObservationBuilder`, `HypothesisEngine`, `LearningValidator`,
   `ProfileBuilder` — is unchanged in its promotion-threshold math.** Knowledge-sourced Signals flow
   through the identical Stage 2–6 pipeline every other source uses; `HypothesisEngine` matches
   purely on `(subject, taxonomyCategory, contextScope)`, so knowledge evidence corroborates with
   Experience-sourced observations in the same category automatically.
4. **New, additive `hypotheses.evidence_trail jsonb` column** (`migrations/007_evidence_provenance.sql`)
   — accumulates one `EvidenceRecord` (sourceKind/sourceId/sourceLabel/supportingItems/confidence/
   disposition/observedAt) per Observation applied to a Hypothesis, copied into
   `Learning.sourceSummary.evidenceTrail` on promotion. A synthesized fallback record is used for
   pre-existing Experience-side Observations that don't supply one, so the trail is populated
   uniformly across every source, not knowledge-only.
5. **New `FeedbackProcessor.processKnowledgeEvidence()`**, wired onto the existing
   `intelligence.signal.extracted` (`entityType: 'knowledge_asset'`) event alongside (not replacing)
   the pre-existing `processKnowledgeExtraction()`.

**Test/type/boundary status at end of this change:** 653/653 tests passing (627 pre-existing + 26
new — `tests/unit/pipeline/EvidenceExtractor.test.ts`, `tests/unit/knowledge/
KnowledgeAssetEvidenceAdapter.test.ts`, `tests/integration/ADR-005.knowledge-identity-bridge.
integration.test.ts`; 3 existing Hypothesis test fixtures updated for the new required field).
`pnpm -r typecheck` clean. No promotion-threshold constant changed anywhere in this session — a
deliberate, verifiable design constraint of `ADR-005`, not just a claim.

**Deliberately not attempted this session:** the live-server end-to-end validation (fresh workspace → upload → carousel generation, confirming `identity:NO` → `identity:YES` with real runtime logs) — no running BrandOS/IntelligenceOS server reachable from this environment. Migration `007_evidence_provenance.sql` itself **was** applied directly to the live Supabase project (`gzimytyjtidqtudqqhfx`, "IntelligenceOS") via the Supabase MCP connector — verified via `information_schema.columns`: `intelligence.hypotheses.evidence_trail` (`jsonb`, `not null`, `default '[]'::jsonb`) is live. `get_advisors` (security + performance) shows no new findings introduced by this migration — all listed advisories predate this change. A second evidence producer (connector/web-import/repository/conversation) — the abstraction supports one but none was requested; exposing the new `evidence_trail`/`sourceSummary.evidenceTrail` data through a read-only API endpoint for UI-facing "why was this identity trait created" explainability — the data is fully persisted and inspectable directly today, but no route was requested or added.

`schema.sql` now includes the `artifact_blueprints.degraded`/`.confidence_score` columns directly in its baseline `CREATE TABLE` statement (added in the Completion Mission session; there is no separate numbered migration file for this change — it was folded straight into the hand-maintained source-of-truth file, the same way most schema changes in this repository are made). **Update, sixth session:** `migrations/007_evidence_provenance.sql` (`hypotheses.evidence_trail`) has been applied directly to the live Supabase project via the Supabase MCP connector and verified against `information_schema.columns` — the live project's `hypotheses`/`profiles`/etc. schema is otherwise already ahead of `schema.sql`/some prior migration files (`workspace_id`/`subject_type` on `hypotheses` were already present live going into this session, from a prior session's direct application — `schema.sql` and the migration files in this repo have not been reconciled to match the live schema exactly; treat the live project, not `schema.sql`, as the current source of truth until that reconciliation happens).

No live Supabase project is configured in this environment, so none of the following have been verified end-to-end — carried forward as still-required steps:

| Step | Depends on |
|---|---|
| ~~Apply `schema.sql` + migrations 002/004/005/006/007 to a real Supabase project~~ | **Partially done** — `workspace_id`/`subject_type`/`evidence_trail` confirmed live on `hypotheses` this session and a prior one. Full reconciliation of `schema.sql` itself against the live project's actual current schema is still open. |
| Confirm `reviewLearning`/`reviewLearningForWorkspace` persist correctly against a live database | Above |
| Confirm two users in the same workspace share workspace-scoped learnings in an assembled blueprint | Above |
| Confirm `getBrandSummary` / `summarizeCognition` return correct counts against real data | Above |
| Confirm `persistBlueprint()` actually writes `degraded`/`confidence_score` correctly against a live table (verified only by reading the method body and schema in this sandboxed environment) | Above |
| Confirm the `subject_type` discriminator and its `CHECK` constraints behave as designed against a live table for both User- and Workspace-subject rows across `learnings`/`hypotheses`/`signals`/`profiles` (verified only by reading the migration and the mocked-Supabase test suite in this sandboxed environment) | Above |
| Confirm a Workspace's synthesized `identity` and explicit `voiceConfiguration` resolve correctly through `resolveCognitionContext` against real accumulated data | Above |
| **New this update:** confirm `knowledge_summary`/`reasoning_summary`/`positioning_summary` round-trip correctly (JSONB write/read of the new `SynthesizedCollection<T>` shape) against a live `profiles` table | Above |
| **New this update:** confirm the debounced Knowledge rebuild trigger behaves correctly under real, concurrent upload activity, not just the mocked-event-bus test suite | Above |
| `npm publish --dry-run` for `@intelligence-os/core` and `@intelligence-os/shared-types` against built `dist/` | ~~Registry access/credentials (none configured here)~~ **Done this update (fifth session)** — a dry run needs no login; both packaged cleanly. The actual, non-dry-run publish still needs real registry credentials. |

## 5. Known Issues / Technical Debt

Re-verified directly against current source for this update. Three items this document previously listed among the top open issues — the domain-ownership boundary violation, the un-wired Knowledge Ingest route, and workspace-scoped observations bypassing the Learning Pipeline (identity permanently `null`) — were resolved in earlier sessions this update (§3) and were already removed from this list. **This session (fifth) resolves six more:** the Knowledge-side `hasConflict` gap (narrowed, not built), two of the three D-2 merge-implementation duplicates, the `RelationshipIntelligenceDomain` activation-trigger counting logic, `db/queries/`'s placeholder files, `IntelligenceOS.recordCorrection()`, and `ADR-002`'s migration — each marked "resolved (fifth session)" below rather than removed outright, so the resolution itself stays visible rather than silently disappearing.

### Architectural

**`SynthesizedCollection.hasConflict` has no Knowledge-side signal — resolved by narrowing ADR-004's own text (fifth session).** Previously recorded as an open follow-up ("design a real signal, or narrow the text"). Resolved: the text is narrowed. `hasConflict` remains Experience-only (`Learning.state === 'FLAGGED'`) by design — no consumer has demonstrated a need for Knowledge-side conflict detection, and inventing a heuristic without one would be exactly the kind of speculative machinery this platform has repeatedly declined to build elsewhere (ADR-001, ADR-003). See `docs/adr/ADR-004-cognitive-consolidation.md` §6.

**`positioning` (`CognitionContext`) has no Knowledge-side input (ADR-004, by design).** Unchanged — no Knowledge Pipeline extractor produces competitive/market framing; `positioningSummary` is Experience-only. Deliberate, documented scope decision (ADR-004 §0.1), not an oversight. A future Knowledge-side positioning extractor is real, valuable follow-up work, correctly sequenced as its own decision — a Product Question, not an engineering one, so out of scope for a Completion Plan execution session.

**`audience`/`guidance` (`CognitionContext`) remain unimplemented.** Unchanged — Product Questions (ADR-005 §6), out of scope for engineering-only work. `audience` likely extends the existing, already-real `AudienceProfile`/`AudienceCalibrator` instead; `guidance` has no obvious existing home. Both need their own first-principles scoping pass.

**Three independent implementations of the same confidence-ordered field-merge pattern (Compliance Audit D-2) — reduced to two, resolved for the pair that were genuinely duplicates (fifth session).** `identitySynthesis.ts::deriveIdentityContribution()` and `voiceMapping.ts::deriveVoiceProfile()` were byte-for-byte the same algorithm; both now call one shared helper, `context/confidenceMerge.ts::mergeByAscendingConfidence()`. Verified behavior-preserving — the existing test suite passed unchanged. **`NarrativePlanner`'s authority-ordered composition was not consolidated into this helper**, on the finding that it's a materially different algorithm (an explicit named-priority chain per field, with array-valued fields unioned across levels rather than overwritten) — forcing it into the same shape would mean rewriting genuinely different, already-correct logic for cosmetic uniformity, not real deduplication. This narrows ADR-005's original characterization of the finding; see `confidenceMerge.ts`'s own docblock.

**`RelationshipIntelligenceDomain`'s activation-trigger counting logic — built (fifth session).** `ArtifactIntelligenceDomain.countArtifactsWithNamedRecipients()` and `RelationshipIntelligenceDomain.checkActivationTrigger()` give a real, tested answer to "has the Phase 2 trigger fired" (Contracts §J.3: ≥3 external artifacts with named recipients, or an explicit onboarding signal). **Still true, and unchanged by this addition:** every method on `RelationshipIntelligenceDomain` besides the new check still throws `DomainNotActivatedError` regardless of what the check returns — no onboarding flow that could supply the explicit-signal half exists anywhere in this codebase yet, and building real named-relationship storage/read paths remains separate, larger Phase 2 feature work, not attempted this session.

**`db/queries/` — resolved (fifth session).** The six empty placeholder files are deleted. Nothing imported from them; if a future contributor hits real query-builder complexity, the directory can be reintroduced with a real example.

**`IntelligenceOS.recordCorrection()` — built (fifth session).** Added to `IIntelligenceProvider`/`IntelligenceOSProvider` as the considered, separately-reviewed decision this document previously said it deserved (`ARCHITECTURE.md` §11 Rule 7), following the exact treatment `ingestWorkspaceConfiguration()` received. See §3, fifth session, item 3.

### Milestone 4 migration relative to what `ADR-002` describes — resolved (fifth session)

`packages/intelligence-os/src/dev/serve.ts` is removed, along with its `package.json` `serve` script and `dotenv`/`tsx` devDependencies, and `check-boundaries.mjs`'s `src/dev/**` carve-out. `RULE-IOS-ISOLATION` now applies to all of `packages/intelligence-os/src` uniformly. `apps/api/src/server.ts`/`apps/api/api/cognition.ts` are the one remaining launcher pair, as `ADR-002` originally specified. See [`ADR-002`](./adr/ADR-002-apps-runtime-layer.md)'s fourth addendum for the full record, including the one bullet from `ADR-002` §3 that remains intentionally not matched verbatim (a superseded-by-a-working-alternative case, not an undone step).

### Cross-repository contract

**`@platform/cognition-contract` is physically duplicated** between this repository and BrandOS's, with no shared registry to resolve against. Unchanged this update — needs coordinated, cross-repository agreement with BrandOS on a shared-registry or git-workspace-protocol resolution mechanism; not a decision this repository can make alone. See `PLATFORM_CONTRACT.md` §4.

**`ProjectInput.brandosProjectId`/`getProjectByBrandosId()` still carry one consumer's name — reclassified this update (fifth session).** Previously recorded as blocked purely on "needs a live DB migration." On reflection, that undersold the real blocker: this is a public-contract field BrandOS's live integration sends today, so renaming it is a breaking cross-repository API change needing coordinated BrandOS-side adoption — the same category of blocker as the `cognition-contract` de-duplication directly above, not a same-repository decision. Left unrenamed.

**Two open contract-design questions:** how BrandOS's raw-signal review UI gets a list to render (still open, no target direction decided), and how a workspace's explicit, user-set brand-voice/identity configuration reaches IntelligenceOS at all (decided, implemented, **and now reachable** — `ADR-003` §2.4, `IntelligenceOS.ingestWorkspaceConfiguration()`, promoted onto `IIntelligenceProvider` and `POST /v1/workspace-configuration` this update, closing Compliance Audit finding D-4). Whether *BrandOS's own* admin UI calls it yet is outside this repository's scope to verify. Neither `CognitionProvider` nor `CognitionContext` changed in this update's source snapshot — the new route is a sibling to `CognitionProvider`, following the same precedent `/v1/knowledge/ingest` already set, not a sixth `CognitionProvider` operation. Documented in `packages/cognition-contract/README.md` and summarized in `PLATFORM_CONTRACT.md` §3.

**`CognitionContext`'s implemented shape is narrower than the constitutional target.** Unchanged this update — four of eleven target sections exist. `identity` is now genuinely synthesized from both Experience (Learnings) and Knowledge (explicit `identityConfiguration`, closing Compliance Audit D-3 this update) rather than resolving unconditionally to `null` — it still resolves to `null` for a workspace with neither yet, which is the honest "nothing learned or declared yet" state, not a gap. See `PLATFORM_CONTRACT.md` §3/§5.

### Documentation and file placement

**`AGENT_CONTEXT.md` placement — resolved (fifth session).** `packages/intelligence-os`'s package-root `AGENT_CONTEXT.md` moved from the repository root to `packages/intelligence-os/AGENT_CONTEXT.md`.

**Provenance comments will continue to rot slowly.** Unchanged, low-urgency, best fixed incrementally as files are touched for unrelated reasons.

**`docs/archive/planning/Repository_Context_Strategy_Proposal.md` was never built.** Unchanged — no `.context/` directory, no `pnpm context:generate` script. See `ROADMAP.md`.

### Tooling and process

**Root `tsconfig.base.json`, lint configuration, and CI workflow — all built (fifth session).** `tsconfig.base.json` holds the compiler options every package's `tsconfig.json` now extends rather than repeating. `eslint.config.mjs` is a workspace-wide flat config (`pnpm lint`, folded into `pnpm validate`); 0 errors, 8 pre-existing warnings in test-file dead code left as-is. `.github/workflows/ci.yml` runs `pnpm validate` + `pnpm test` on every PR/push — no live infrastructure required. `.gitignore` and `.env.example` remain present and resolved from an earlier pass.

**Test coverage gap — closed (fifth session).** `HypothesisEngine`, `LearningValidator.evaluate()`, `ProfileBuilder`'s pre-existing logic, and `ProjectContextBuilder` each now have a dedicated, fully-isolated unit-test file (91 new tests total — see §3, fifth session, item 2). `vitest.config.ts`'s coverage thresholds raised accordingly, from the Sprint 0 defaults (`lines: 40, branches: 30`) to `lines: 85, branches: 78` — real measured coverage is ~89% lines / ~84% branches, thresholds sit a few points below as headroom rather than at the ceiling.

**The five seeded universal artifact patterns are undocumented outside raw SQL.** Unchanged this update.

## 6. Recommended next steps

Roughly in order of leverage relative to effort — see [`ROADMAP.md`](./ROADMAP.md) for the longer-horizon picture. The IntelligenceOS Completion Plan's engineering/technical-debt/operational-preparation scope (fifth session, §3) is now closed; what remains is genuinely blocked on something outside this repository, or is a Product Question by design:

1. **Scope `audience`/`guidance`** (`CognitionContext`'s two remaining originally-unimplemented sections, not addressed by ADR-004) — each needs its own first-principles pass; a Product Question (ADR-005 §6), not an engineering task.
2. **Apply `schema.sql`, `migrations/002_workspace_learning_owner.sql`, `migrations/004_subject_centric_intelligence.sql`, and `migrations/005_cognitive_consolidation.sql` to a real Supabase project**, and run the live-database checks in §4, once infrastructure access exists. Blocked purely on infrastructure access — no design work remains.
3. **Resolve `@platform/cognition-contract`'s cross-repository duplication** — needs coordinated agreement with BrandOS's maintainers on a shared-registry or git-workspace-protocol mechanism; not a decision this repository can make alone.
4. **Coordinate the `ProjectInput.brandosProjectId`/`getProjectByBrandosId()` rename with BrandOS** — a breaking public-contract change to a field BrandOS's live integration sends today; needs BrandOS-side adoption timing, not just a schema migration.
5. **Run the real (non-dry-run) `npm publish`** for `@intelligence-os/core` and `@intelligence-os/shared-types` once registry credentials are available — the dry run (fifth session) already confirmed both package cleanly.
6. **Multi-Subject identity composition, positioning's Knowledge-side input** — both Product Questions (ADR-005 §6), not engineering tasks.
