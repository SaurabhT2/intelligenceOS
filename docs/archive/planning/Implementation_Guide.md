## Executive Summary

> **Historical planning document.** Validated the Engineering Roadmap against source code and expanded it into an implementation-ready backlog. Epic 1 and Epic 2 are now complete. For current implementation state, see `docs/IMPLEMENTATION_STATUS.md`. Ten factual mismatches found during this review are noted throughout; subsequent architectural decisions (ADR-001, ARCHITECTURE_REVIEW_E2-0) corrected two of the most significant.

This guide validates the IntelligenceOS Engineering Roadmap and Adoption Strategy against the actual BrandOS monorepo and IntelligenceOS source code, then expands the roadmap into an implementation-ready backlog. **The three-epic structure and overall sequencing are sound and are preserved unchanged.** Source-code review surfaced ten factual mismatches between the planning documents and the code (indexed in the Appendix at the end of this guide), the two most consequential being:

- **The classification scheme the roadmap and strategy build extensively on (`A`–`E`, 5 values) doesn't exist.** The real type is `'A' | 'B' | 'C'` (3 values). This is corrected throughout Epic 1 (E1-5) and Epic 3 (E3-M4) below.
- **The IntelligenceOS and BrandOS codebases are two separate repositories today**, not one monorepo. The original version of this guide concluded every Epic 2 deliverable required them to be merged and added a blocking prerequisite, **E2-0 — Monorepo Consolidation**, as the single most important scheduling addition in this document. **That conclusion is corrected below (12th finding)** — the two repositories integrate through a published contract package and a stable interface, with no merge required.

Beyond these, the `ArtifactBlueprint` type's real shape differs substantially from what the roadmap independently specifies (most importantly, the `degraded` flag that Epic 3's shadow-mode logic depends on doesn't exist on the real type yet), the CPL orchestrator calls the brand-intelligence runtime directly rather than through the proxy functions the roadmap targets for replacement, and `IdentityContributor`'s adaptation is a method rewrite rather than a type-widening exercise. None of these require redesigning the architecture — each is resolved with a corrected task description, an added design-decision step, or a re-costed complexity estimate within the existing roadmap structure.

> **Addendum, 11th finding (post-dates this guide):** a later, deeper semantic review (`foundations/BrandOS_Intelligence_Semantics_Analysis.md`) and the formal decision ratifying it (`ADR-001-VISUAL-INTELLIGENCE.md`) found that **E1-4's design itself, not just its scheduling, needs correction.** This guide's own Epic Validation finding below (§1.1) already identified that E1-4 couldn't be verified end-to-end until Epic 3 infrastructure existed — a real and correctly-identified scheduling problem. The deeper finding is that the design generating that scheduling problem was the wrong design in the first place: visual feature extraction (color, typography, layout, mood) belongs inside IntelligenceOS's own Knowledge Pipeline as a new extractor stage, not as a BrandOS-side VLM call that IOS subscribes to via event. The corrected design has **no BrandOS dependency at all**, which removes the scheduling problem rather than just working around it. This is graded 🔴 **MISMATCH** below, alongside the original ten, with its own appendix entry (#11). It does not change this guide's overall verdict that the three-epic structure is sound — the fix stays entirely within Epic 1's existing E1-4 feature slot.

> **Addendum, 12th finding (post-dates this guide):** a focused architecture review (`ARCHITECTURE_REVIEW_E2-0.md`) re-examined this guide's own §1.2 finding — the monorepo-consolidation prerequisite (**E2-0**) — and found that it, too, was an implementation assumption mistaken for an architectural requirement. The root cause: E2-4's adapter was specified at a file path that implies workspace-relative resolution, and `check-boundaries.mjs` was treated as fixed (filesystem-scanning) rather than as itself swappable for a dependency-declaration scan. Once corrected, **every Epic 2 task is satisfiable through a published, versioned contract package plus a stable interface, consumed as an ordinary library dependency** — no repository merge required, and per the review's Step 3 analysis, repository separation is actually the *better* fit for IntelligenceOS's stated dependency-direction and platform-reusability goals, not merely an acceptable alternative to consolidation. **E2-0 — Monorepo Consolidation is removed as a Feature** and replaced by a much smaller **E2-0' — Contract Distribution Setup** (publish the type package, fix the boundary-checker's scanning mechanism, run the field-reconciliation as a design review rather than a co-edited file). This is graded 🔴 **MISMATCH** below as an 12th appendix entry, superseding this guide's own §1.2 finding — which is preserved in a collapsed block for traceability, the same pattern used for the 11th finding.

**Document structure:**
1. Epic Validation — per-epic, per-feature findings with source-code citations
2. Implementation Backlog — Features → Tasks → Subtasks, with package/files/dependencies/complexity/testing for every task
3. Task Dependency Graph — critical path, parallelizable work, blocking relationships, deferrable work
4. Repository Impact Analysis — packages, interfaces, migrations, tests, docs, and boundary rules affected
5. Risk Review — hidden assumptions, technical/migration/performance/data-consistency/testing risks with mitigations
6. Sprint Organization — by engineering team, with recommended execution order
7. Definition of Done — per epic
8. Appendix — index of all 🔴 mismatch findings

---

# IntelligenceOS → BrandOS Implementation Guide

**Status:** Implementation-ready
**Prepared from:** live source inspection of `brandos-full-20260625-104120.zip` and `intelligence-os-sprint3-final.zip`, cross-checked against `IntelligenceOS_Adoption_Strategy.md`, `IntelligenceOS_Engineering_Roadmap.md`, and `CLAUDE_BOOTSTRAP.md` / `.context/*.generated.*`
**Date:** 2026-06-25
**Mandate:** The roadmap is the implementation authority. The adoption strategy is the technical authority. Source code is the final authority where either document and the code disagree. This guide does not redesign the architecture — it makes the existing three-epic roadmap executable, and flags every place the roadmap's assumptions don't survive contact with the actual code.
**Addendum (post-dates this guide):** `foundations/BrandOS_Intelligence_Semantics_Analysis.md` performed a deeper semantic review after this guide was written and found one additional mismatch (Appendix #11, E1-4's design) that this guide's own validation pass didn't catch because it was validating the roadmap's design *as specified*, not re-deriving the design from first principles. `ADR-001-VISUAL-INTELLIGENCE.md` is the formal decision ratifying the correction. Mandate ordering is otherwise unchanged — this addendum sits alongside the existing ten findings as an eleventh, found later, not as a change to which document governs.

---

## How to read this document

Every finding below is graded:

- 🟢 **CONFIRMED** — verified directly against source code, matches the roadmap/strategy claim.
- 🟡 **PARTIAL / NUANCED** — broadly correct but the roadmap is imprecise, incomplete, or omits a real complication.
- 🔴 **MISMATCH** — the roadmap or strategy doc's technical claim contradicts what the code actually does. Treated as a finding to resolve, not a license to redesign.

Per the constraints of this engagement, 🔴 findings do **not** trigger an architecture rewrite. They are flagged so the relevant Epic's tasks can be adjusted (usually: tighten an acceptance criterion, add a translation step, or correct a "files modified" list) without changing the three-epic structure, the milestone sequencing, or the overall adoption strategy.

---

# 1. Epic Validation

## 1.1 Epic 1 — IntelligenceOS Capability Superset

**Roadmap claim:** "No BrandOS code changes are proposed or required" except one `bus.emit()` call for E1-4.

**Verdict: Executable as scoped, with five corrections below.** Epic 1 touches only `packages/intelligence-os/` and `packages/shared-intelligence-types/` (both already exist, in a *separate* repository from BrandOS today — see §1.2 for why this matters for Epic 2, not Epic 1). Nothing in Epic 1 requires BrandOS code changes; this part of the claim is 🟢 CONFIRMED.

### E1-1 — Human Learning Review API

**Roadmap status:** Critical, no dependencies, 0.5 sprints.

🟢 **CONFIRMED — gap is real exactly as described.**
- `LearningState` in `packages/intelligence-os/src/types/entities.ts:137` is `'VALIDATED' | 'CONFIRMED' | 'ACTIVE' | 'DECAYING' | 'FLAGGED' | 'ARCHIVED' | 'RETIRED'` — `FLAGGED` exists exactly as claimed.
- `UserIntelligenceDomain` (`src/domains/UserIntelligenceDomain.ts`, 286 lines) has no `reviewLearning()` method. Verified by full method inventory: `getCurrentProfile`, `getActiveLearnings`, `getCurrentArchetype`, `getGenericAudienceProfile`, `upsertProfile`, `insertLearning`. No review/approve/reject surface anywhere in the file.
- `IntelligenceOS.ts` has a doc comment stating its "Public API surface (4 methods, fixed for all sprints)": `buildBlueprint`, `recordFeedbackEvent`, `ingestKnowledgeAsset`, `upsertProject`. There is no fifth method today.

🟡 **NUANCED — one planning risk the roadmap doesn't flag.** That "(4 methods, fixed for all sprints)" comment is not incidental — it reads as a deliberate Sprint-0 design constraint, not an oversight. Before E1-1 lands, confirm with whoever owns that constraint that "fixed for all sprints" is not a load-bearing assumption elsewhere (e.g. a test asserting exactly 4 public methods, or downstream tooling enumerating the surface). Search for `Object.keys(IntelligenceOS.prototype)`-style or method-count assertions before merging.

🟡 **NUANCED — exact write target.** The roadmap's pseudocode writes directly via Supabase (`.schema('intelligence').from('learnings').update(...)`). That pattern is consistent with the rest of the file (`getActiveLearnings` does the same `.in('state', [...])` style query), so the implementation pattern is correct. But `UserIntelligenceDomain`'s real methods are scoped with `.eq('user_id', userId)` everywhere they touch user data — the roadmap's pseudocode already does this for `reviewLearning()`, so no correction needed here; flagging only so the implementing engineer copies that pattern rather than the `EntityNotFoundError`/`ValidationError` *names*, which need to be checked against `src/errors.ts` (see Backlog, E1-1-T2).

**Action for backlog:** none beyond what's specified — proceed as written, with the "fixed for all sprints" check added as a pre-flight task.

### E1-2 — Workspace-Scoped Brand Voice

**Roadmap status:** High, 1–1.5 sprints, Phase C depends on Phase B.

🟢 **CONFIRMED — gap and current shape exactly as described.**
- `packages/intelligence-os/src/db/schema.sql:114-156`: `intelligence.learnings.workspace_id` is `UUID` with an explicit comment "intentionally no REFERENCES (workspace table lives in BrandOS schema)". Confirmed nullable, no FK.
- Existing indexes on `learnings` are `(user_id, domain, state)`, `(user_id, taxonomy_category, state)`, and `(project_id, domain) WHERE project_id IS NOT NULL`. **No index touches `workspace_id` at all** — not even a partial one. The roadmap's claim of "no composite index on workspace-only queries" *understates* the gap slightly: there is no `workspace_id` index of any kind, composite or otherwise.
- `WorkspaceIntelligenceDomain.ts` (112 lines, full file reviewed) has exactly one real method, `getContext()`, which reads `knowledge_assets` for `complianceConstraints` only. `enforceComplianceConstraints()` and `syncSharedVocabulary()` both throw `PhaseNotImplementedError` by design. There is no `getWorkspaceLearnings()` or `upsertWorkspaceLearning()` — confirmed absent.
- `NarrativePlanner` (called from `BlueprintBuilder.build()`) takes `(artifactType, profile, archetype, audienceCalibration, projectContext)` — zero workspace parameter anywhere in its signature. The "workspace voice layer above user voice" does not exist in any form, not even a no-op.

🔴 **MISMATCH — type mismatch the roadmap's SQL migration doesn't account for.** `brand_memory_entries.workspace_id`, `identity_signals.workspace_id`, and `identity_versions.workspace_id` are all `TEXT NOT NULL` in BrandOS (confirmed in `.context/database_context.generated.md:128,190,219`, all three explicitly "no FK, text key"), while `intelligence.learnings.workspace_id` is `UUID`. BrandOS's own `workspaces.id` and `workspace_settings.workspace_id` *are* UUID — so the BI tables' TEXT typing is itself a pre-existing inconsistency inside BrandOS, not a new problem IOS introduces. But it means:
  - The sentinel value `userId = '_workspace_<workspaceId>'` proposed in §4.2 of the adoption strategy cannot be stored in `intelligence.learnings.user_id`, because that column is `UUID NOT NULL REFERENCES auth.users(id)` (schema.sql:116) — a string like `_workspace_abc123` is not a valid UUID and there is no `auth.users` row for it. **The sentinel approach as literally specified will fail a Postgres type/FK check.** This needs a real design decision before Phase A ships, not after: either (a) provision one real `auth.users` row per workspace to act as the sentinel owner (operationally heavy, and still needs the workspace's TEXT-keyed id translated to a UUID), or (b) skip the sentinel and go straight to a nullable `workspace_id` write path that doesn't pretend to be a user (this is closer to what the roadmap's "Phase B" already describes, suggesting Phase A's sentinel bridge should be dropped rather than built and then replaced one sprint later).
  - Any future migration of `brand_memory_entries`/`identity_signals` data into `intelligence.learnings` (Epic 3, E3-M4) needs a TEXT→UUID workspace ID translation step that is not mentioned in the roadmap's migration SQL.

**Action for backlog:** Add a design-decision task ahead of E1-2 Phase A: resolve the sentinel-vs-direct-nullable-write question before writing the index migration, since the index migration is trivial but the sentinel data path is not. Recommend skipping the sentinel (option b above) given the FK constraint — go directly to Phase B's `getWorkspaceLearnings()`/`upsertWorkspaceLearning()` with a nullable `workspace_id`, which sidesteps the invalid-UUID problem entirely and removes a planned throwaway step.

### E1-3 — Brand Summary Query API

**Roadmap status:** High, no dependencies, 0.5 sprints.

🟢 **CONFIRMED — gap and target shape both verified.**
- No `getBrandSummary` anywhere in `IntelligenceOS.ts` or any domain file — confirmed by full-text search of the package.
- `UserIntelligenceDomain.getActiveLearnings()` comment (line 165-166) states verbatim: "Active" means state is one of VALIDATED, CONFIRMED, or ACTIVE (not DECAYING, FLAGGED, ARCHIVED, RETIRED)" — this **exactly matches** the roadmap's acceptance criterion for `activeLearningsCount`. No correction needed; the roadmap got this one right down to the state list.
- `taxonomy_category` has exactly 25 enumerated values in `entities.ts:40-65`, confirmed by direct count, including `personal_brand_signal` used elsewhere as the VLM/classification-compat fallback. "Top 3 taxonomy categories by learning count" is implementable as a straightforward `GROUP BY` over the existing `(user_id, taxonomy_category, state)` index — no new index required, confirming the roadmap's "no database changes" claim.

🔴 **MISMATCH — the BrandOS-side consumer shape is materially different from what Epic 2/3 will need to bridge.** The roadmap (and the adoption strategy, §4.3) assumes BrandOS's `getBrandSummary()` returns something shaped like the proposed `IntelligenceSummary` (`compositeConfidence`, `archetypePrimary`, `activeLearningsCount`, `topTaxonomyCategories`, `voiceSummary`, `degraded`). The actual BrandOS `IBrandIntelligenceRuntime.getBrandSummary()` (`packages/brand-intelligence/src/runtime/BrandIntelligenceRuntime.ts:490-513`) returns:
  ```typescript
  { preferredTone: string | null, audience: string | null, industry: string | null,
    positioning: string | null, keywords: string | null }
  ```
  This is a flat, five-field, all-string-or-null shape with **zero overlap** with `IntelligenceSummary`'s fields. `positioning` and `keywords` are hardcoded to `null` in the real implementation ("V2: no corePositions in generation path" / "V2: no phraseLibrary in generation path" — comments in the source itself). The live consumer, `apps/web/app/api/memory/route.ts:41-50`, maps this directly to a UI payload of `preferred_tone`, `audience`, `industry`, `positioning`, `keywords`.

  This is not a blocker for E1-3 itself (IOS should still build `getBrandSummary()` exactly as the roadmap specifies — `IntelligenceSummary` is the right *target* shape for the new system). It is a blocker for whoever writes `BrandOSLegacyIntelligenceProvider.getBrandSummary()`'s `translateLegacySummary()` in Epic 2 (E2-3): there is no clean field mapping from `{preferredTone, audience, industry, positioning, keywords}` to `{compositeConfidence, archetypePrimary, archetypeConfidence, activeLearningsCount, topTaxonomyCategories, voiceSummary, degraded}`. At minimum `compositeConfidence`, `archetypePrimary`, `archetypeConfidence`, and `activeLearningsCount` have no legacy source data and must default to `0`/`null`/`null`/`0` respectively, with `degraded` likely hardcoded `true` for the legacy path (there is no concept of "composite confidence" or "archetype" anywhere in BrandOS BI). This is fine — it is exactly the kind of asymmetry an adapter is supposed to absorb — but it needs to be called out as an explicit, intentional decision in `translateLegacySummary()`'s implementation, not discovered during E2-3 code review.

**Action for backlog:** E1-3 proceeds as specified. Add an explicit note to E2-3's task (translateLegacySummary) documenting the field-by-field mapping decision above so it isn't re-litigated mid-sprint.

### E1-4 — VLM Visual Intelligence Bridge

**Roadmap status:** Medium, requires one BrandOS `bus.emit()` call, 1 sprint.

🔴 **MISMATCH (post-dates this guide; supersedes the 🟢/🟡 findings below) — the design itself, not just its scheduling, is wrong.** `foundations/BrandOS_Intelligence_Semantics_Analysis.md` (Deliverable 8) and `ADR-001-VISUAL-INTELLIGENCE.md` find that folding `vlmAnalysis`'s structured fields (`primaryColors`, `fontStyle`, `layoutDensity`) into a single event payload IOS merely observes treats visual extraction as a BrandOS-owned capability IOS is a downstream consumer of — when it should be an extractor stage inside IOS's own Knowledge Pipeline (parallel to `VocabularyExtractor`/`FrameworkExtractor`/`PatternExtractor`), the same way text extraction already is. Under the corrected design, IOS adds a `VisualFeatureExtractor` and invokes it directly from `KnowledgeProcessor.process()` on visual-typed assets ingested via the existing `IntelligenceOS.ingestKnowledgeAsset()` public method — no new event type, no `KnowledgeProcessor` event subscription to a BrandOS payload, and **no BrandOS dependency of any kind**. See the Engineering Roadmap's E1-4 section (design correction note) for the full corrected task description.

This finding *resolves* the 🟡 finding immediately below rather than sitting alongside it as a separate problem — once there's no BrandOS-side emit call to wait on, the "can't be verified end-to-end until Epic 3 infrastructure exists" problem disappears, because there's no end-to-end BrandOS leg left to verify. The 🟢/🟡 analysis below is preserved for traceability — it was a mechanically correct assessment *of the design as originally specified* — but should not be used as the basis for implementation.

<details>
<summary>Original 🟢/🟡 findings (correct given the now-superseded design; retained for traceability)</summary>

🟢 **CONFIRMED — mechanically correct, matches existing patterns exactly** (against the original event-bridge design).
- `IntelligenceEventType` in `packages/intelligence-os/src/types/events.ts:24-40` is a **closed union of exactly 14 string literals**, paired with a conditional-type payload dispatcher `IntelligenceEventPayload<T>` (lines 165-173). Adding `'brandos.brand_asset.analyzed'` requires editing this union and (per the existing pattern for the other 13 event types) adding either a dedicated payload interface or accepting the `BaseEventPayload` fallback — the roadmap's plan to add a dedicated `BrandAssetAnalyzedPayload` is the right call given the structured `vlmAnalysis` sub-object it carries.
- The registration pattern `this.bus.on('brandos.brand_asset.analyzed', async (payload) => {...})` inside `KnowledgeProcessor` is structurally identical to the existing `KnowledgeProcessor.register()` (`this.bus.on('brandos.knowledge_asset.uploaded', ...)`) and `FeedbackProcessor.register()` (`this.bus.on('brandos.artifact.feedback', ...)`) — confirmed by direct inspection of both files. No new wiring pattern needs to be invented.
- `brand_assets.vlm_analysis` JSONB column and VLM analysis flow exist in BrandOS as claimed (confirmed via `.context/database_context.generated.md`'s `brand_assets` entry and `apps/web/app/api/assets/[id]/analyze/route.ts`).

🟡 **NUANCED — "one `bus.emit()` call" undersells the BrandOS-side work slightly.** The single `bus.emit()` call is real and is the only *production-path* change, but to call IOS's bus at all, BrandOS needs a constructed `IntelligenceOS` instance (or at least its `eventBus`) reachable from `apps/web/app/api/assets/[id]/analyze/route.ts` — which does not exist anywhere in BrandOS until Epic 2/3 wiring lands. **E1-4 cannot be completed as a working, callable bridge until an `IntelligenceOS`/`IntelligenceOSProvider` instance exists in BrandOS's process** (Epic 2, E2-4/E3-M1). The IOS-side handler and event-type addition can and should be built and unit-tested in Epic 1 in isolation (exactly as scoped), but the "Dependencies: Requires BrandOS to emit..." line should be read as "the IOS side is buildable now; the live wire-up is gated on Epic 3 infrastructure," not as a same-epic dependency. This doesn't change the Epic 1/2 boundary — it only clarifies that E1-4's *acceptance criteria* (unit tests, handler logic) are satisfiable in Epic 1, while *end-to-end* verification is necessarily deferred to Epic 3.

**Original action for backlog (superseded):** Split E1-4 acceptance criteria into "IOS-side, testable now" (handler + unit tests) and "end-to-end, verified at E3-M1" (real `bus.emit()` call from the live route, observed in shadow/staging). Track the second half as a dependency of E3-M1, not of Epic 2 exit.

</details>

**Action for backlog (corrected):** Implement `VisualFeatureExtractor` and its `KnowledgeProcessor` wiring entirely within Epic 1, with no E3-M1 dependency and no BrandOS-side task. Remove the former E1-4-T3 ("end-to-end wiring verification, tracked but not built in Epic 1") and former E3-M1-T4 ("wire the deferred E1-4 VLM bridge end-to-end") from the backlog below — see §2 for the corresponding task-list correction.

### E1-5 — A–E Classification Backward Compatibility Mapping

**Roadmap status:** Medium, no dependencies, 0.25 sprints.

🔴 **MISMATCH — the target classification scheme itself is wrong.** `SignalClassification` in `packages/contracts/src/brand-cognition-contracts.ts:26` is:
```typescript
export type SignalClassification = 'A' | 'B' | 'C'
```
Three values, not five. The doc comment directly above it is unambiguous:
```
 * A — Style signals:  topic-independent voice and structure. Always safe to inject.
 * B — Structural patterns: topic-abstracted templates. Safe to inject as shapes.
 * C — Topic memory:   domain content. Never injected into prompts.
```
There is no `D` or `E` anywhere in `@brandos/contracts`, `@brandos/brand-intelligence`, or any `.context/*.generated.*` file. `BrandSignalStatus` (the lifecycle field, separate from classification) is `'pending_review' | 'approved' | 'active' | 'rejected' | 'decayed' | 'consolidated'` — six values, also not matching either document's "pending_review → approved/rejected" simplification (the real runtime, in `BrandIntelligenceRuntime.review()`, line 289-301, transitions to `'active'` on approval, not `'approved'` — `'approved'` exists as a status value in the type union but the live `review()` method never writes it).

This 🔴 finding runs through **both** source documents identically: the adoption strategy's §2.3 ("Classification: classification (char A–E)"), its capability matrix (§3.1, "BrandOS writes with A–E classification only"), and the roadmap's E1-5 (entire section, including the worked example "A = permanent stability + confidence >= 0.8..."). It is not a typo in one place — it's a consistent, repeated factual claim about BrandOS's own data model that the actual `@brandos/contracts` source contradicts everywhere it's checked.

This does **not** mean E1-5 should be dropped — a compatibility mapping function is still useful for the Epic 3 transition. It means the mapping needs to target the **real** three-value enum, not the documented five-value one, and the worked thresholds need to be redrawn around three buckets instead of five. A reasonable revision, preserving the original intent (map IOS's richer model down to BrandOS's classification) and the original boundary logic (Class A = safe to inject as style; Class C = never injected as topic memory):

```typescript
/**
 * Maps IOS learning fields to BrandOS's REAL 3-value SignalClassification.
 * Corrected from the roadmap's A–E scheme, which does not exist in
 * @brandos/contracts (see packages/contracts/src/brand-cognition-contracts.ts:17-26).
 *
 * A = Style signal equivalent: permanent/long_term stability + confidence >= 0.6
 * B = Structural pattern equivalent: medium_term stability + confidence >= 0.4
 * C = Topic memory equivalent: anything else (low confidence, DECAYING, FLAGGED, or
 *     any learning whose taxonomyCategory implies domain content rather than style)
 */
export function toLegacyClassification(learning: Learning): 'A' | 'B' | 'C'
```
The exact threshold values (0.6 / 0.4) are a placeholder pending a real calibration pass against production BrandOS classification distributions — flagged as a task below, not resolved here, since picking real thresholds is a data/architecture decision outside this guide's remit.

**Action for backlog:** Rewrite E1-5's interface and worked example to target `'A'|'B'|'C'`, not `'A'|'B'|'C'|'D'|'E'`. Add a calibration task to validate threshold choices against a real sample of classified BrandOS signals before this function is used anywhere in Epic 3's transition path (it currently has no consumer until E3-M1/M2, so there's runway to calibrate properly rather than guess).

### Epic 1 — additional finding not tied to a single backlog item

🟡 **NUANCED — `@brandos/shared-intelligence-types` and two of its "Epic 2" types already exist, partially.** The roadmap treats `@brandos/shared-intelligence-types` as new work starting in Epic 2 (E2-1). In the actual IOS repository, the package already exists at `packages/shared-intelligence-types/` with `ArtifactRequest.ts`, `ArtifactBlueprint.ts`, and `FeedbackEvent.ts` already authored (Sprint 0/1 work, per their own doc comments). Two of the roadmap's proposed Epic 2 types — `IntelligenceProjectInput` and `IntelligenceKnowledgeAssetInput` — are **already implemented, field-for-field**, as `ProjectInput` and `KnowledgeAssetInput` in `packages/intelligence-os/src/types/domains.ts`; they just haven't been re-exported through `shared-intelligence-types` yet. This is good news for Epic 1/2 velocity but changes what "create the shared type package" actually means: it's a promotion/re-export and a *reconciliation* exercise (the real `ArtifactBlueprint`/`ArtifactRequest`/`FeedbackEvent` shapes differ substantially from what the roadmap independently re-specifies — see Epic 2 below), not new authorship from a blank file.

**Action for backlog:** Add an Epic 1 (or Epic-1-adjacent, since it touches only the IOS-side repo) housekeeping task: confirm `ProjectInput`/`KnowledgeAssetInput` are stable, then have `IntelligenceOS.ts` import them from `@brandos/shared-intelligence-types` instead of `./types/domains` once that package is the canonical home, eliminating a duplicate type definition before Epic 2 reconciliation work begins.

### Epic 1 — Exit Criteria Validation

The roadmap's six exit criteria (E1-1 through E1-5 merged + tested, IOS CI green, `RULE-IOS-ISOLATION` zero violations) are all individually achievable. One nuance: `RULE-IOS-ISOLATION` is stated today only as a target rule in the *strategy* document's Appendix (§8.2) — it does not exist yet in any executable form, because IOS and BrandOS are two separate repositories with two separate boundary-check scripts (BrandOS has `scripts/check-boundaries.mjs`; IOS has none at all — confirmed, no `.mjs` scripts directory exists in the IOS zip). "Zero violations" is true today only because there is no IOS-side script capable of detecting a violation. Verifying this exit criterion meaningfully requires the rule to actually be runnable, which in turn requires either (a) a lightweight standalone import-checker added to the IOS repo, runnable independently of BrandOS's own tooling, or (b) deferring real enforcement until `check-boundaries.mjs` is updated to scan dependency declarations rather than an on-disk tree (§1.2 below, E2-0') and made reachable across the repository boundary. Recommend (a): a ~30-line standalone script is cheap and gives Epic 1 a real, falsifiable gate instead of a vacuous one, and is not contingent on Epic 2's contract-distribution setup landing first.

---

## 1.2 Epic 2 — BrandOS Compatibility Layer

**Roadmap claim:** Defines `IIntelligenceProvider`, ships `BrandOSLegacyIntelligenceProvider` and `IntelligenceOSProvider`, wires CPL — "no behavior change," 1.5–2 sprints.

**Verdict: Executable. The roadmap is missing one piece of setup work — contract distribution, not a repository merge.**

### 🔴 MISMATCH (post-dates this guide; supersedes the finding below) — the original "monorepo merge" prerequisite was an implementation assumption, not an architectural requirement

`ARCHITECTURE_REVIEW_E2-0.md` traced this guide's original §1.2 finding to its root cause: E2-4's adapter was specified at a file path (`packages/intelligence-os/src/compat/IntelligenceOSProvider.ts`) that only resolves via a relative import if both package trees share one workspace, and `check-boundaries.mjs` was treated as a fixed, filesystem-scanning tool rather than as itself swappable. Neither of these is a property of what Epic 2 needs to *accomplish* — every Epic 2 task (re-examined individually in that review's Step 4) is satisfiable through a published, versioned `shared-intelligence-types` package plus the already-planned `IIntelligenceProvider` interface, consumed as an ordinary library dependency. Repository separation, under that review's Step 2/Step 3 analysis, is not merely an acceptable substitute for consolidation — it better serves IntelligenceOS's own stated architectural goals for dependency direction (a cross-repo import simply cannot resolve, vs. a monorepo's "resolves fine, disallowed by lint rule") and platform reusability (no un-merging required if a second consumer of IntelligenceOS ever needs the same engine).

**Corrected action for backlog:** Replace **E2-0 — Monorepo Consolidation** with a much smaller **E2-0' — Contract Distribution Setup**: publish `shared-intelligence-types` as a versioned, installable package; fix `check-boundaries.mjs`'s `RULE-IOS-ISOLATION`/`RULE-IOS-CPL-ONLY` enforcement to scan `package.json` dependency declarations rather than assume on-disk co-location (necessary regardless of topology); run the `ArtifactBlueprint`/field-shape reconciliation E2-1 needs as a cross-team design review, not a co-edited file. See the corrected Deliverable 2 backlog below.

<details>
<summary>Original finding (superseded; retained for traceability)</summary>

### 🔴 MISMATCH — Epic 2 has an unstated, blocking prerequisite: the monorepo merge itself

Every Epic 2 deliverable (E2-2 through E2-6) assumes `@brandos/intelligence-os` and `@brandos/shared-intelligence-types` are importable from inside the BrandOS monorepo via workspace resolution (`packages/control-plane-layer/src/intelligence/IntelligenceOSProvider.ts` importing `IntelligenceOS` from `'../IntelligenceOS'` per the strategy doc's own E2-4 code sample lives *inside* `packages/intelligence-os/src/compat/`, which itself must live inside the BrandOS workspace tree for CPL to resolve it).

Verified facts:
- BrandOS's root `package.json` declares `"workspaces": ["packages/*", "apps/*", "packages/auth"]` (npm/pnpm workspace protocol).
- IntelligenceOS's root `package.json` is `"name": "brandos-workspace"` with its own independent `"workspaces"`-style structure (pnpm `workspace:*` protocol referenced in `packages/intelligence-os/package.json`'s dependency on `@brandos/shared-intelligence-types`), and is currently **a separate, standalone repository** — confirmed by the two zip files being entirely disjoint directory trees with no symlinks, submodule references, or path overlap between them.
- The strategy document's own §8.1 target structure lists `intelligence-os/` and `shared-intelligence-types/` as rows inside the *same* `packages/` tree as `contracts/`, `control-plane-layer/`, etc. — i.e., the target state assumes they're merged into one workspace.

This merge is not mentioned as a task anywhere in either document. It is real engineering work: deciding whether IOS becomes a git submodule, a copied-in package, or a separate published npm package consumed via registry; reconciling two independent `pnpm`/`npm` lockfiles; making sure IOS's `vitest` config and BrandOS's `turbo`-based build (`turbo build`, `turbo typecheck` in BrandOS's `package.json` scripts) don't collide; and deciding where `check-boundaries.mjs` (a BrandOS script) gets the authority to scan a freshly-merged `packages/intelligence-os/`.

This is good news, not bad news, for feasibility — it's a one-time, mechanical, well-understood category of work (monorepo consolidation) — but it has to be sequenced explicitly **before** E2-1 in the backlog, not implied by it, because nothing else in Epic 2 can be code-reviewed, let alone merged, until both packages physically exist inside one buildable workspace.

**Action for backlog (superseded):** New task, E2-0 — Monorepo Consolidation, sequenced first in Epic 2, blocking everything else in the epic. See Deliverable 2 backlog below for the full task breakdown.

</details>


### E2-1 — Shared Type Package

🔴 **MISMATCH — the roadmap re-specifies types that already exist with different shapes, rather than reconciling the real ones.** This is the most consequential finding for Epic 2's success, because it's the contract both teams build against.

Side-by-side, field-for-field:

**`ArtifactBlueprintResult` (roadmap, §5.2 / E2-1) vs. real `ArtifactBlueprint` (`shared-intelligence-types/src/ArtifactBlueprint.ts`):**

| Roadmap field | Real IOS field | Match? |
|---|---|---|
| `blueprintId: string` | `id: string` | Name differs |
| `userId: string` | `userId: string` | 🟢 |
| `artifactType: string` | `artifactType: ArtifactType` (union of 7 literal strategic-doc types + `string`) | Type differs — see below |
| `voiceDirectives: { register: string\|null; tone: string[]; avoidPatterns: string[] }` | `voiceDirectives: { register: 'formal'\|'professional'\|'conversational'\|'technical'; tone: string[]; sentenceRhythm: 'short'\|'mixed'\|'long'; paragraphStyle: 'dense'\|'airy'; avoidPatterns: string[] }` | Real type is a closed enum, has two extra required fields (`sentenceRhythm`, `paragraphStyle`) the roadmap's version doesn't define |
| `structurePlan: { sections: Array<{id, heading, depth}> }` | `sections: BlueprintSection[]` is a **top-level field**, not nested under `structurePlan`; real `BlueprintSection` uses `title`/`purpose`/`depthLevel` (enum) /`wordCountMin`/`wordCountMax`/`subsections`/`evidenceType`, none of which match `heading`/`depth` | Structurally different, not just renamed |
| `narrativeFrame: { openingStrategy, closingStrategy }` | `narrativeFrame: { opening: string; argumentStructure: string; closing?: string; [key: string]: unknown }` — itself marked **PLACEHOLDER** in the source's own doc comment | Different field names; real type is explicitly provisional |
| `vocabularyDirectives: { preferred: string[]; forbidden: string[] }` | `vocabularyDirectives: { preferredTerms: Record<string,string>; forbiddenTerms: string[]; domainJargon: string[]; proprietaryTerms: string[] }` | `preferred` is a map of synonym→preferred-term in the real type, not a flat list |
| `audienceCalibration: { expertiseLevel: string; communicationNorms: Record<...> }` | `audienceCalibration: { isNamedRelationship: boolean; relationshipId?; audienceType?: enum; expertiseLevel: enum; communicationNorms; knownSensitivities; confidence: number }` | Real type has 4 extra fields including a `confidence` score the roadmap's version drops entirely |
| `projectContext: Record<string,unknown> \| null` | *(not a field on `ArtifactBlueprint` at all — built internally by `ProjectContextBuilder` and folded into other fields, not exposed as a standalone property)* | Field doesn't exist on the real type |
| `complianceRequirements: Array<{rule, severity}>` | `complianceRequirements: ComplianceRequirement[]` where `ComplianceRequirement = { id, description, isMandatory, [key: string]: unknown }` (also marked PLACEHOLDER) | Field names don't match (`rule`/`severity` vs. `description`/`isMandatory`) |
| `confidenceScore: number` | *(no top-level field — closest analog is `audienceCalibration.confidence`, and `intelligenceProfileVersion: number` exists but is a version counter, not a confidence score)* | Field doesn't exist |
| `degraded: boolean` | *(does not exist anywhere on `ArtifactBlueprint`)* | **Field doesn't exist** — this is the most consequential gap; see below |
| `builtAt: string` (ISO 8601) | `createdAt: Date` (a `Date` object, not an ISO string) | Type differs (`Date` vs `string`) |
| `buildDurationMs: number` | *(does not exist — `BlueprintBuilder.build()` computes a local `startMs`/`Date.now() - startMs` only for the *event payload* it emits on the bus, not for the returned blueprint itself)* | Field doesn't exist on the return value |
| — | `conflictsDetected: DetectedConflict[]`, `conflictsResolved: ConflictResolution[]`, `intelligenceProfileVersion: number`, `depthSpec: DepthSpecification` | **Four real fields the roadmap's type omits entirely** |

The missing `degraded` field is the single highest-impact item in this table: **Epic 3's shadow-mode and rollback logic (E3-M2/M3) is written entirely in terms of a `degraded: boolean` flag that does not exist on the real return type.** `BlueprintBuilder.build()` never fails outward — every per-domain fetch is wrapped in `.catch(() => null)` and the method always returns a complete object — but there is no signal on the object itself indicating *whether* any of those catches fired. Detecting degradation today would require comparing the returned blueprint against null/default values field-by-field, which is fragile, or adding the field, which is the right fix.

🟡 **NUANCED — `ArtifactType` mismatch is a real semantic gap, not just a naming one.** IOS's `ArtifactType` (`'board_update' | 'strategy_document' | 'architecture_proposal' | 'research_paper' | 'product_roadmap' | 'investor_update' | 'linkedin_post' | string`) models strategic/professional documents. BrandOS's `TaskType` (used throughout CPL/OCL — `'post' | 'carousel' | 'deck' | 'report' | 'caption'`, confirmed via `orchestrator.ts` and `IBrandCognitionRequest.taskType`) models social/marketing artifacts. The trailing `| string` in IOS's union means TypeScript won't reject a `'carousel'` literal being passed through, but `StructurePlanner.plan(request.artifactType, ...)` and `NarrativePlanner.plan(...)` likely key their universal/archetype pattern lookups off the 7 named literals — passing `'carousel'` through today probably falls back to whatever IOS's default/unknown-artifact-type path does (worth a quick spike to confirm, since this directly affects Epic 3 artifact quality for BrandOS's actual artifact types, none of which appear in IOS's named union).

**Action for backlog:** E2-1 is rewritten as a **reconciliation task**, not a from-scratch authoring task: (1) decide whether BrandOS's `ArtifactBlueprintResult` becomes a thin translation wrapper around the real `ArtifactBlueprint` (recommended — avoids maintaining two parallel shapes) or whether `ArtifactBlueprint` itself gains the missing fields (`degraded`, `confidenceScore`, `buildDurationMs`) as IOS-side additions consumed directly; (2) explicitly map BrandOS `TaskType` ↔ IOS `ArtifactType` with a translation table, and confirm with a spike what `StructurePlanner`/`NarrativePlanner` actually do for an artifact type outside the named 7. Recommendation: option (1), adding the three missing fields directly to the real `ArtifactBlueprint` type (they're additive, low-risk, and needed regardless of which system eventually calls `buildBlueprint()`), then having BrandOS's contracts-side `ArtifactBlueprintResult` be a type alias or near-identical mirror of the (now-extended) real type, eliminating the translation-fidelity risk the roadmap's own Epic 2 risk section already worries about.

### E2-2 — `IIntelligenceProvider` Interface

🟢 **CONFIRMED as a clean, additive change** once E2-1's types are settled — `packages/contracts/src/index.ts` is a pure barrel re-export file (confirmed structurally consistent with how `brand-cognition-contracts.ts` and other contract files are wired in), and adding a new interface file alongside it is a low-risk, well-understood pattern already used for every other contract in the package.

### E2-3 — `BrandOSLegacyIntelligenceProvider`

🔴 **MISMATCH — `review()`'s real signature doesn't match what the roadmap's wrapper calls.** The roadmap's `BrandOSLegacyIntelligenceProvider.reviewLearning()` pseudocode calls `this.runtime.review(userId, learningId, approved, reviewedBy)`. The real method signature, confirmed in both `IBrandIntelligenceRuntime` (`runtime/types.ts:30`) and its implementation (`BrandIntelligenceRuntime.ts:289-301`), is:
```typescript
review(workspaceId: string, entryId: string, approved: boolean, reviewedBy: string): Promise<void>
```
The first positional parameter is `workspaceId`, not `userId` — and the roadmap's own comment on the same line ("workspaceId resolved from userId for legacy compat") acknowledges this needs resolving but then writes code that just passes `userId` straight through as the first argument anyway. This will silently look up the wrong workspace (or a workspace that happens to share an ID format with a user) rather than throwing — `review()` calls `this.repository.updateStatus(workspaceId, signalId, status, reviewedBy)`, which does a plain `UPDATE ... WHERE workspace_id = $1 AND id = $2`-style match (typical Supabase repository pattern; confirmed against `IBrandSignalRepository.updateStatus()`'s signature in `brand-cognition-contracts.ts:251-256`) — passing a user ID where a workspace ID is expected means the `WHERE` clause matches zero rows, the update silently no-ops, and the caller gets a successful `Promise<void>` with nothing actually changed.

This needs an explicit lookup step: `BrandOSLegacyIntelligenceProvider.reviewLearning(userId, ...)` must resolve `userId` → the user's workspace (via `@brandos/auth`, which owns the `users`/`workspaces` relationship per `database_context.generated.md`) before calling `this.runtime.review(resolvedWorkspaceId, ...)`. The interface's choice to key `reviewLearning()` on `userId` (matching IOS's user-scoped model) rather than `workspaceId` (matching BrandOS's actual `review()`) is itself reasonable given `IIntelligenceProvider` needs to serve both systems — but the legacy adapter's implementation needs the lookup the roadmap's pseudocode skips.

🟢 **CONFIRMED — the rest of the wrapper's method-to-method mapping is sound.** `buildBlueprint()` → `this.runtime.resolve()`, `recordFeedbackEvent()` → `this.runtime.recordArtifactObservation()`, and the no-op stubs for `ingestKnowledgeAsset()`/`upsertProject()` (capabilities genuinely absent from BrandOS BI) are all structurally correct given the real `IBrandIntelligenceRuntime` surface.

🔴 **MISMATCH — the "no behavior change" claim for `buildBlueprint()` needs a caveat.** `CPLOrchestrator.orchestrate()` does **not** call `resolveBrandCognitionContext()` (the CPL proxy) at all — it calls `this.brandIntelligence.resolve()` directly on a constructor-injected `IBrandCognitionRuntime` (`orchestrator.ts:32-58`). The five CPL proxy functions in `brand-memory/service.ts` are real and are used — but only by the admin review route (`/api/control-plane/brand-memory`) and the brand-summary route (`/api/memory`), not by the generation critical path. This means:
  - E2-5's plan to "wire `IIntelligenceProvider` as the orchestrator's intelligence dependency" replacing "the `resolveBrandCognitionContext()` call" inside `orchestrator.ts` is targeting code that doesn't exist in that file — `orchestrator.ts` never calls that proxy function. The actual change is to replace the *direct* `this.brandIntelligence.resolve(...)` call (line 47-53) with `this.intelligenceProvider.buildBlueprint(...)`, which is a different (and slightly larger) edit: it touches the constructor's dependency type (`IBrandCognitionRuntime` → `IIntelligenceProvider`), not just a call site, and it also requires touching the fire-and-forget `recordArtifactObservation()` call at line 91 (same file), which is similarly direct rather than proxy-routed.
  - This is good news for the proxy-preservation goal stated in the strategy doc (§6.2: "All five CPL proxy function signatures — unchanged throughout") — those signatures genuinely don't need to change, because they were never on the critical path to begin with. But the claim that the *orchestrator* changes are minimal because they're "swapping what's behind the proxy" is incorrect; the orchestrator's own constructor and two call sites change directly.

**Action for backlog:** Correct E2-3's task to include the `userId`→`workspaceId` resolution step for `reviewLearning()`. Correct E2-5's task description (see below) to target `orchestrator.ts`'s direct `this.brandIntelligence.resolve()`/`recordArtifactObservation()` calls, not the brand-memory proxy functions, and add `recordArtifactObservation` (CPL's fire-and-forget observation call) to the `IIntelligenceProvider`-routed surface alongside `buildBlueprint`, since both are direct orchestrator calls today.

### E2-4 — `IntelligenceOSProvider`

🟢 **CONFIRMED — structurally sound** given E2-1's reconciliation lands first. `IntelligenceOS.ts`'s four real public methods (`buildBlueprint`, `recordFeedbackEvent`, `ingestKnowledgeAsset`, `upsertProject`) plus the two Epic-1 additions (`reviewLearning`, `getBrandSummary`) cover exactly the six methods `IIntelligenceProvider` needs. The `eventBus` getter already exists on `IntelligenceOS` (`get eventBus(): IntelligenceEventBus`, confirmed at the bottom of the class) — the adapter's `get eventBus()` passthrough is a correct, trivial mapping.

### E2-5 — CPL Provider Wiring

🔴 **MISMATCH — see E2-3 finding above.** This task's description needs rewriting; folded into the corrected backlog item below rather than repeated here.

🟡 **NUANCED — the `IdentityContributor` change is more involved than "accept a union type."** The real `IdentityContributor.contribute()` (`packages/output-control-layer/src/contract-assembler/contributors/IdentityContributor.ts`, full file reviewed) does not read fields off `IBrandCognitionContext` the way the strategy doc's "Before" example (§5.5) claims (`context.identity.semanticIdentity.voiceAttributes.tone`, `context.styleDirectives` — neither of those paths exists in the real `ContributorContext` shape). Instead, the real contributor:
  1. Reads `context.brandIntelligence.styleProjection` / `context.brandIntelligence.semanticIdentity` (note: nested under a `brandIntelligence` key assembled by the orchestrator, not a top-level `identity` key).
  2. **Delegates back into the runtime** by calling `context.brandIntelligenceRuntime.resolveIdentityContribution({...})` — a synchronous-feeling callback into BI's confidence-gating logic *during* contract assembly, not a pure field read.
  3. Only constructs its output from whatever `resolveIdentityContribution()` returns.

  This means adapting `IdentityContributor` for `ArtifactBlueprintResult` isn't a matter of widening the type it reads — it's removing a runtime callback and replacing it with direct field reads off the (translated) blueprint, since `ArtifactBlueprintResult`/`ArtifactBlueprint` has no equivalent "resolve my contribution with confidence gating" callback method; the confidence gating is presumably already baked into the blueprint's `voiceDirectives`/`audienceCalibration.confidence` by the time OCL sees it. This is a reasonable design (it's *better* — OCL stops needing a live reference to a runtime object) but it's a structural rewrite of `IdentityContributor.contribute()`, not an additive union-type change, and should be costed and tested as such.

**Action for backlog:** Re-cost E2-5's `IdentityContributor` sub-task as a method rewrite (remove the `resolveIdentityContribution()` delegation, add direct blueprint field reads) rather than a type-signature widening. Add a regression test specifically asserting that the union-type transition period produces identical `IIdentityContribution` output for the same underlying brand data via both code paths (legacy delegation vs. new direct read) — this is the single highest-risk file for a silent prompt-quality regression in the entire migration, since it directly controls what brand voice text reaches the LLM.

### E2-6 — Boundary Rule Additions

🔴 **MISMATCH — the four new rules don't all belong in the file the roadmap names.** `check-boundaries.mjs` is one of at least *three* separate boundary-enforcement scripts in BrandOS, confirmed by direct inspection:
- `scripts/check-boundaries.mjs` — package-to-package import rules (RULE-1 through RULE-7, plus `RULE-OCL-SCHEMA-SELECTION` and `RULE-CPL-BI-LOGIC`). Real rule **numbers** also differ from what both planning docs cite — see the dedicated correction below.
- `scripts/check-route-boundaries.mjs` (+ `scripts/shared/package-registry.mjs`'s exported `FORBIDDEN_IN_ROUTES` array) — apps/web route-level import rules. This is where `RULE-IOS-CPL-ONLY` belongs, not `check-boundaries.mjs`.
- `packages/output-control-layer/tests/boundary/dependencyBoundary.test.ts` — a Vitest-based boundary check living *inside* the OCL package itself, which is how `RULE-OCL-GOVERNANCE-CONFIG` is actually enforced today (confirmed: that rule does not appear anywhere in `check-boundaries.mjs`'s source, only in the monorepo context doc's *description* of it, which explicitly cites `dependencyBoundary.test.ts` as the enforcement mechanism).

So of the four proposed rules:
- `RULE-IOS-ISOLATION` (IOS must not import `@brandos/*` implementation packages) → belongs in `check-boundaries.mjs`, alongside RULE-1/2/3 (same style: import-source scanning of a `packages/*` directory).
- `RULE-SIT-ISOLATION` (shared-intelligence-types is zero-dependency) → belongs in `check-boundaries.mjs`, same reasoning.
- `RULE-IOS-CPL-ONLY` (apps/web routes must not import IOS directly) → belongs in `scripts/shared/package-registry.mjs`'s `FORBIDDEN_IN_ROUTES` array (just add `'@brandos/intelligence-os'` to the existing six-entry list), enforced by `check-route-boundaries.mjs`, **not** `check-boundaries.mjs`.
- `RULE-IOS-OCL-NONE` (OCL must not import IOS) → belongs in `check-boundaries.mjs` as a new check function modeled directly on the existing `checkOclBiRule()` (RULE-2), which already does exactly this check for `@brandos/brand-intelligence` and just needs a parallel function for `@brandos/intelligence-os`.

This is a minor correction in absolute terms (it's a "which file" question, not a "is this possible" question) but it matters for sprint planning because `check-route-boundaries.mjs` and `check-boundaries.mjs` are different scripts with different test suites and different CI steps — a task card that says "add 4 rules to check-boundaries.mjs" will produce a PR that puts `RULE-IOS-CPL-ONLY` in the wrong file, where it will not actually run against route files.

**Action for backlog:** Split E2-6 into two tasks against two files, as detailed in the Deliverable 2 backlog.

### Epic 2 — Exit Criteria Validation

All six stated exit criteria are achievable once the corrections above are folded in. One addition: "No BrandOS behavior change detectable in any existing test" (criterion 7) needs `orchestrator.test.ts` (confirmed to exist, per CPL's package context doc test inventory) to specifically cover the new `IIntelligenceProvider`-injected constructor path with `BrandOSLegacyIntelligenceProvider` wired — the existing test file predates this change and will need new cases added, not just a pass/fail check on the old ones.

---

## 1.3 Epic 3 — BrandOS Adoption

**Roadmap claim:** Four sequential, independently-reversible milestones; "BrandOS changes only the provider implementation behind existing proxy functions. No routes change."

**Verdict: Executable, sequencing is sound, but the "behind existing proxy functions" framing inherited from the strategy doc is the same 🔴 finding as E2-3/E2-5 above, propagated forward, plus two additional Epic-3-specific findings below.**

### E3-M1 — Feature Flag & Dual-Write

🟢 **CONFIRMED — the `workspace_settings` migration target is correct.** `workspace_settings.workspace_id` is `UUID NOT NULL`, 1:1 with `workspaces.id` (confirmed in `database_context.generated.md:733-755`) — the proposed `ALTER TABLE ... ADD COLUMN intelligence_provider TEXT DEFAULT 'legacy' CHECK (...)` is a clean, low-risk additive migration against a properly-typed, FK-backed table. No correction needed.

🔴 **MISMATCH — propagated from E2-5: the orchestrator-side provider-selection code in the roadmap's E3-M1 snippet reads `workspaceSettings.intelligence_provider` and calls `provider.buildBlueprint(request)`, then separately fire-and-forgets `this.iosProvider.recordFeedbackEvent(event)` for dual-write — but `orchestrator.ts`'s real fire-and-forget call (line 91-99) is `recordArtifactObservation()`, called directly on `this.brandIntelligence`, not via any proxy, and not via a `recordFeedbackEvent`-named method.** Once `IIntelligenceProvider` is wired (Epic 2), this becomes `this.intelligenceProvider.recordFeedbackEvent(...)` correctly — but the *legacy* provider's dual-write companion path (calling `this.iosProvider.recordFeedbackEvent()` *in addition to* the legacy call, for data seeding) needs to be added at the same call site, replacing a single `void this.brandIntelligence.recordArtifactObservation(...)` statement with a dual dispatch. This is a small, surgical change once E2-3/E2-5 are corrected, but the task description should point at the real line, not the proxy file.

🟡 **NUANCED — `IntelligenceOSProvider.ts`'s "instantiates IOS via factory" needs a concrete answer for where the Supabase service-role client comes from.** `IntelligenceOSConfig.supabase` requires a `SupabaseClient` initialized with the service role key (per IOS's own doc comment: "Intelligence OS needs the service role to bypass RLS"). BrandOS's `instrumentation.ts` already constructs exactly this kind of client for `SupabaseBrandSignalRepository` (lines 56-68, using `SUPABASE_SERVICE_ROLE_KEY`). The IOS provider factory should reuse that same admin client rather than constructing a second one — both for connection-pool hygiene and because the roadmap doesn't currently say where this client comes from.

### E3-M2 — Shadow Mode & Parity Validation

🔴 **MISMATCH — the parity-comparison logic depends on the missing `degraded` field (same root cause as the E2-1 finding) and on a governance-score comparison that doesn't have a like-for-like basis today.** `evaluateGovernance()` (in `@brandos/governance-layer`, called from `orchestrator.ts`) scores **generated artifact text**, not blueprints — there is no direct "IOS blueprint score" vs. "legacy context score" comparison available anywhere in the current pipeline, because governance scoring happens *after* the LLM call, several steps downstream of blueprint construction. The roadmap's `telemetry.logBlueprintComparison(legacyBlueprint.value, iosBlueprint.value, request)` call compares the two blueprint *objects* directly — but doing anything with that comparison that maps to "≥ 95% parity... where IOS score ≥ legacy score" (the stated exit criterion) requires either (a) running both blueprints through generation and governance independently (expensive — doubles LLM calls during shadow mode) or (b) defining a parity metric computed directly on blueprint *content* (e.g., field-presence/structural-completeness scoring) that doesn't require a second generation pass. The roadmap conflates these two — its mechanics snippet does (a) implicitly (comparing blueprint values) while its exit criterion is phrased in terms of (b)-style "governance scores." This needs to be resolved as an explicit design decision before E3-M2 starts, not discovered mid-shadow-run.

**Action for backlog:** Add a design-decision task to E3-M2: define the actual parity metric (blueprint structural comparison vs. dual-generation-and-score) before building the shadow-mode telemetry pipeline. Recommend structural comparison as the primary metric (cheap, real-time, no extra LLM spend) with periodic spot-check dual-generation (e.g., 1% sample) for ground-truth governance-score validation — this preserves the spirit of the 95% parity target without doubling inference cost for every shadow-mode request.

### E3-M3 — Progressive Rollout

🟢 **CONFIRMED — config-only rollout via the `workspace_settings` flag is sound** given the E3-M1 migration. No correction.

### E3-M4 — `@brandos/brand-intelligence` Retirement

🔴 **MISMATCH — the data migration SQL is missing the TEXT→UUID workspace ID translation identified in the E1-2 finding above, and the table-drop order needs a check against actual FK relationships.** The roadmap's migration step ("Export `brand_memory_entries` and `identity_signals` → `intelligence.learnings`...") needs, at minimum: (1) a workspace lookup translating each TEXT `workspace_id` value in the source tables to the corresponding `workspaces.id` UUID (via whatever join key actually relates them today — likely none exists explicitly, since the BI tables were "intentionally decoupled" from FK relationships per their own schema comments, meaning this translation may require a fuzzy or manual reconciliation step rather than a clean join); (2) a `user_id` resolution for each migrated row, since `intelligence.learnings.user_id` is `NOT NULL` and workspace-scoped BI signals have no original user attribution at all (they were never tied to an individual user — `brand_memory_entries` has no `user_id` column whatsoever, confirmed in the schema listing). The roadmap's classification mapping (A-class → `permanent`, etc.) is fine as a value-level transform; the row-level identity resolution is the actually-hard part and isn't mentioned. The roadmap itself rates this risk "LOW" (§10, Risk 6) on the reasoning that "this migration only affects workspaces that received no IOS dual-write data" and will be a narrow scope by the time E3-M4 runs — that reasoning is sound and is the right mitigation, but the *mechanism* (which user_id does an orphaned, workspace-only signal get attributed to?) still needs an answer even for a small number of rows, and should be resolved with a real design decision (e.g., attribute to `workspaces.owner_id`) before the migration script is written, not deferred to the script itself.

🟢 **CONFIRMED — the rest of E3-M4's scope is accurate.** `@brandos/brand-intelligence`'s dependency-impact score is "medium" risk (score 5, exactly 2 direct consumers: CPL and web — confirmed in `.context/dependency_impact.generated.json`), meaningfully lower blast radius than `@brandos/contracts` (score 26) or `@brandos/control-plane-layer` (score 23, and flagged as an actual routing chokepoint in the same file) — the retirement itself is a comparatively contained, low-blast-radius change exactly as the roadmap's own risk rating implies, even though the roadmap doesn't cite this specific evidence.

### Epic 3 — Exit Criteria Validation

Sound as written, contingent on the corrections above. One addition worth tracking explicitly: criterion 3 ("No BrandOS route imports any BI runtime type or class") should be checked against `apps/web/instrumentation.ts`, which today imports the **concrete class** `SupabaseBrandSignalRepository` directly (not just types) for the boot-time runtime initialization (`instrumentation.ts:57`). This isn't a route file, so it's technically outside the literal wording of "no BrandOS route imports," but it is a direct concrete-class import of the package being retired, and `instrumentation.ts`'s entire BI-initialization block (step 3 of the boot sequence) needs to be deleted as part of E3-M4, which the roadmap's "Files removed/modified" list does separately call out (`apps/web/instrumentation.ts — remove initBrandIntelligenceRuntime() boot step`) — so this is actually already covered, just worth flagging that the existing exit-criterion wording ("no route imports") and the existing files-modified list (which does cover instrumentation.ts) need to be read together, since the criterion as literally worded wouldn't catch this file on its own.
# 2. Implementation Backlog

Numbering convention: `E{epic}-{feature}-T{task}-S{subtask}`. Complexity is T-shirt sized (S = under half a day, M = half a day to two days, L = three to five days, XL = needs its own spike before estimation) and is for relative sequencing, not a committed estimate — actual sprint-level estimates from the roadmap's "sprint estimate" column are preserved at the Feature level where the roadmap supplied one.

---

## EPIC 1 — IntelligenceOS Capability Superset

*All tasks below touch only `packages/intelligence-os/` and `packages/shared-intelligence-types/` in the IntelligenceOS repository. Zero BrandOS files are modified in this epic — under E1-4's corrected design (see Epic Validation finding above), this is true for E1-4 as well, with no deferred BrandOS-side leg.*

### Feature E1-1 — Human Learning Review API *(roadmap: Critical, 0.5 sprints)*

**E1-1-T1 — Add `intelligence.learning.reviewed` event type**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/types/events.ts`
- Change: add `'intelligence.learning.reviewed'` to the `IntelligenceEventType` union (currently 14 literals → 15); add a dedicated `LearningReviewedPayload` interface (`{ userId, learningId, approved, reviewedBy, occurredAt }`) and a corresponding arm in the `IntelligenceEventPayload<T>` conditional type, following the exact pattern used for `ProfileUpdatedPayload`/`RecurringConflictPayload`.
- Dependencies: none.
- Complexity: S
- Testing: type-level test only (confirm `IntelligenceEventPayload<'intelligence.learning.reviewed'>` resolves to the new interface, not `BaseEventPayload`) — follow the existing pattern in any current type test file for this module if one exists, else add one.

**E1-1-T2 — Check `errors.ts` for required error classes**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/errors.ts` (read), `UserIntelligenceDomain.ts` (consumer)
- Change: confirm `EntityNotFoundError` and `ValidationError` (named in the roadmap's acceptance criteria) actually exist in `errors.ts` alongside the confirmed `DatabaseError`/`PhaseNotImplementedError`. If either name doesn't match what's already there, use the existing error class names instead of introducing near-duplicate error types — do not add a second "not found" error class if one already exists under a different name.
- Dependencies: none.
- Complexity: S
- Testing: none (read-only reconnaissance task; output is a go/no-go note for T3).

**E1-1-T3 — `UserIntelligenceDomain.reviewLearning()`**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`
- Change: add method per roadmap's signature (`userId, learningId, approved, reviewedBy` → `Promise<void>`). State transition `FLAGGED → ACTIVE` (approved) or `FLAGGED → ARCHIVED` (rejected), matching the confirmed `LearningState` union. Scope the update with `.eq('id', learningId).eq('user_id', userId)` (same defensive pattern as the existing `getActiveLearnings()` method in the same file). Throw the error classes confirmed in T2 for not-found / wrong-user cases — **the update query alone cannot distinguish "no such learning" from "learning belongs to another user"** (both produce zero matched rows under a combined `.eq()` filter), so this method needs either a pre-read (`SELECT state, user_id WHERE id = learningId`, then compare) or two sequential conditional checks to return the correct, distinct error type for each case, not a single generic failure.
- Dependencies: E1-1-T2.
- Complexity: M
- Testing: Vitest unit tests — approved path (FLAGGED→ACTIVE), rejected path (FLAGGED→ARCHIVED), not-found learningId (correct error type), wrong-user learningId (correct error type, distinct from not-found). Use the existing test Supabase project / mocking pattern already established in `UserIntelligenceDomain`'s existing test coverage.

**E1-1-T4 — `IntelligenceOS.reviewLearning()` public method**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/IntelligenceOS.ts`
- Change: add the fifth public method, delegating to `this.domains.user.reviewLearning(...)`, then `this.bus.emit('intelligence.learning.reviewed', {...})` per the event added in T1. Update the class's own doc comment ("Public API surface (4 methods, fixed for all sprints)") to reflect the new count and drop or revise "fixed for all sprints" if the pre-flight check (Epic Validation, E1-1 nuance) confirms nothing depends on that exact wording.
- Dependencies: E1-1-T1, E1-1-T3.
- Complexity: S
- Testing: integration test against the test Supabase project (`tests/integration/`) — full round trip: insert a FLAGGED learning fixture, call `reviewLearning()`, assert persisted state and emitted event.

**E1-1-T5 — Pre-flight: confirm no hard dependency on "4 methods, fixed"**
- Package: `@brandos/intelligence-os`
- Files: search across `packages/intelligence-os/` and `packages/intelligence-os/tests/`
- Change: none (verification task). Grep for method-count assertions, reflection-based tests, or any tooling that enumerates `IntelligenceOS`'s public surface.
- Dependencies: none — can run in parallel with T1–T4, should complete before T4's doc-comment edit.
- Complexity: S
- Testing: n/a.

### Feature E1-2 — Workspace-Scoped Brand Voice *(roadmap: High, 1–1.5 sprints; corrected sequencing below)*

**E1-2-T0 — Design decision: drop the sentinel-user bridge** *(blocking, do first)*
- Package: n/a (decision record, not code)
- Change: per the Epic Validation finding (`_workspace_<workspaceId>` is not a valid UUID and has no `auth.users` row, so it cannot satisfy `intelligence.learnings.user_id`'s `NOT NULL REFERENCES auth.users(id)` constraint), formally drop the "Phase A sentinel" approach described in the roadmap and adoption strategy. Go directly to a nullable, workspace-keyed write path (the roadmap's own "Phase B" target) without an intermediate sentinel step.
- Dependencies: none.
- Complexity: S (decision + write-up), but blocks T1–T3 below until resolved.
- Testing: n/a.

**E1-2-T1 — Composite index on `intelligence.learnings.workspace_id`**
- Package: `@brandos/intelligence-os`
- Files: new migration file in `packages/intelligence-os/src/db/` (follow whatever migration-numbering convention the existing `schema.sql` / any prior migration files use — confirm convention before naming the file)
- Change: `CREATE INDEX intelligence_learnings_workspace_domain ON intelligence.learnings(workspace_id, domain, state) WHERE workspace_id IS NOT NULL;` exactly as specified in the roadmap — this part of the roadmap's SQL is correct as written and needs no modification.
- Dependencies: E1-2-T0 (confirms this index is still the right shape under the revised, non-sentinel design — it is, since the index doesn't care how `workspace_id` gets populated).
- Complexity: S
- Testing: migration applies cleanly against the test Supabase project; `EXPLAIN` a representative workspace-scoped query to confirm the index is used.

**E1-2-T2 — `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` and `upsertWorkspaceLearning()`**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts`
- Change: add both methods per roadmap signatures. `getWorkspaceLearnings(workspaceId, domain?)` queries `intelligence.learnings` filtered by `workspace_id` (using the index from T1) instead of `user_id` — this is a genuinely new query shape for this domain class, since its only existing method (`getContext()`) queries `knowledge_assets`, not `learnings`, at all. `upsertWorkspaceLearning(input)` needs an explicit decision on what `user_id` value to write given T0's resolution — recommend a nullable `user_id` write (confirm the column actually allows null first; current schema says `NOT NULL`, so **this may require a schema change**, not just an application-layer change, to support a true workspace-only learning with no individual user attribution. Flag this as a sub-decision under T0, not a new surprise at implementation time).
- Dependencies: E1-2-T0, E1-2-T1.
- Complexity: L (the `user_id NOT NULL` constraint means this task may expand into a schema migration — recommend confirming this before sizing it as M)
- Testing: integration tests — single-user workspace, multi-user workspace (two different `user_id`s sharing one `workspace_id`), no-workspace request (graceful empty result, not an error).

**E1-2-T3 — `NarrativePlanner` workspace voice layer**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/blueprint/NarrativePlanner.ts`, `packages/intelligence-os/src/blueprint/BlueprintBuilder.ts`
- Change: `BlueprintBuilder.build()`'s Step 1 parallel-fetch (`Promise.all([...])`) needs a fifth call — `this.domains.workspace.getWorkspaceLearnings(request.workspaceId)` — gated on `request.workspaceId` being present (it's optional on `ArtifactRequest`). `NarrativePlanner.plan()`'s signature changes from `(artifactType, profile, archetype, audienceCalibration, projectContext)` to include a new `workspaceLearnings` parameter, applying the precedence order specified in the roadmap (workspace brand > user voice > archetype default > system default) when constructing `voiceDirectives`.
- Dependencies: E1-2-T2.
- Complexity: L
- Testing: unit tests on `NarrativePlanner` directly (precedence ordering with all four layers present, with workspace layer absent, with only system default available); integration test confirming two different users in the same workspace get matching workspace-level voice fields in their respective blueprints.

### Feature E1-3 — Brand Summary Query API *(roadmap: High, 0.5 sprints)*

**E1-3-T1 — `UserIntelligenceDomain.countActiveLearnings()` and `getTopTaxonomyCategories()`**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts`
- Change: `countActiveLearnings(userId, workspaceId?)` — reuse the exact state filter already established in `getActiveLearnings()` (`state IN ('VALIDATED','CONFIRMED','ACTIVE')`), add a `.eq('workspace_id', workspaceId)` clause only when `workspaceId` is supplied (depends on E1-2-T1's index existing for this to be performant once workspace filtering is added). `getTopTaxonomyCategories(userId, limit = 3)` — `GROUP BY taxonomy_category` ordered by count descending, using the existing `(user_id, taxonomy_category, state)` index (no new index needed, confirming the roadmap's claim).
- Dependencies: E1-2-T1 (for the workspace-filtered variant's index; the non-workspace-filtered path has no dependency and could ship first if sequencing pressure requires it).
- Complexity: M
- Testing: unit tests — no-profile user (zero counts), user with active learnings across categories (correct top-3 ordering, including a tie-breaking rule if counts are equal — define one, e.g. most-recently-updated-first, since the roadmap doesn't specify tie-breaking), workspace-scoped filter applied vs. omitted.

**E1-3-T2 — `IntelligenceOS.getBrandSummary()` public method**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/IntelligenceOS.ts`
- Change: add per roadmap signature, composing `getCurrentProfile()`, `getCurrentArchetype()` (both already exist), and the two new T1 methods. `degraded: true` exactly when `profile === null`, matching the roadmap's spec precisely.
- Dependencies: E1-3-T1.
- Complexity: S
- Testing: unit tests — no-profile (degraded=true, all-zero/null fields), full-profile (all fields populated correctly), workspace-scoped vs. user-only.

**E1-3-T3 — Promote `IntelligenceSummary` type to `shared-intelligence-types`**
- Package: `@brandos/shared-intelligence-types`
- Files: `packages/shared-intelligence-types/src/index.ts`, new file `IntelligenceSummary.ts`
- Change: author the type now (it doesn't yet exist in `shared-intelligence-types`, unlike `ProjectInput`/`KnowledgeAssetInput`), matching the shape T2 actually returns — author the type from the implementation, not from the roadmap's independently-drafted version, to avoid a repeat of the E2-1 drift problem.
- Dependencies: E1-3-T2.
- Complexity: S
- Testing: package builds with zero new dependencies (re-confirm `RULE-SIT-ISOLATION`-equivalent constraint holds).

### Feature E1-4 — VLM Visual Intelligence Bridge *(corrected design — see Epic Validation finding above; now entirely IOS-side Knowledge Pipeline work, no BrandOS dependency, fully completable within Epic 1)*

**E1-4-T1 — Add `VisualFeatureExtractor` to the Knowledge Pipeline**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/knowledge/VisualFeatureExtractor.ts` (new), `packages/intelligence-os/src/knowledge/types.ts` (add `VisualFeatureExtractionResult` with distinct `colors`/`typography`/`layout`/`mood` fields — not one collapsed free-text blob, per the Semantics Analysis's specific objection to the original design)
- Change: new extractor class, structurally parallel to `VocabularyExtractor`/`FrameworkExtractor`/`PatternExtractor` (same `extract(job: ExtractionJob): <Result>` shape — see `intelligence-os-knowledge/AGENT_CONTEXT.md`).
- Dependencies: none.
- Complexity: M
- Testing: unit tests with exact-match assertions against representative visual-asset fixtures, following the same deterministic-output testing convention already used for the other three extractors (per that package's `AGENT_CONTEXT.md` testing-expectations guidance).

**E1-4-T2 — `KnowledgeProcessor` invocation + persistence wiring**
- Package: `@brandos/intelligence-os`
- Files: `packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts`, `packages/intelligence-os/src/db/schema.sql` (additive `extracted_visual_features` JSONB column on `intelligence.knowledge_assets`)
- Change: `KnowledgeProcessor.process()` invokes `VisualFeatureExtractor` for visual-typed assets, alongside the existing text extractors when both apply — no event subscription, no new event type. Reference-material results persist to the new `extracted_visual_features` column; style/mood signals route to a `personal_brand_signal`-tagged `Learning` via `UserIntelligenceDomain` (see ADR-001 §5 for the owning-domain split, and note the existing `persistAsset()` direct-write issue tracked as Gap Analysis G-2 — this is a good opportunity to route the new write through the domain correctly from the start rather than adding a sixth direct-write call site).
- Dependencies: E1-4-T1.
- Complexity: M
- Testing: unit test — visual asset → extractor invoked, result persisted to the correct location by signal type; non-visual asset → extractor not invoked, no error.

~~**E1-4-T3 — *(tracked, not built in Epic 1)* End-to-end wiring verification**~~ — **removed.** This task existed only because the original design had a BrandOS-side leg to verify. The corrected design has none; E1-4-T2's own integration test is the complete verification, with no deferred half tracked into Epic 3.

### Feature E1-5 — Classification Backward-Compatibility Mapping *(roadmap: Medium, 0.25 sprints; corrected target enum)*

**E1-5-T1 — `toLegacyClassification()` utility, targeting the real 3-value enum**
- Package: `@brandos/intelligence-os`
- Files: new file `packages/intelligence-os/src/utils/classificationCompat.ts`
- Change: implement against `'A' | 'B' | 'C'` (confirmed real type), **not** `'A'|'B'|'C'|'D'|'E'` (roadmap's incorrect target — see Epic Validation finding). Mark `@internal` in JSDoc per the roadmap's original intent. Threshold values are placeholders pending T2's calibration.
- Dependencies: none.
- Complexity: S
- Testing: unit tests covering all 3 output values and boundary confidence values at whatever thresholds T2 settles on.

**E1-5-T2 — Threshold calibration against real BrandOS classification data**
- Package: cross-repo (read-only access to BrandOS `brand_memory_entries` sample data, or a synthetic dataset matching its distribution if production data access isn't available to the IOS team)
- Files: none (analysis task; output feeds back into E1-5-T1's threshold constants)
- Change: validate that the chosen `stabilityClass`/`confidence` cutoffs in T1 produce a classification distribution that's sane relative to how BrandOS's own `BrandSignalClassifier` actually buckets signals into A/B/C today (confirmed to exist at `packages/brand-intelligence/src/signals/BrandSignalClassifier.ts` per the package's internal architecture listing) — this function exists and is the actual source of ground truth for what "Class A" means in BrandOS; use it as the calibration reference rather than guessing thresholds independently.
- Dependencies: none — can run in parallel with T1, feeds the final threshold values into T1 before T1 is considered done.
- Complexity: M (mostly analysis time, not code)
- Testing: n/a directly; informs T1's test fixtures.

### Epic 1 — Housekeeping (not in original roadmap, added per Epic Validation findings)

**E1-H1 — Reconcile `ProjectInput`/`KnowledgeAssetInput` duplication**
- Package: `@brandos/intelligence-os`, `@brandos/shared-intelligence-types`
- Files: `packages/intelligence-os/src/types/domains.ts`, `packages/shared-intelligence-types/src/index.ts`, `packages/intelligence-os/src/IntelligenceOS.ts`
- Change: re-export `ProjectInput`/`KnowledgeAssetInput` from `shared-intelligence-types` (they're already correctly shaped — confirmed field-for-field identical to the roadmap's independently-proposed `IntelligenceProjectInput`/`IntelligenceKnowledgeAssetInput`), then have `IntelligenceOS.ts` import them from there instead of `./types/domains`, eliminating the duplicate-definition risk before Epic 2 reconciliation work begins.
- Dependencies: none.
- Complexity: S
- Testing: existing test suite passes unchanged (pure refactor, no behavior change).

**E1-H2 — Standalone IOS-side boundary checker**
- Package: `@brandos/intelligence-os` (repo-root tooling)
- Files: new file, e.g. `scripts/check-ios-isolation.mjs` in the IntelligenceOS repo root
- Change: a minimal (~30-line) standalone script scanning `packages/intelligence-os/src/**/*.ts` for any import not matching `@supabase/supabase-js` or `@brandos/shared-intelligence-types`, giving Epic 1's `RULE-IOS-ISOLATION` exit criterion a real, falsifiable check instead of a vacuously-true one (see Epic Validation finding on this point). This is a throwaway script — once `check-boundaries.mjs` is updated (E2-0'-T3) to scan dependency declarations across the repository boundary, BrandOS's real `check-boundaries.mjs` supersedes it. No repository merge is required for that handoff to happen.
- Dependencies: none.
- Complexity: S
- Testing: run against current IOS source (should pass); run against a deliberately-broken fixture import (should fail) to confirm the checker actually detects violations.

---

## EPIC 2 — BrandOS Compatibility Layer

### Feature E2-0' — Contract Distribution Setup *(corrected — replaces "E2-0 — Monorepo Consolidation"; see Epic Validation §1.2 correction and `ARCHITECTURE_REVIEW_E2-0.md`)*

> This feature does what the original E2-0 was actually trying to accomplish — making sure both sides can see each other's types and that boundary enforcement works — without merging the two repositories. It is sized closer to the original Roadmap's "create the package, 0.5 sprints" estimate for E2-1 than to the superseded E2-0's `L`-complexity, multi-task merge effort, because it is genuinely smaller work.

**E2-0'-T1 — Publish `@brandos/shared-intelligence-types` as a versioned, installable package**
- Package: `@brandos/shared-intelligence-types`
- Files: `packages/shared-intelligence-types/package.json` (add a real `version`, publish config), CI/registry configuration (private npm registry or scoped GitHub Packages — whichever BrandOS's existing tooling already supports, since this package has no special requirements beyond what any other internal library needs)
- Change: this package already has zero runtime dependencies and a stable, narrow surface (`ArtifactRequest`, `ArtifactBlueprint`, `FeedbackEvent` and their sub-types) — publishing it is mechanical, not a redesign. BrandOS depends on it via a real version range (`^0.1.0` or similar), not `workspace:*`.
- Dependencies: none.
- Complexity: S
- Testing: `pnpm install` succeeds in BrandOS's repository with the published version resolvable; a smoke-test import in a throwaway file confirms the types resolve and structurally match what BrandOS's contracts-side types expect to alias.

**E2-0'-T2 — `ArtifactBlueprint`/field-shape reconciliation as a design review**
- Package: cross-team decision, lands in `@brandos/shared-intelligence-types` (published per T1, then consumed)
- Files: `packages/shared-intelligence-types/src/ArtifactBlueprint.ts`
- Change: the field-by-field reconciliation E2-1 needs (the same content as the original E2-1-T1) is run as a design review against the published package's source repository — both teams look at the same file in the same PR, in the IOS repository, the same way any external contributor proposing a change to a library would. This replaces "needs the merged workspace so both teams are editing the same physical file" with "both teams review the same PR," which achieves the actual goal (agreement on the shape) without requiring physical co-location.
- Dependencies: E2-0'-T1.
- Complexity: S (the reconciliation *content* is unchanged from the original E2-1-T1; only the collaboration mechanism is lighter)
- Testing: n/a — this task produces a merged PR in the type package, verified by that package's own typecheck.

**E2-0'-T3 — Fix `check-boundaries.mjs` to scan dependency declarations, not an on-disk tree**
- Package: BrandOS tooling
- Files: `scripts/check-boundaries.mjs`, `scripts/shared/package-registry.mjs`
- Change: `check-boundaries.mjs` currently asserts `RULE-IOS-ISOLATION`/`RULE-IOS-CPL-ONLY`-style rules (once added, per E2-6) by scanning packages physically present under `packages/*`. Update it to additionally scan each package's `package.json` `dependencies` (and, for `RULE-IOS-CPL-ONLY`, route-file import statements) regardless of whether the dependency resolves via `workspace:*`, a registry version, or a git URL — a `package.json` dependency declaration doesn't change shape based on where the dependency physically lives. This is necessary regardless of which integration model is chosen (the original E2-0-T3 already identified a version of this same need, just scoped to "don't false-fail on a freshly-merged package" rather than to "work correctly across a repository boundary").
- Dependencies: none (can proceed in parallel with T1/T2 — this is a tooling fix to the checker itself, not gated on the package being published yet).
- Complexity: S
- Testing: run `node scripts/check-boundaries.mjs` against a fixture `package.json` declaring a registry-resolved (non-workspace) dependency on `@brandos/intelligence-os`; confirm it's recognized and checked, not flagged as "unknown package."

### Feature E2-1 — Shared Type Reconciliation *(roadmap: "create the package," 0.5 sprints; rescoped per Epic Validation finding)*

**E2-1-T1 — Field-by-field reconciliation workshop: `ArtifactBlueprint`**
- Package: cross-team decision, lands in `@brandos/shared-intelligence-types`
- Files: `packages/shared-intelligence-types/src/ArtifactBlueprint.ts` (extend, don't replace)
- Change: per the Epic Validation table, decide and implement: (1) add `degraded: boolean` to the real `ArtifactBlueprint` (set `true` whenever any of `BlueprintBuilder.build()`'s Step-1 parallel fetches caught an error — this requires `BlueprintBuilder` to track which promises in its `Promise.all` resolved via their `.catch()` fallback, which it currently discards; this is a real code change to `BlueprintBuilder.build()`, not just a type addition); (2) add `confidenceScore: number` (derive from `audienceCalibration.confidence` and `intelligenceProfileVersion` — define the formula); (3) add `buildDurationMs: number` (the value is already computed locally as `Date.now() - startMs` for the emitted event — just also attach it to the returned object); (4) leave `id`/`createdAt` as-is (rename plans dropped — BrandOS's contracts-side type will alias `blueprintId` → the real `id` field rather than forcing IOS to rename a field three other modules already reference).
- Dependencies: E2-0'-T2 (the reconciliation decision needs to be agreed via the cross-team design review; this task implements that decision).
- Complexity: L (touches `BlueprintBuilder.build()`'s control flow, not just a type file)
- Testing: unit tests on `BlueprintBuilder` — degraded=true when a domain fetch is forced to fail in a test double; degraded=false on the happy path; `buildDurationMs` is a positive number in both cases.

**E2-1-T2 — `IIntelligenceProvider`-facing alias types in `@brandos/contracts`**
- Package: `@brandos/contracts`
- Files: `packages/contracts/src/intelligence-provider.ts` (new)
- Change: define `IntelligenceBlueprintRequest` (≈ `ArtifactRequest`, renamed/aliased for the BrandOS-facing contract per the roadmap's naming) and have `ArtifactBlueprintResult` be a **type alias or minimal wrapper** around the now-extended real `ArtifactBlueprint` (post E2-1-T1) rather than an independently-specified shape — this is the central correction from the Epic Validation findings: stop maintaining two parallel definitions of the same object.
- Dependencies: E2-1-T1.
- Complexity: M
- Testing: TypeScript compiles; a sample real `ArtifactBlueprint` value satisfies the `ArtifactBlueprintResult` alias with no manual field remapping required (if remapping is still required after this task, the alias isn't doing its job — revisit).

**E2-1-T3 — `ArtifactType` ↔ `TaskType` translation spike**
- Package: cross-repo
- Files: none yet — spike/investigation
- Change: confirm what `StructurePlanner.plan()` / `NarrativePlanner.plan()` actually do when `artifactType` is `'carousel'`, `'deck'`, `'report'`, `'post'`, or `'caption'` (BrandOS's real `TaskType` values) rather than one of IOS's 7 named literals. Document the fallback behavior. If the fallback is acceptable (e.g., a sensible generic/default pattern), no further action needed beyond documenting it. If it's not (e.g., it throws, or silently returns an empty structure plan), this becomes a blocking IOS-side task to add BrandOS's task types to the named `ArtifactType` union or to `StructurePlanner`'s pattern table.
- Dependencies: E2-0'-T1 (need IOS's published types resolvable from BrandOS's repo to ask this question properly with type-checking, though the investigation itself could start with the IOS repo in isolation).
- Complexity: M (spike) → unknown until spike completes, possibly L if remediation is needed.
- Testing: the spike's own output is a small test/script exercising `StructurePlanner.plan('carousel', ...)` etc. and observing the result.

**E2-1-T4 — `IntelligenceFeedbackEvent` reconciliation**
- Package: `@brandos/shared-intelligence-types` / `@brandos/contracts`
- Files: `packages/shared-intelligence-types/src/FeedbackEvent.ts`
- Change: minor — real `FeedbackEvent.blueprintId` vs. roadmap's `blueprintRef`; align on `blueprintId` (the real field) and update the roadmap-derived `IntelligenceFeedbackEvent` contracts-side type to match, rather than introducing a second field name.
- Dependencies: none.
- Complexity: S
- Testing: type-level only.

**E2-1-T5 — `RULE-SIT-ISOLATION` enforcement**
- Package: BrandOS tooling
- Files: `scripts/check-boundaries.mjs`
- Change: add `checkSitIsolationRule()` modeled on the existing `checkOclBiRule()` pattern — scan `packages/shared-intelligence-types/src` for any import outside the TypeScript standard library (no `@brandos/*`, no third-party runtime packages — types-only).
- Dependencies: E2-0'-T3.
- Complexity: S
- Testing: passes against current `shared-intelligence-types` source; fails against a deliberately-injected bad import in a test fixture.

### Feature E2-2 — `IIntelligenceProvider` Interface *(roadmap: 0.25 sprints)*

**E2-2-T1 — Define and export the interface**
- Package: `@brandos/contracts`
- Files: `packages/contracts/src/intelligence-provider.ts`, `packages/contracts/src/index.ts`
- Change: as specified in the roadmap, importing the (now-reconciled, per E2-1) shared types. Six methods + `eventBus` getter, exactly as drafted, since this part of the roadmap's design — independent of the underlying type shapes — is sound.
- Dependencies: E2-1-T1 through E2-1-T4 (needs final type shapes).
- Complexity: S
- Testing: `pnpm -r typecheck` passes; existing `@brandos/contracts` test suite (`src/__tests__/`) passes unchanged (purely additive).

### Feature E2-3 — `BrandOSLegacyIntelligenceProvider` *(roadmap: 0.5 sprints; corrected per Epic Validation)*

**E2-3-T1 — Implement the wrapper class with corrected `reviewLearning()`**
- Package: `@brandos/control-plane-layer`
- Files: new file `packages/control-plane-layer/src/intelligence/BrandOSLegacyIntelligenceProvider.ts`
- Change: as roadmap-specified, **except** `reviewLearning(userId, learningId, approved, reviewedBy)` must first resolve `userId` → the user's `workspaceId` (via `@brandos/auth`, confirmed to own the `users`/`workspaces` relationship) before calling `this.runtime.review(resolvedWorkspaceId, learningId, approved, reviewedBy)`. Add explicit handling for the case where a user belongs to zero or multiple workspaces, if that's possible under BrandOS's actual auth model (confirm via `@brandos/auth`'s schema before assuming 1:1).
- Dependencies: E2-2-T1, E2-0'-T1 (needs IOS's published types resolvable for the interface to typecheck against — this task itself never imports IOS source, only BrandOS's own auth/runtime, confirming the original "needs E2-0" dependency was spurious per `ARCHITECTURE_REVIEW_E2-0.md` Step 4).
- Complexity: M (was S in the roadmap; bumped for the added lookup)
- Testing: unit test with a mocked `IBrandIntelligenceRuntime` and a mocked `@brandos/auth` lookup — confirm the right `workspaceId` reaches `runtime.review()`.

**E2-3-T2 — `translateContextToBlueprint()`**
- Package: `@brandos/control-plane-layer`
- Files: `packages/control-plane-layer/src/intelligence/BrandOSLegacyIntelligenceProvider.ts` (or a co-located helper file)
- Change: map `IBrandCognitionContext` → the (now-reconciled) `ArtifactBlueprintResult`. Set `degraded: !context.hasSubstantialIdentity` as a reasonable default (the legacy context's own `hasSubstantialIdentity` flag is the closest existing analog to the new `degraded` field). Map `context.styleProjection`'s Class A/B fields into `voiceDirectives`/`vocabularyDirectives` as best as the shapes allow given E2-1's reconciliation.
- Dependencies: E2-1-T1/T2, E2-3-T1.
- Complexity: L
- Testing: **snapshot regression tests** (explicitly required by the roadmap's own risk section) using representative production-like `IBrandCognitionContext` fixtures — this is the single highest-value test in Epic 2 per the roadmap's own risk assessment; do not skip or under-scope it.

**E2-3-T3 — `translateLegacySummary()`**
- Package: `@brandos/control-plane-layer`
- Files: same file as T2
- Change: map BrandOS's real, flat `{preferredTone, audience, industry, positioning, keywords}` to `IntelligenceSummary`'s richer shape, per the explicit field mapping decided in the Epic Validation finding (compositeConfidence/archetypePrimary/archetypeConfidence/activeLearningsCount default to 0/null/null/0; degraded hardcoded true; voiceSummary derived from `{preferredTone, audience, industry}`).
- Dependencies: E2-1-T2 (final `IntelligenceSummary` shape, promoted in E1-3-T3).
- Complexity: S
- Testing: unit test with representative legacy summary inputs, confirming the documented default mapping.

### Feature E2-4 — `IntelligenceOSProvider` (IOS-side adapter) *(roadmap: 0.5 sprints)*

**E2-4-T1 — Implement the adapter class**
- Package: `@brandos/intelligence-os`
- Files: new file `packages/intelligence-os/src/compat/IntelligenceOSProvider.ts`, plus an export added to `packages/intelligence-os/src/index.ts`
- Change: exactly as roadmap-specified — this class's design holds up well against the real `IntelligenceOS.ts` surface (confirmed: all six required methods, including the two Epic-1 additions, map cleanly 1:1). Import only from `@brandos/shared-intelligence-types` and `../IntelligenceOS`/`../events/IntelligenceEventBus` — no `@brandos/contracts` import, preserving `RULE-IOS-ISOLATION`. **Corrected (per `ARCHITECTURE_REVIEW_E2-0.md`):** export `IntelligenceOSProvider` from this package's public `index.ts`, the same way `InProcessEventBus` already is, so BrandOS consumes it via `import { IntelligenceOSProvider } from '@brandos/intelligence-os'` against a published version — an ordinary library import, not a workspace-relative path assuming co-location.
- Dependencies: E1-1 (reviewLearning), E1-3 (getBrandSummary), E2-0'-T2 (final shared types, reconciled via design review), E2-0'-T1 (the IOS package itself must be published/installable for BrandOS to depend on this export at all).
- Complexity: M
- Testing: integration tests against the test Supabase project — `buildBlueprint()` returns a valid result; `reviewLearning()`/`getBrandSummary()` delegate correctly. Add one cross-repo smoke test in BrandOS's own test suite: install the published IOS package, import `IntelligenceOSProvider`, confirm it satisfies `IIntelligenceProvider`'s structural type.

**E2-4-T2 — `RULE-IOS-ISOLATION` enforcement**
- Package: BrandOS tooling
- Files: `scripts/check-boundaries.mjs`
- Change: add `checkIosIsolationRule()`, modeled on `checkCplBiRule()`'s allowlist pattern (RULE-3) but inverted — instead of an allowlist of permitted symbols from one package, this scans `packages/intelligence-os/src` for any `@brandos/*` import that isn't `@brandos/shared-intelligence-types`, and flags it.
- Dependencies: E2-0'-T3.
- Complexity: S
- Testing: passes against current IOS source (should already be clean, confirmed by the real `package.json` dependency list reviewed during validation); fails against a deliberately-injected bad import.

### Feature E2-5 — CPL Provider Wiring *(roadmap: 0.5 sprints; corrected target — orchestrator's direct calls, not the proxy file)*

**E2-5-T1 — `CPLOrchestrator` constructor and `orchestrate()` rewiring**
- Package: `@brandos/control-plane-layer`
- Files: `packages/control-plane-layer/src/orchestrator.ts`
- Change: constructor parameter changes from `brandIntelligence?: IBrandCognitionRuntime` to `intelligenceProvider?: IIntelligenceProvider` (defaulting to a `BrandOSLegacyIntelligenceProvider`-wrapped `getGlobalBrandIntelligenceRuntime()` for backward compatibility — preserves every existing call site that constructs `new CPLOrchestrator()` with no arguments). Line 47-53's direct `this.brandIntelligence.resolve({...})` call becomes `this.intelligenceProvider.buildBlueprint({...})` (note: the request-shape mapping from `IBrandCognitionRequest`'s fields to `IntelligenceBlueprintRequest`'s fields needs to happen here — `workspaceId`/`personaId`/`persona`/`brandContext`/`taskType` → `userId`/`workspaceId`/`projectId`/`artifactType`/`audienceRef`/`personaId`; note `userId` is not present on the current call's inputs at all and needs to be sourced from `request.userId` on `GenerationRequest`, confirmed to exist per the Wave 1A `userId`/`workspaceId` distinction noted in the file's own comments). Line 91-99's direct `this.brandIntelligence.recordArtifactObservation({...})` becomes `this.intelligenceProvider.recordFeedbackEvent({...})`, with a similar field-mapping step from `IArtifactObservationRequest`'s shape to `IntelligenceFeedbackEvent`'s shape (`artifactScore` → no direct analog in `IntelligenceFeedbackEvent`, which uses a categorical `eventType` instead of a numeric score — this needs a translation: e.g., map `governanceScore >= some threshold` to `'accepted'`, below to `'rejected'`, with `'edited'`/`'deployed'`/`'explicit_feedback'` having no current BrandOS source signal at all and defaulting to unused until a real signal exists for them).
- Dependencies: E2-2-T1, E2-3-T1/T2 (legacy provider must exist to be the default), E2-1-T3 (artifact-type mapping needs to be resolved for the `artifactType` field).
- Complexity: L (was S/M in the roadmap, given the request/event field-mapping work uncovered above)
- Testing: full `orchestrator.test.ts` regression suite, plus new cases specifically constructing `CPLOrchestrator` with an explicit `BrandOSLegacyIntelligenceProvider` and asserting identical output to the pre-change direct-call path (the "no behavior change" claim needs to be a tested assertion, not just an architectural intention).

**E2-5-T2 — `IdentityContributor` rewrite (not just a union-type widen)**
- Package: `@brandos/output-control-layer`
- Files: `packages/output-control-layer/src/contract-assembler/contributors/IdentityContributor.ts`
- Change: per the Epic Validation finding, this is a method body rewrite: remove the `context.brandIntelligenceRuntime.resolveIdentityContribution({...})` delegation; replace with direct field reads from `context.brandIntelligence` when it's shaped like the new blueprint (`voiceDirectives`, `vocabularyDirectives`, `audienceCalibration`), falling back to the existing delegation path when it's shaped like the legacy `IBrandCognitionContext` (detect via a type guard — e.g., presence of `styleProjection` vs. presence of `voiceDirectives`). Both branches must produce an `IIdentityContribution` with equivalent semantics.
- Dependencies: E2-1 (final blueprint shape), E2-5-T1 (orchestrator must be passing the new shape through `context.brandIntelligence` for this to have anything to read).
- Complexity: L
- Testing: the regression test called out in the Epic Validation finding — same underlying brand data through both code paths (legacy delegation vs. new direct read) must produce equivalent `IIdentityContribution` output. This is the highest-priority test in all of Epic 2.

### Feature E2-6 — Boundary Rule Additions *(roadmap: 0.25 sprints; corrected file targets)*

**E2-6-T1 — `check-boundaries.mjs` additions**
- Package: BrandOS tooling
- Files: `scripts/check-boundaries.mjs`
- Change: `RULE-IOS-ISOLATION` (E2-4-T2, may already be done by this point — confirm no duplicate work), `RULE-SIT-ISOLATION` (E2-1-T5, likewise), and **new** `RULE-IOS-OCL-NONE` — modeled directly on the existing `checkOclBiRule()` (RULE-2), parameterized for `@brandos/intelligence-os` instead of `@brandos/brand-intelligence`.
- Dependencies: E2-0'-T3, E2-1-T5, E2-4-T2.
- Complexity: S (mostly consolidation if T5/T2 already landed the first two rules)
- Testing: all three pass with zero violations against the current merged tree.

**E2-6-T2 — `check-route-boundaries.mjs` / `FORBIDDEN_IN_ROUTES` addition**
- Package: BrandOS tooling
- Files: `scripts/shared/package-registry.mjs` (the `FORBIDDEN_IN_ROUTES` array — currently 6 entries, confirmed), not `check-boundaries.mjs`
- Change: add `'@brandos/intelligence-os'` as a 7th entry. This is the corrected home for `RULE-IOS-CPL-ONLY`, per the Epic Validation finding — it is enforced by `check-route-boundaries.mjs`, a separate script from `check-boundaries.mjs`.
- Dependencies: E2-0'-T1 (package must be installable for the route scanner to meaningfully check against a real dependency, though the array edit itself has no hard dependency).
- Complexity: S
- Testing: run `node scripts/check-route-boundaries.mjs` against current `apps/web/app/api/` — should pass (no route currently imports IOS, since BrandOS doesn't yet depend on the published package); add a temporary test fixture route with a bad import to confirm the check actually fires before removing the fixture.

---

## EPIC 3 — BrandOS Adoption

### Feature E3-M1 — Feature Flag & Dual-Write *(roadmap: part of 4–6 sprint total)*

**E3-M1-T1 — `workspace_settings.intelligence_provider` migration**
- Package: BrandOS database
- Files: new SQL migration (follow existing BrandOS migration file convention/location — not located during this review; confirm path before authoring)
- Change: exactly as roadmap-specified — `ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS intelligence_provider TEXT DEFAULT 'legacy' CHECK (intelligence_provider IN ('legacy','shadow','ios'));`. No correction needed; this table is correctly UUID-keyed and FK-backed.
- Dependencies: Epic 2 fully exited.
- Complexity: S
- Testing: migration applies cleanly; default value confirmed `'legacy'` for all existing rows post-migration.

**E3-M1-T2 — `IntelligenceOSProvider` instantiation/factory in CPL**
- Package: `@brandos/control-plane-layer`
- Files: new file `packages/control-plane-layer/src/intelligence/IntelligenceOSProvider.ts` (note: distinct from the IOS-repo-side `compat/IntelligenceOSProvider.ts` built in E2-4 — this BrandOS-side file is the factory/wiring glue, not a re-implementation)
- Change: construct an `IntelligenceOS` instance reusing the existing Supabase service-role admin client already built in `apps/web/instrumentation.ts` for `SupabaseBrandSignalRepository` (per the Epic Validation nuance — don't build a second admin client), wrap it in the IOS-side `IntelligenceOSProvider` adapter from E2-4-T1.
- Dependencies: E2-4-T1, E2-0'-T1 (the published IOS package this factory installs and wires up).
- Complexity: M
- Testing: instantiates cleanly in a test harness against the test Supabase project; smoke-test `buildBlueprint()` round trip.

**E3-M1-T3 — Provider selection + dual-write in `orchestrator.ts`**
- Package: `@brandos/control-plane-layer`
- Files: `packages/control-plane-layer/src/orchestrator.ts`
- Change: read `workspaceSettings.intelligence_provider` (needs a new read from `@brandos/auth`/workspace settings at the top of `orchestrate()` — confirm this doesn't introduce a redundant DB round-trip if workspace settings are already fetched elsewhere in the request path; check `resolveWorkspaceSettings()`, confirmed to exist in CPL's public exports, as a likely existing source rather than adding a second query). Select provider; for `'legacy'`, additionally fire-and-forget `this.iosProvider?.recordFeedbackEvent(...)` for dual-write seeding, exactly at the call site identified in the E2-5-T1 correction (replacing the single dispatch with a dual one when a flag and provider are both present).
- Dependencies: E3-M1-T2, E2-5-T1.
- Complexity: M
- Testing: flag defaults to `'legacy'` → behavior unchanged (regression-test against E2-5-T1's "no behavior change" baseline); dual-write fires and is non-blocking (test with a deliberately-failing mock `iosProvider` and confirm the main response path is unaffected and the failure is logged).

~~**E3-M1-T4 — Wire the deferred E1-4 VLM bridge end-to-end**~~ — **removed (post-dates this guide).** Per E1-4's corrected design (Epic Validation §1.1, Implementation Backlog E1-4-T1/T2), visual feature extraction is entirely IOS-side Knowledge Pipeline work with no BrandOS leg to wire — there is nothing left for this task to do. If a task ID is needed downstream for tracking purposes, mark `E3-M1-T4` as void rather than reassigning the number, to avoid confusing anyone who referenced it before this correction.

**E3-M1-T5 — Monitoring: dual-write error rate**
- Package: `@brandos/control-plane-layer` (or wherever existing telemetry hooks live — `src/telemetry/`, confirmed to exist with both `enterprise.ts` and `persistent-telemetry.ts`)
- Files: `packages/control-plane-layer/src/telemetry/`
- Change: log dual-write failures with workspace ID and timestamp, per roadmap acceptance criteria. Use whichever existing telemetry service (`globalPersistentTelemetry` or `globalEnterpriseTelemetry`, both confirmed exported) is the right fit rather than building a new logging path from scratch.
- Dependencies: E3-M1-T3.
- Complexity: S
- Testing: forced-failure test confirms a telemetry record is created with workspace ID and timestamp.

### Feature E3-M2 — Shadow Mode & Parity Validation

**E3-M2-T0 — Design decision: parity metric** *(blocking, per Epic Validation finding)*
- Package: n/a (decision record)
- Change: choose structural blueprint comparison (recommended) over dual-generation-and-score comparison as the primary, always-on parity signal; define the specific structural metric (e.g., field-presence completeness, voice-directive non-emptiness, section-count reasonableness) since "≥95% parity" needs an actual formula. Layer in a small-percentage (e.g., 1%) dual-generation spot-check sample for periodic governance-score ground-truthing.
- Dependencies: E3-M1 complete.
- Complexity: M (decision + formula design)
- Testing: n/a.

**E3-M2-T1 — Shadow-mode provider dispatch**
- Package: `@brandos/control-plane-layer`
- Files: `packages/control-plane-layer/src/orchestrator.ts`
- Change: `'shadow'` flag value triggers `Promise.allSettled([legacyProvider.buildBlueprint(...), iosProvider.buildBlueprint(...)])`, uses legacy output for actual generation, logs IOS output via the new comparison metric from T0.
- Dependencies: E3-M2-T0, E3-M1-T3.
- Complexity: M
- Testing: both providers are called; legacy output is what reaches the LLM; IOS failure in shadow mode doesn't affect the response.

**E3-M2-T2 — Telemetry/comparison logging + dashboard**
- Package: `@brandos/control-plane-layer` + dashboard surface (location not present in reviewed source — likely a new admin UI page or external dashboard tool; flag as needing a decision)
- Files: telemetry service files, new dashboard page (TBD)
- Change: per-workspace structural-parity score distribution, P95 latency for both providers, IOS error rate, parity score percentage — per roadmap's monitoring requirements list, computed against T0's actual metric.
- Dependencies: E3-M2-T0, E3-M2-T1.
- Complexity: L
- Testing: dashboard reflects real shadow-mode data from a test run; alert thresholds (if any) fire correctly on synthetic bad data.

### Feature E3-M3 — Progressive Rollout

**E3-M3-T1 — Rollback trigger automation**
- Package: `@brandos/control-plane-layer` (or ops tooling)
- Files: TBD — likely a scheduled job or webhook-driven check against telemetry
- Change: automatic flag flip to `'legacy'` per workspace when governance score drops >3% or error rate increases >0.5%, per roadmap spec.
- Dependencies: E3-M2-T2 (needs the monitoring data this reads).
- Complexity: M
- Testing: synthetic bad-data scenario triggers the automated rollback; manual operator rollback (`UPDATE workspace_settings SET intelligence_provider = 'legacy' WHERE workspace_id = ...`) is confirmed sufficient with no code deploy, as claimed.

**E3-M3-T2 — Rollout sequencing operations**
- Package: ops/config, not code
- Change: execute the 5-stage rollout sequence (internal → 10% → 25% → 50% → 100%) via the workspace flag, per roadmap timeline.
- Dependencies: E3-M3-T1.
- Complexity: n/a (operational, not engineering complexity in the usual sense)
- Testing: each stage's exit telemetry reviewed before advancing.

### Feature E3-M4 — Retirement

**E3-M4-T1 — Data migration: row-identity resolution design** *(blocking, per Epic Validation finding)*
- Package: n/a (decision record)
- Change: decide the `user_id` attribution rule for migrating orphaned, workspace-only `brand_memory_entries`/`identity_signals` rows (which have no original user attribution) into `intelligence.learnings` (which requires `user_id NOT NULL`). Recommended: attribute to `workspaces.owner_id`. Also decide the TEXT→UUID workspace-id translation mechanism (per the E1-2 finding) — likely a manual or scripted lookup against `workspaces.id`/`workspaces.slug` since no FK or shared key exists today between the BI tables' TEXT ids and the real `workspaces` table.
- Dependencies: none structurally, but should happen well before this milestone starts (it's a data question, not a code question, and benefits from early resolution).
- Complexity: M (decision), feeds into T2's complexity.
- Testing: n/a.

**E3-M4-T2 — Migration script**
- Package: BrandOS database tooling
- Files: new migration/script
- Change: per roadmap's classification mapping (A→permanent/VALIDATED, B→long_term, C/D/E→medium_term — **note: collapse this to the corrected A/B/C source enum from E1-5, there is no D/E to map from**), using T1's identity-resolution rule.
- Dependencies: E3-M4-T1, E1-5-T1 (corrected enum).
- Complexity: L
- Testing: dry run against a staging copy of production-shaped data; row counts reconcile before/after; spot-check a sample of migrated rows for correct `user_id`/`workspace_id` attribution.

**E3-M4-T3 — Package and rule removal**
- Package: BrandOS monorepo
- Files: per roadmap's list — `packages/brand-intelligence/` (delete), `BrandOSLegacyIntelligenceProvider.ts` (delete), legacy CPL proxy functions, `orchestrator.ts` (remove legacy path/flag check), `IdentityContributor.ts` (collapse union), `contracts/src/index.ts` (remove BI types after consumer check), `check-boundaries.mjs` (remove RULE-3/6/7), `apps/web/instrumentation.ts` (remove BI boot step — including the concrete `SupabaseBrandSignalRepository` import flagged in the Epic Validation finding), `package.json` files (remove BI dependency).
- Dependencies: E3-M3 exit criteria met, E3-M4-T2 (data safely migrated first).
- Complexity: L
- Testing: full regression suite; `pnpm build` succeeds; `check-boundaries.mjs` passes with RULE-3/6/7 absent and RULE-IOS-* present; confirm zero remaining references to `@brandos/brand-intelligence` anywhere in the tree (`grep -r` sweep, not just package.json).
# 3. Task Dependency Graph

## 3.1 Critical Path

The longest dependency chain end-to-end, anchoring the overall schedule:

```
E2-0'-T1 (publish shared-intelligence-types)
  → E2-0'-T2 (field reconciliation design review)
    → E2-1-T1 (extend ArtifactBlueprint: degraded/confidenceScore/buildDurationMs)
      → E2-1-T2 (contracts-side alias types)
        → E2-2-T1 (IIntelligenceProvider interface)
          → E2-3-T1 (legacy provider + workspaceId lookup)
            → E2-3-T2 (translateContextToBlueprint + snapshot tests)
              → E2-5-T1 (orchestrator rewiring + request/event field mapping)
                → E2-5-T2 (IdentityContributor rewrite + dual-path regression test)
                  → E3-M1-T2 (IntelligenceOSProvider factory in CPL)
                    → E3-M1-T3 (provider selection + dual-write)
                      → E3-M2-T0 (parity metric decision)
                        → E3-M2-T1 (shadow dispatch)
                          → E3-M2-T2 (telemetry/dashboard)
                            → E3-M3-T1 (rollback automation)
                              → E3-M3-T2 (rollout stages)
                                → E3-M4-T1 (migration identity design)
                                  → E3-M4-T2 (migration script)
                                    → E3-M4-T3 (retirement)
```

> **Correction (post-dates this guide's original version):** the chain above no longer opens with the `E2-0-T1 → E2-0-T2 → E2-0-T3` repository-merge sequence. `ARCHITECTURE_REVIEW_E2-0.md` found that sequence traced to an implementation assumption (a file-placement choice implying workspace-relative imports, and a boundary-checker treated as fixed rather than swappable), not to an architectural requirement — see Epic Validation §1.2's corrected finding. `E2-0'-T1`/`E2-0'-T2` (publish the contract package; reconcile field shapes via design review) replace that three-task serial chain and are each smaller and less risky than the merge tasks they replace — `E2-0'-T3` (the boundary-checker fix) is **not** on the critical path at all, since nothing downstream needs it to complete before proceeding (it can run fully in parallel — see §3.2). This shortens the program's critical path by removing what was previously its longest and riskiest opening segment (an `L`-complexity repository merge with a real lockfile/version-conflict risk) and replacing it with two `S`-complexity tasks (publish a package; run a design review) that carry comparatively little risk.

This is now a **long, mostly-serial chain through Epic 2's E2-1/E2-3/E2-5** — these three tasks are the actual bottleneck of the entire program, not Epic 1 (which the roadmap correctly identifies as highly parallelizable), not the now-much-lighter contract-distribution setup, and not Epic 3's later milestones (which are mostly sequential by design — shadow mode has to precede rollout, rollout has to precede retirement — but each individual milestone is short once unblocked).

E1-2 (workspace-scoped brand voice) is **not** on the critical path to Epic 2/3 — nothing in Epic 2 or 3 depends on workspace-scoped learnings existing. It can run fully in parallel with the rest of Epic 1 and even slip into early Epic 2 without blocking anything, which is useful slack if E1-2-T2's schema-constraint complication (flagged in the backlog) takes longer than expected.

## 3.2 Parallelizable Work

**Within Epic 1** (confirmed: each Feature touches disjoint files within `packages/intelligence-os/`; under E1-4's corrected design it touches only `knowledge/` and `db/schema.sql`, so the only remaining shared-file sequencing concern in Epic 1 is `events.ts` between E1-1-T1 and E1-1's own event addition — E1-4 no longer shares a file with any other Epic 1 feature):
- E1-1, E1-2, E1-3, E1-4, E1-5 can all start simultaneously on day one of Epic 1. A team of 3-4 engineers could run all five features concurrently.
- Within E1-2 specifically, T0 (design decision) blocks T1/T2/T3, but T1 (index migration) has no dependency on T0's outcome in practice (the index is correct either way) and could be written immediately in parallel with the T0 discussion, merged once T0 resolves.
- E1-5-T1 and E1-5-T2 (calibration) run in parallel by design.
- E1-H1 and E1-H2 (housekeeping) have no dependencies on anything and can be picked up by whoever has spare capacity at any point in Epic 1.
- **E2-0'-T1 (publish the contract package) and E2-0'-T3 (fix the boundary checker) have no dependency on Epic 1 finishing and can start on day one, in parallel with all of Epic 1** — this is the most consequential parallelism opened up by the corrected E2-0' design: under the original merge-based E2-0, nothing in Epic 2 could start until the merge completed; under E2-0', two of its three tasks can run from day one of the entire program.

**Within Epic 2**, parallelism opens up much earlier than under the original design — there is no single all-blocking merge gate:
- E2-0'-T1 and E2-0'-T3 can both start immediately (see above). E2-0'-T2 (the design review) depends only on E2-0'-T1 having published a version both teams can look at.
- Once E2-0'-T2 lands: E2-1-T1/T2/T4 (type reconciliation) and E2-1-T3 (artifact-type spike) can run in parallel with each other.
- E2-1-T5 and E2-4-T2 and E2-6-T1 (the three `check-boundaries.mjs` rule additions) are independent of each other in content but share one file — sequence as a single small PR train rather than three concurrent branches to avoid merge conflicts, even though there's no logical dependency between them.
- E2-4-T1 (IOS-side adapter) can be built in parallel with E2-3-T1/T2 (BrandOS-side legacy adapter) — different packages, different teams, same target interface (E2-2-T1), no file overlap, and (per the corrected design) no shared workspace required either.
- E2-6-T2 (route boundary rule) has no real dependency on anything except the package being installable (E2-0'-T1) — it could land very early in Epic 2, in parallel with everything else, rather than waiting for E2-6-T1.

**Within Epic 3**: M1's five tasks have internal sequencing (T2 before T3 before T4) but T5 (monitoring) can be built in parallel with T3/T4 since it only needs the telemetry call site to exist, not the full feature. M2's T0 (parity metric design) should ideally start *during* Epic 2, not after — it has no code dependency on Epic 2's completion, only a conceptual one (you need to know what a blueprint looks like to design a comparison metric for it), and starting it early removes it from M2's critical path entirely.

## 3.3 Blocking / Gating Relationships (non-obvious ones)

- ~~**E2-0 blocks all of Epic 2 and therefore all of Epic 3.**~~ **Corrected (post-dates this guide):** this was the single most consequential scheduling claim in the original version of this guide, and it does not survive `ARCHITECTURE_REVIEW_E2-0.md`'s task-by-task review — no Epic 2 task genuinely requires a repository merge (see Epic Validation §1.2's corrected finding and §2 Epic 2's revised backlog). The replacement fact: **E2-0'-T2 (field-shape design review) is the only piece of contract-distribution setup with real downstream dependents, and it unblocks as soon as E2-0'-T1 publishes a version — typically a matter of days, not a dedicated go/no-go-gated sprint.** Recommend folding E2-0' into the start of Epic 2's first sprint rather than holding it out as its own milestone.
- **E1-2-T2's potential schema change** (if `intelligence.learnings.user_id NOT NULL` truly can't accommodate workspace-only learnings without a migration) could quietly turn a 1–1.5 sprint Feature into something closer to 2.5 sprints. This should be resolved (even if not fully built) before Epic 1 sprint capacity is committed, since it's the one Epic 1 unknown with real schedule risk — flagged as `E1-2-T0`'s direct responsibility to surface, not discover mid-sprint.
- **E2-5-T2 (IdentityContributor) is gated on E2-5-T1's orchestrator change actually delivering the new context shape** — these two were originally scoped as independent-ish tasks in the roadmap but are now confirmed tightly coupled: T2 has nothing to read until T1 ships the new `context.brandIntelligence` shape through the contract assembler. Sequence them as one continuous unit of work with one engineer (or a tightly paired pair) rather than splitting across two people who might drift on the exact intermediate shape.
- **E3-M2-T0 gates E3-M2-T1 and T2 entirely** — do not let shadow-mode engineering start before the parity metric is actually defined; building the dispatch logic first and bolting on a metric definition afterward is how the roadmap's original ambiguity (structural comparison vs. dual-generation-and-score) would silently get resolved by whoever happens to write the code first, rather than by a deliberate decision.
- **E3-M4-T1 (migration identity design) has no hard code dependency but real schedule risk if deferred.** It only needs to be *resolved*, not *built*, well before E3-M4 starts — recommend tackling it during Epic 3's M1 or M2 window, in parallel with unrelated work, purely as a decision-making exercise, so it's not a surprise blocking item when the retirement milestone actually opens.

## 3.4 Optional / Deferrable Work

- **E1-2 (workspace-scoped brand voice)** in its entirety is the most deferrable Feature in Epic 1 — nothing downstream needs it to ship Epic 2 or to begin Epic 3's shadow mode. If schedule pressure hits Epic 1, this is the Feature to slip into a later sprint without blocking the rest of the program.
~~**E1-4-T3's "end-to-end wiring"**~~ — removed; under the corrected E1-4 design there is no deferred BrandOS-side leg, so this is no longer a deferrable-work item (see §1.1, §2 Epic 1).
- **E3-M2-T2's dashboard surface** — the underlying telemetry logging (T1) is not optional, but a polished dashboard UI is more deferrable than the data collection itself; a team under time pressure could ship M2 with raw telemetry queries/exports standing in for a dashboard, and build the dashboard surface later without re-doing any data-collection work.
- **E1-5-T2 (threshold calibration)** could in principle ship with placeholder thresholds and be recalibrated post-launch, since it currently has zero consumers until Epic 3's migration — but recommend not deferring this past Epic 1, since recalibrating after `toLegacyClassification()` has been relied upon elsewhere is more disruptive than getting it right once, up front, while it's still isolated.
- **E2-1-T3 (ArtifactType spike)** — if the spike's finding is "fallback behavior is fine," this entire line of investigation becomes a documentation-only deliverable with no further code work, making it one of the cheaper-to-defer items if capacity is tight in early Epic 2 (the actual generation behavior for BrandOS task types doesn't change until Epic 3 routes real traffic through IOS anyway, so a few days' delay in resolving the spike doesn't block anything immediate).

---

# 4. Repository Impact Analysis

## 4.1 Packages Modified, by Epic

| Epic | BrandOS packages touched | IntelligenceOS packages touched |
|---|---|---|
| 1 | *(none)* | `@brandos/intelligence-os`, `@brandos/shared-intelligence-types` |
| 2 | `@brandos/contracts`, `@brandos/control-plane-layer`, `@brandos/output-control-layer`, repo root (`package.json`, `pnpm-workspace.yaml`/`workspaces` field), `scripts/` (tooling) | `@brandos/intelligence-os` (new `compat/` module), `@brandos/shared-intelligence-types` |
| 3 | `@brandos/control-plane-layer`, `apps/web` (one route + `instrumentation.ts`), database (migrations), `@brandos/brand-intelligence` (deleted at M4), `@brandos/contracts` (BI types removed at M4), `scripts/` | `@brandos/intelligence-os` (consumed, not modified, after E2-4) |

## 4.2 Public Interfaces Modified

| Interface | Change | Epic | Breaking? |
|---|---|---|---|
| `IntelligenceOS` (class) | +2 public methods (`reviewLearning`, `getBrandSummary`) | 1 | No — additive |
| `IntelligenceEventType` (union) | 14 → 16 literal values | 1 | No — additive, but any exhaustive `switch` on this type elsewhere in IOS will need a new case (TypeScript will flag these at compile time, which is the intended safety net) |
| `WorkspaceIntelligenceDomain` | +2 methods | 1 | No — additive |
| `UserIntelligenceDomain` | +3 methods | 1 | No — additive |
| `ArtifactBlueprint` | +3 fields (`degraded`, `confidenceScore`, `buildDurationMs`) | 2 | No — additive, but **is** a behavior change to `BlueprintBuilder.build()`'s internals (must now track per-fetch failure) |
| `NarrativePlanner.plan()` | +1 parameter (`workspaceLearnings`) | 1 | **Yes, technically** — adds a required parameter to an existing method signature; every existing call site (just `BlueprintBuilder.build()`, confirmed to be the only caller) must be updated in the same change |
| `CPLOrchestrator` constructor | `brandIntelligence?: IBrandCognitionRuntime` → `intelligenceProvider?: IIntelligenceProvider` | 2 | **Yes** — parameter type changes; needs a default-value bridge (instantiate `BrandOSLegacyIntelligenceProvider` internally) so zero-arg call sites keep working, but any call site that explicitly passes a `brandIntelligence` instance today breaks and must be updated to pass a wrapped provider instead |
| `IdentityContributor.contribute()` | Internal rewrite (delegation → direct read + legacy fallback) | 2 | No — external signature unchanged, internal behavior change only, mitigated by the dual-path regression test |
| `@brandos/contracts` exports | + `IIntelligenceProvider`, `IntelligenceBlueprintRequest`, `ArtifactBlueprintResult`, `IntelligenceFeedbackEvent`, `IntelligenceSummary` (aliased from `@brandos/shared-intelligence-types` where applicable) | 2 | No — additive |
| `@brandos/contracts` exports (BI types) | Removed (`IBrandCognitionContext`, `SignalClassification`, etc.) | 3 (M4) | **Yes, by design** — this is the intended end-state breaking change, gated behind full migration completion |
| `IBrandIntelligenceRuntime.review()` | Unchanged | — | Confirmed not modified anywhere in this plan — `BrandOSLegacyIntelligenceProvider` calls it with a resolved `workspaceId`, but the method itself is untouched |

## 4.3 Database Migrations

| Migration | Table | Epic | Risk |
|---|---|---|---|
| `CREATE INDEX intelligence_learnings_workspace_domain` | `intelligence.learnings` | 1 | Low — additive index, no lock concerns at current data volumes implied by a Sprint 0–3 system |
| Possible `intelligence.learnings.user_id` nullability change | `intelligence.learnings` | 1 (pending E1-2-T0/T2 resolution) | **Medium** — changing a `NOT NULL REFERENCES` constraint on a live table needs a careful migration (add nullable, backfill, only then consider tightening) even though this system is pre-production; flagged for engineering review regardless of current data volume, since constraint changes are easy to get wrong even on empty tables if the change is later forgotten when data exists |
| `ALTER TABLE workspace_settings ADD COLUMN intelligence_provider` | `workspace_settings` | 3 (M1) | Low — additive, defaulted, FK-backed table |
| `brand_memory_entries`/`identity_signals` → `intelligence.learnings` data migration | Both systems | 3 (M4) | **High** — see Risk Review §5.4; no existing FK or shared key between the TEXT-keyed source tables and the UUID-keyed target schema; orphaned-row identity attribution has no clean automatic answer |
| `@brandos/brand-intelligence` table drops (`brand_memory_entries`, `identity_signals`, `identity_versions`) | Same | 3 (M4) | High — irreversible; must follow successful migration and a verified rollback window with zero observed need to roll back |

## 4.4 Tests Affected

| Area | Existing test files (confirmed to exist) | New coverage needed |
|---|---|---|
| CPL orchestration | `orchestrator.test.ts` (per CPL package context doc's test inventory) | New cases: explicit `BrandOSLegacyIntelligenceProvider` injection, dual-write, shadow-mode dispatch |
| OCL boundary enforcement | `packages/output-control-layer/tests/boundary/dependencyBoundary.test.ts` | Unaffected by E2-6 (that rule isn't changing) — but `IdentityContributor`'s existing unit tests need the new dual-path regression case |
| Boundary scripts | (script-level, no formal test file located for `check-boundaries.mjs`/`check-route-boundaries.mjs` themselves — confirm whether one exists before assuming none does) | New RULE-IOS-* assertions; confirm whether these scripts have their own meta-tests or are only exercised via CI invocation |
| IOS domains | Existing Vitest suites per domain class | New: `reviewLearning`, `getWorkspaceLearnings`/`upsertWorkspaceLearning`, `getBrandSummary`, `VisualFeatureExtractor` (corrected — extractor unit tests, not an event-handler test; see Appendix #11) |
| Blueprint construction | (test file not located in this review — confirm `BlueprintBuilder` has existing coverage before assuming a from-scratch suite is needed) | `degraded` flag correctness, `NarrativePlanner` precedence ordering |

## 4.5 Documentation Affected

- `CLAUDE_BOOTSTRAP.md` and all `.context/*.generated.*` files are **regenerated, not hand-edited** (per the bootstrap doc's own instructions: "Do not edit by hand — regenerated by `node scripts/generate-claude-bootstrap.mjs`"). Every Epic 2/3 task that changes a package's public surface, dependency graph, or boundary rules should trigger a regeneration pass before the next agent/engineer picks up work, per the bootstrap doc's own "Agent Workflow" step 7.
- Each touched package's `AGENT_CONTEXT.md` (the hand-written source the generator reads from) needs manual updates wherever this guide identifies a changed "Package Purpose," new exported symbol, or new architectural rule — particularly `@brandos/control-plane-layer`'s and `@brandos/output-control-layer`'s, given how much of Epic 2 lands in those two packages.
- `monorepo_context.generated.md`'s "Architectural Rules" section needs the four new RULE-IOS-*/RULE-SIT-* entries added to its source-of-truth list (wherever that hand-authored source lives — the generated file says rules are "selected automatically... from `monorepo_context.generated.md`," meaning that file itself has a hand-maintained rules section feeding the generator, not the reverse).
- IntelligenceOS's own internal doc comments (e.g., `IntelligenceOS.ts`'s "Public API surface (4 methods, fixed for all sprints)") need updating as part of E1-1-T4, not left stale.
- When E1-4 ships under its corrected design (Appendix #11), update `agent-context-files/intelligence-os-knowledge/AGENT_CONTEXT.md`'s `VisualFeatureExtractor` row from "planned, not yet built" to its real status, per that file's own stated maintenance convention (`AGENT_CONTEXT_INDEX.md`'s "Maintenance expectation" section) — this is routine upkeep, not a special visual-related step, but worth calling out here since it's the first time that file's placeholder row gets resolved.

## 4.6 Boundary Rules Affected

Summarized from Deliverable 1/2 above — see those sections for full detail:

| Rule | File | Status |
|---|---|---|
| `RULE-IOS-ISOLATION` | `scripts/check-boundaries.mjs` (new function) | New, Epic 2 |
| `RULE-SIT-ISOLATION` | `scripts/check-boundaries.mjs` (new function) | New, Epic 2 |
| `RULE-IOS-OCL-NONE` | `scripts/check-boundaries.mjs` (new function) | New, Epic 2 |
| `RULE-IOS-CPL-ONLY` | `scripts/shared/package-registry.mjs` (`FORBIDDEN_IN_ROUTES` array) | New, Epic 2 — **corrected file target** |
| `RULE-3` (CPL BI symbol allowlist) | `scripts/check-boundaries.mjs` | Removed, Epic 3 M4 |
| `RULE-6` (CPL ↛ concrete BI repos) | `scripts/check-boundaries.mjs` | Removed, Epic 3 M4 |
| `RULE-7` (CPL ↛ BIRuntime class) | `scripts/check-boundaries.mjs` | Removed, Epic 3 M4 |
| `RULE-OCL-GOVERNANCE-CONFIG` | `packages/output-control-layer/tests/boundary/dependencyBoundary.test.ts` | **Unaffected by this entire program** — already structurally satisfied (zero live imports), no task in this plan touches it; included here only to correct the roadmap's implicit assumption that all named rules live in `check-boundaries.mjs` |

---

# 5. Risk Review

## 5.1 Hidden Assumptions Surfaced During Validation

1. **Both source documents assumed a 5-value classification scheme that does not exist.** Root-caused in §1.1 (E1-5). This is the single most pervasive hidden assumption in the entire planning corpus — it appears in the adoption strategy's capability matrix, the roadmap's E1-5 worked example, and would have propagated silently into E3-M4's migration mapping if not caught here.
2. ~~**Both documents assumed IOS and BrandOS already share a monorepo.**~~ **Corrected (post-dates this guide; see Appendix #12 and `ARCHITECTURE_REVIEW_E2-0.md`).** Root-caused in §1.2 (originally E2-0). Every Epic 2 code sample in the strategy document implicitly assumes this; the corrected finding is that none of those code samples actually *needs* a merged workspace to work — they need a published contract package and a stable interface, both of which were already part of the plan. The merge itself was never a real requirement; it was an unexamined assumption baked into one file-path choice and one tool's current implementation.
3. **The roadmap assumed `degraded`/`confidenceScore`/`buildDurationMs` already exist on `ArtifactBlueprint`.** They don't. Epic 3's shadow-mode parity logic is the most affected downstream consumer.
4. **The roadmap assumed CPL's brand-memory proxy functions sit on the generation critical path.** They don't — `orchestrator.ts` calls the BI runtime directly. The proxy functions are real and used, but only by an admin review route and a summary route. This changes exactly which files E2-5/E3-M1 need to touch, without changing the overall approach.
5. **The roadmap assumed `IdentityContributor` does a simple field read off context.** It actually delegates back into the BI runtime mid-assembly (`resolveIdentityContribution()`). This is the single highest-risk hidden assumption for output quality, since it's the file most directly responsible for what brand-voice text reaches the model.
6. **Both documents assumed BrandOS's and IOS's workspace ID columns are type-compatible.** They aren't (TEXT vs. UUID), and the BI-side TEXT columns have no FK at all, meaning there's no existing referential path to lean on during data migration.

## 5.2 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `IdentityContributor` rewrite silently changes brand-voice output quality | Medium | High | Mandatory dual-path regression test (E2-5-T2) comparing legacy-delegation vs. new-direct-read output on identical underlying data, before merge — not after |
| `ArtifactType`/`TaskType` mismatch produces degraded structure plans for real BrandOS artifact types | Medium | Medium | E2-1-T3 spike resolves this before any real traffic reaches IOS's planners in Epic 3 |
| ~~Monorepo merge (E2-0) introduces a dependency-version conflict~~ — **removed (post-dates this guide; see Appendix #12).** No repository merge occurs under the corrected E2-0' design, so this risk no longer applies. A much smaller residual version-compatibility risk remains: BrandOS pins a specific `@brandos/shared-intelligence-types` version, and a future major bump needs the same ordinary dependency-upgrade care as any other library bump. | — | — | N/A under corrected design |
| ~~`check-boundaries.mjs`'s "unknown package" handling breaks CI the moment the merge lands~~ — **removed (post-dates this guide).** No merge event exists to trigger this. The genuine residual risk is narrower: `check-boundaries.mjs`'s dependency-declaration scan (E2-0'-T3) needs to correctly recognize a registry-resolved dependency on first encountering it. | Low | Low | E2-0'-T3's own testing step (run against a fixture declaring a non-workspace dependency) catches this before it reaches real CI |

## 5.3 Migration Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sentinel-user workspace bridge (original Phase A design) fails outright on a `NOT NULL` FK constraint | High (would have been caught at first write attempt) | Medium (caught here before any code was written) | E1-2-T0 drops the sentinel approach entirely in favor of a direct nullable-write design |
| `intelligence.learnings.user_id NOT NULL` blocks true workspace-only learnings | Medium | Medium | E1-2-T2 explicitly flags the possible schema change rather than assuming an application-layer workaround will suffice |
| E3-M4 data migration has no clean join key between TEXT-keyed BI tables and UUID-keyed `workspaces` | High | High | E3-M4-T1 forces an explicit identity-resolution design decision (recommended: attribute orphaned rows to `workspaces.owner_id`) before any migration script is written, plus a dry run against staging-shaped data before the real cutover |
| Migration is irreversible once source tables are dropped | Certain (by definition) | High | E3-M4-T3 sequenced strictly after a verified rollback-free observation window in M3; recommend keeping the source tables (renamed, not dropped) for one additional release cycle beyond the roadmap's own plan, as a cheap extra safety margin given how small the affected row count is expected to be (per the roadmap's own "LOW risk" reasoning in its risk section) |

## 5.4 Performance Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Shadow mode (E3-M2) doubles LLM/generation cost if naively implemented as dual-generation-and-score | High if the wrong metric is chosen | High (cost) | E3-M2-T0's structural-comparison-first design avoids this for the always-on path; dual-generation reserved for a small sample |
| `BlueprintBuilder.build()`'s new degraded-tracking logic adds overhead to the Promise.all fetch path | Low | Low | Tracking which `.catch()` fired is a cheap, synchronous bookkeeping change, not a new I/O call — confirm in code review that no new network round-trip is accidentally introduced |
| New `workspace_id` index (E1-2-T1) — write-path overhead on `intelligence.learnings` inserts | Low | Low | Single additional index on an already-indexed table; standard write-amplification tradeoff, not a novel risk |

## 5.5 Data Consistency Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dual-write (E3-M1) succeeds in legacy but fails in IOS (or vice versa), leaving the two systems' data silently diverged for a given workspace | Medium | Medium (mitigated by design — legacy remains source of truth until cutover) | E3-M1-T5's telemetry explicitly tracks dual-write failures per workspace; M2's parity check is itself a consistency cross-check before any workspace fully cuts over |
| `recordArtifactObservation`'s numeric `artifactScore` has no clean translation to `FeedbackEvent`'s categorical `eventType` (flagged in E2-5-T1) | High (this is a real, unresolved gap, not a hypothetical) | Medium | Define and document the score→category threshold explicitly as part of E2-5-T1, and treat `'edited'`/`'deployed'`/`'explicit_feedback'` as legitimately unreachable from the legacy path until a real BrandOS signal exists for them — don't fabricate a mapping that implies more signal fidelity than actually exists |

## 5.6 Testing Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| "No behavior change" claims (Epic 2 exit criteria, E2-5-T1) are asserted but not actually tested against the pre-change baseline | Medium | High | Explicit requirement (not a suggestion) that E2-5-T1's test suite include before/after comparison cases, not just forward-looking new-path tests |
| Snapshot tests for `translateContextToBlueprint()` (E2-3-T2) become stale/rubber-stamped over time as the underlying data drifts | Medium | Medium | Treat snapshot failures as a required-investigation gate in CI, not an auto-accept; review snapshot diffs in code review explicitly, not just diff-tool auto-approval |
| Calibration thresholds in E1-5-T2 are accepted without real production-distribution data if access isn't available in time | Medium | Low–Medium (consumer doesn't exist until Epic 3, so there's runway to fix later if needed) | Explicitly track this as a "revisit before E3-M4" checklist item rather than assuming it's permanently settled once Epic 1 closes |

---

# 6. Sprint Organization

## 6.1 Workstreams by Engineering Team

Reorganized from the roadmap's document-section structure (Epic 1/2/3) into the team structure requested, with explicit cross-team handoff points called out.

### Intelligence Domain team
*Owns the user/project/archetype-facing logic inside IntelligenceOS.*
- E1-1 (Human Learning Review API) — full feature.
- E1-3 (Brand Summary Query API) — full feature.
- E1-5 (Classification compatibility mapping) — full feature.
- E2-1-T1 (extend `ArtifactBlueprint` with `degraded`/`confidenceScore`/`buildDurationMs`) — this team owns `BlueprintBuilder.build()`.

### Knowledge Domain team
*Owns workspace/knowledge-asset-facing logic and visual feature extraction.*
- E1-2 (Workspace-Scoped Brand Voice) — full feature, including the T0 design decision.
- E1-4 (VLM Visual Intelligence Bridge) — full feature under the corrected design (T1, T2); no longer split across epics, since there's no BrandOS-side portion to hand off.
- E1-H1 (type duplication cleanup, since it touches `KnowledgeAssetInput`/`ProjectInput`, this team's existing surface).

### Blueprint Pipeline team
*Owns `BlueprintBuilder`, `NarrativePlanner`, `StructurePlanner`, and the contract-assembler-facing translation layer in BrandOS.*
- E1-2-T3 (NarrativePlanner workspace voice layer) — joint with Knowledge Domain team given the cross-cutting dependency; recommend Blueprint Pipeline owns the `NarrativePlanner` code change while Knowledge Domain owns the `WorkspaceIntelligenceDomain` data access it depends on.
- E2-1-T3 (ArtifactType/TaskType spike).
- E2-3-T2 (`translateContextToBlueprint`) — this is fundamentally a blueprint-shape translation task.
- E2-5-T2 (`IdentityContributor` rewrite) — highest-risk single task in the program; staff this team's most senior engineer here, paired with someone from Contracts team for the type-shape side.

### Data Layer team
*Owns schema, migrations, indexes, and the eventual retirement migration.*
- E1-2-T1 (workspace index migration).
- ~~E2-0-T2's lockfile/dependency-conflict reconciliation~~ — **removed (post-dates this guide).** No merge occurs under the corrected E2-0' design; this team has no contract-distribution-setup work to own.
- E3-M1-T1 (`workspace_settings` flag migration).
- E3-M4-T1 and E3-M4-T2 (retirement migration design + script) — full ownership, this is squarely a Data Layer responsibility and should not be delegated to whichever team happens to be free at the time, given the irreversibility risk flagged in §5.3.

### Compatibility Layer team
*Owns the provider abstraction itself — the literal "compatibility layer" the roadmap is named after.*
- E2-2 (`IIntelligenceProvider` interface definition) — full ownership, this team is the interface's steward.
- E2-3 (`BrandOSLegacyIntelligenceProvider`) — full feature, including the `workspaceId` lookup correction.
- E2-4 (`IntelligenceOSProvider`, IOS-side adapter) — full feature.
- E2-5-T1 (`CPLOrchestrator` rewiring) — full ownership; this team is best positioned to own the orchestrator's provider-selection logic since it's the direct consumer of the interface they're stewarding.
- E3-M1-T2, T3 (provider factory + selection/dual-write in CPL).
- E3-M2-T1 (shadow-mode dispatch).
- E3-M3-T1 (rollback automation).

### Contracts team
*Owns `@brandos/contracts` and the shared type packages.*
- E2-1-T1 partner role (reviewing/approving the `ArtifactBlueprint` extension from a contracts-stability perspective, even though Intelligence Domain team writes the code).
- E2-1-T2 (contracts-side alias types) — full ownership.
- E2-1-T4 (FeedbackEvent reconciliation) — full ownership.
- E1-3-T3 (promote `IntelligenceSummary` to `shared-intelligence-types`) — joint with Intelligence Domain team.
- E3-M4-T3's contracts-cleanup sub-scope (removing BI types from `contracts/src/index.ts` after consumer check).

### Testing team
*Cross-cutting; embeds with each feature team rather than working in isolation, but owns the test-strategy decisions called out as high-risk above.*
- Defines and reviews the E2-5-T1 before/after regression suite (with Compatibility Layer team).
- Defines and reviews the E2-5-T2 dual-path `IdentityContributor` regression suite (with Blueprint Pipeline team) — this is this team's single highest-priority deliverable in the whole program given the risk rating in §5.2.
- Owns E2-3-T2's snapshot-test infrastructure and the policy for treating snapshot diffs as a required-review gate, not auto-accept.
- Owns E3-M2-T0's parity-metric validation (confirming the chosen structural metric actually correlates with governance-score outcomes on the periodic dual-generation sample).
- Owns the staging dry-run validation in E3-M4-T2.

### Documentation team
- Owns regenerating `.context/*.generated.*` and `CLAUDE_BOOTSTRAP.md` after each Epic's package-surface changes land (per §4.5) — this is a recurring task at the end of every sprint that touches a tracked package, not a one-time Epic-3 cleanup item.
- Owns updating each touched package's hand-written `AGENT_CONTEXT.md` source files.
- Owns updating `IntelligenceOS.ts`'s and other IOS doc comments that become stale (e.g., the "4 methods, fixed for all sprints" line) as part of, not after, the features that make them stale.

## 6.2 Recommended Execution Order

~~1. **Sprint 0 (new, not in original roadmap): E2-0 only.**~~ — **removed (post-dates this guide; see Appendix #12 and `ARCHITECTURE_REVIEW_E2-0.md`).** No dedicated gating sprint is needed under the corrected E2-0' design — its tasks are small enough, and unblocked early enough, to fold into Sprint 1 below rather than precede it.

1. **Sprint 1–2: Epic 1, fully parallel, with E2-0' folded in at the start.** Intelligence Domain, Knowledge Domain run concurrently on Epic 1. Simultaneously, whichever team has bandwidth in week one publishes `shared-intelligence-types` (E2-0'-T1) and fixes `check-boundaries.mjs`'s scanning mechanism (E2-0'-T3) — both can start day one alongside Epic 1, per §3.2. The field-shape design review (E2-0'-T2) happens as soon as E2-0'-T1 publishes, typically within the first sprint, well before Epic 1 itself finishes. E2-1-T1 (Intelligence Domain, technically an Epic 2 task) can start in parallel during Sprint 2 once E2-0'-T2's review concludes, since it has no dependency on the rest of Epic 2.
2. **Sprint 3: Epic 2 core.** Contracts team finishes E2-1 reconciliation (T2-T5) at the start of the sprint; Compatibility Layer team builds E2-2/E2-3/E2-4 in parallel once E2-1 types stabilize; Blueprint Pipeline team starts E2-3-T2/E2-5-T2 prep work as soon as the blueprint shape is final.
3. **Sprint 4: Epic 2 close-out.** E2-5-T1/T2 (the critical-path bottleneck identified in §3.1) — staff this as the sprint's top priority, with Testing team embedded from day one rather than joining at the end for a final check. E2-6 rule additions land alongside.
4. **Sprint 5: Epic 3 M1.** Compatibility Layer + Data Layer.
5. **Sprint 6–7: Epic 3 M2 (shadow mode).** Start M2-T0 (parity metric design) during Sprint 4 if Testing team has spare capacity, so M2 itself starts with the metric already defined rather than spending its first week on a design discussion.
6. **Sprint 8+ (calendar time, not necessarily a fixed sprint count): Epic 3 M3 (rollout).** Largely operational; engineering capacity drops to monitoring/on-call levels here, freeing the team to start M4 design work (T1's identity-resolution decision) in parallel.
7. **Final sprint: Epic 3 M4 (retirement).** Data Layer leads, full regression pass from Testing team, Documentation team closes out the `.context` regeneration and `AGENT_CONTEXT.md` updates as the very last step before declaring the program complete.

This order matches the roadmap's own three-epic sequencing exactly — there is no longer a structural Sprint 0 insertion. The one remaining schedule adjustment relative to the original roadmap is pulling E3-M2-T0 forward into Epic 2's tail end to remove it from M2's critical path; the program's total length under this corrected design is one sprint shorter than this guide originally estimated, since the dedicated monorepo-merge sprint no longer exists.

---

# 7. Definition of Done

## Epic 1 — IntelligenceOS Capability Superset

- [ ] **Implementation complete:** All five features (E1-1 through E1-5) merged, including the corrected classification target (3 values, not 5) and the corrected workspace-voice design (no sentinel bridge). E1-H1/E1-H2 housekeeping merged.
- [ ] **Testing complete:** Per-feature unit and integration tests pass (see Deliverable 2 for the specific test list per task). `RULE-IOS-ISOLATION` standalone checker (E1-H2) passes against final Epic 1 source.
- [ ] **Documentation complete:** `IntelligenceOS.ts`'s public-surface doc comment updated to reflect 6 methods. Any internal IOS doc comments referencing the old 4-method or 5-value-classification assumptions corrected.
- [ ] **Ready for next epic:** `@brandos/shared-intelligence-types` contains the final, implementation-derived (not independently-drafted) shapes for `IntelligenceSummary`, `ProjectInput`/`KnowledgeAssetInput` (promoted). E1-2-T0's design decision is recorded and resolved, not left open. E1-5-T2's calibration is at least provisionally complete with documented thresholds, flagged for revisit before E3-M4 if production data wasn't available.

## Epic 2 — BrandOS Compatibility Layer

- [ ] **Implementation complete:** Contract distribution setup (E2-0') complete — `shared-intelligence-types` published, `check-boundaries.mjs` updated to scan dependency declarations, field-shape reconciliation reviewed and agreed by both teams. E2-1 reconciliation complete — `ArtifactBlueprint` extended with `degraded`/`confidenceScore`/`buildDurationMs`, contracts-side types are aliases (not independent redefinitions) of the real shapes. `IIntelligenceProvider` defined and exported. Both adapters (`BrandOSLegacyIntelligenceProvider`, `IntelligenceOSProvider`) implemented, including the corrected `reviewLearning()` workspace-id lookup, with `IntelligenceOSProvider` exported from IOS's public `index.ts` for installable-package consumption. `CPLOrchestrator` rewired to the interface with a working default-provider bridge for zero-arg call sites. `IdentityContributor` rewritten with a confirmed dual-path equivalence. All four boundary rules added in their corrected file locations (three in `check-boundaries.mjs`, one in `package-registry.mjs`'s `FORBIDDEN_IN_ROUTES`).
- [ ] **Testing complete:** `orchestrator.test.ts` extended with explicit before/after behavior-equivalence cases, not just new-path coverage. `IdentityContributor`'s dual-path regression suite passes. `translateContextToBlueprint()`'s snapshot tests pass against representative production-shaped fixtures. All four new boundary rules pass against current source and correctly fail against injected bad-import fixtures.
- [ ] **Documentation complete:** `.context/*.generated.*` regenerated against the merged, modified tree. `AGENT_CONTEXT.md` updated for `@brandos/control-plane-layer`, `@brandos/output-control-layer`, `@brandos/contracts`, and the newly-merged `@brandos/intelligence-os`/`@brandos/shared-intelligence-types`.
- [ ] **Ready for next epic:** `workspace_settings.intelligence_provider` migration is written and reviewed (can be applied at the start of Epic 3, doesn't need to wait for Epic 3 to start writing it). E3-M2-T0's parity metric decision is made (ideally during Epic 2's tail, per §6.2) so Epic 3 doesn't open with an undefined success metric.

## Epic 3 — BrandOS Adoption

- [ ] **Implementation complete:** All four milestones (M1–M4) delivered in sequence. M1's dual-write, M2's shadow mode and parity dashboard, M3's progressive rollout and automated rollback, M4's data migration (with resolved identity-attribution design) and full package/rule retirement.
- [ ] **Testing complete:** Full regression suite green throughout the rollout (not just at the end). M2's shadow-mode parity numbers reviewed and meeting the (redefined, structural) parity bar before M3 begins. M3's rollback mechanism tested with synthetic failure data before being relied upon with real traffic. M4's migration dry-run completed against staging-shaped data with reconciled row counts before the real cutover.
- [ ] **Documentation complete:** Final `.context/*.generated.*` regeneration with `@brandos/brand-intelligence` fully absent from the dependency graph. `CLAUDE_BOOTSTRAP.md`'s "Critical Packages" and "Top 10 High-Risk Files" sections reflect the post-retirement architecture (several currently-listed BI-adjacent files will no longer exist). This implementation guide itself archived alongside the adoption strategy and engineering roadmap as the historical record of what actually shipped versus what was originally planned.
- [ ] **Ready for next epic:** None — this is the terminal epic of the migration. "Ready" here means: zero remaining references to `@brandos/brand-intelligence` anywhere in the BrandOS tree (verified by full-text search, not just `package.json` removal), `intelligence_provider` flag can be removed from `workspace_settings` in a follow-up cleanup migration (optional, not required for this program's completion), and BrandOS and IntelligenceOS continue evolving independently per the original mandate, with `@brandos/intelligence-os` now the sole, permanent intelligence provider.

---

# Appendix — Index of All 🔴 Mismatch Findings

For quick reference during planning review, every place this guide found the roadmap or adoption strategy's technical claim contradicted by source code:

1. **Classification scheme is `A|B|C` (3 values), not `A–E` (5 values).** Affects E1-5 throughout both documents, and downstream E3-M4 migration mapping.
2. **`ArtifactBlueprint`'s real shape differs substantially from the roadmap's independently-specified `ArtifactBlueprintResult`** — field names, nesting, and four entirely missing fields (`degraded`, `confidenceScore`, `buildDurationMs` missing from real type; `conflictsDetected`/`conflictsResolved`/`intelligenceProfileVersion`/`depthSpec` missing from roadmap's type).
3. **`getBrandSummary()`'s real BrandOS shape** (`preferredTone`/`audience`/`industry`/`positioning`/`keywords`) has zero field overlap with the proposed `IntelligenceSummary` — needs an explicit, documented default-mapping in the legacy adapter.
4. **`CPLOrchestrator.orchestrate()` calls the BI runtime directly, bypassing the CPL brand-memory proxy functions entirely** on the generation critical path — the proxy functions are real but serve only an admin route and a summary route.
5. **`IdentityContributor` delegates to a runtime callback (`resolveIdentityContribution()`), it doesn't do a simple field read** — Epic 2's adaptation task is a method rewrite, not a type-signature widening.
6. **The four new boundary rules don't all belong in `check-boundaries.mjs`** — `RULE-IOS-CPL-ONLY` belongs in `scripts/shared/package-registry.mjs`'s `FORBIDDEN_IN_ROUTES`, enforced by the separate `check-route-boundaries.mjs` script.
7. **`RULE-OCL-GOVERNANCE-CONFIG` is enforced by a Vitest test file, not `check-boundaries.mjs`**, and was already structurally satisfied before this program began — not a model for how the new RULE-IOS-* rules should be enforced.
8. **`BrandOSLegacyIntelligenceProvider.reviewLearning()`'s pseudocode passes `userId` where `review()` expects `workspaceId`** — needs an explicit lookup, not a direct passthrough.
9. **`brand_memory_entries`/`identity_signals`/`identity_versions.workspace_id` are TEXT with no FK; `intelligence.learnings.workspace_id` is UUID** — the originally-proposed sentinel-user bridge cannot satisfy `intelligence.learnings.user_id`'s `NOT NULL REFERENCES auth.users(id)` constraint, and the eventual data migration has no clean join key to rely on.
10. **The monorepo merge of IntelligenceOS into BrandOS is an unstated prerequisite for all of Epic 2** — the two codebases are currently separate repositories with independent workspace configurations.
11. **(Post-dates this guide) E1-4's design — not just its scheduling — folds structured visual data into a BrandOS-side event bridge instead of an IOS-side Knowledge Pipeline extractor.** `foundations/BrandOS_Intelligence_Semantics_Analysis.md` and `ADR-001-VISUAL-INTELLIGENCE.md` correct this: visual feature extraction (color/typography/layout/mood) is a new `VisualFeatureExtractor` stage inside IOS's own Knowledge Pipeline, invoked from `KnowledgeProcessor.process()`, with no BrandOS event subscription and no BrandOS dependency. This removes the cross-epic scheduling problem this guide's own finding #2-adjacent E1-4 analysis (§1.1) had already flagged, rather than just re-scheduling around it. Affects E1-4 throughout this guide (Epic Validation §1.1, Implementation Backlog §2 Epic 1, former E3-M1-T4 — now void) and the parallel correction in the Engineering Roadmap's E1-4 section.
12. **(Post-dates this guide) This guide's own §1.2 finding — that Epic 2 has an unstated, blocking monorepo-merge prerequisite — was itself an implementation assumption mistaken for an architectural requirement.** `ARCHITECTURE_REVIEW_E2-0.md` traces the root cause to two implementation details treated as fixed: E2-4's adapter specified at a file path implying workspace-relative resolution, and `check-boundaries.mjs` treated as a fixed filesystem-scanner rather than as itself swappable for a dependency-declaration scan. Corrected: every Epic 2 task is satisfiable through a published, versioned `shared-intelligence-types` package plus the already-planned `IIntelligenceProvider` interface, consumed as an ordinary library dependency — and per that review's analysis, this is architecturally *preferable* to a monorepo for IntelligenceOS's stated dependency-direction and platform-reusability goals, not merely an acceptable substitute. **E2-0 — Monorepo Consolidation is removed; replaced by the much smaller E2-0' — Contract Distribution Setup.** Affects this guide throughout: Epic Validation §1.2, the Implementation Backlog's Epic 2 task list (every "Dependencies: E2-0-T*" line), the Critical Path (§3.1, now one segment shorter), Parallelizable Work (§3.2, E2-0' tasks can run from day one), Blocking/Gating Relationships (§3.3), the Technical Risks table (§5.2, two risk rows removed), Team Allocation (§6.1), Recommended Execution Order (§6.2, the dedicated Sprint 0 gate removed), and the Definition of Done checklist — plus the parallel correction in the Engineering Roadmap's E2-4 section.
