# IntelligenceOS Engineering Roadmap
## Three Epics: From Independent Engine to Canonical Intelligence Platform

> **Historical planning document.** Describes the intended three-epic implementation plan as authored pre-Epic-1. Epic 1 and Epic 2 are now complete. For current implementation state, see `docs/IMPLEMENTATION_STATUS.md`. For current architecture, see `INTELLIGENCEOS_BOOTSTRAP.md`. The sequencing, scope, and technical conclusions in this document remain accurate as a record of intent; individual task details may have been superseded by subsequent decisions (noted inline where they were made).

> **Version:** 1.0 — 2026-06-25  
> **Authority:** Repurposed from *IntelligenceOS Adoption Strategy for BrandOS* (Lead Architect Analysis, Sprint 3 Complete). All technical findings, source-code analysis, and architectural conclusions in that document remain the authoritative reference. This document reorganizes those findings into an executable engineering plan.  
> **Do not modify** the technical conclusions in the source document to align with this roadmap. If a technical finding changes, update the source document first, then reconcile here.
> **Addendum (post-1.0):** `foundations/BrandOS_Intelligence_Semantics_Analysis.md` ("the Semantics Analysis") performed a deeper, independent semantic review after this roadmap was authored and corrects one specific item below — E1-4's design (§ below) and E3-M4's data-migration mapping. `ADR-001-VISUAL-INTELLIGENCE.md` ratifies that correction as a formal architectural decision. `ARCHITECTURE_REVIEW_E2-0.md` separately re-examined the Epic 2 integration strategy and found that the originally-proposed monorepo consolidation prerequisite was an implementation assumption, not an architectural requirement — see E2-4's note below for the resulting correction. Where this roadmap's text and those documents disagree on E1-4/E3-M4's design or E2-4's integration mechanism, the newer documents govern; this roadmap's sequencing, scope, and estimates are unchanged. No other item in this roadmap is affected.

---

## Master Dependency Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BrandOS GTM track — continues independently throughout all three epics     │
│  No BrandOS feature development blocked at any point                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  EPIC 1 — IntelligenceOS Capability Superset            │
│  Owner: IntelligenceOS team                             │
│  BrandOS changes: NONE                                  │
│                                                         │
│  Closes all functional gaps against BrandOS BI.         │
│  IOS becomes a complete superset of BrandOS BI          │
│  capabilities. Can proceed in parallel with BrandOS     │
│  GTM work indefinitely.                                 │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Epic 2 cannot begin until
                           │ Epic 1 exit criteria are met
                           ▼
┌─────────────────────────────────────────────────────────┐
│  EPIC 2 — BrandOS Compatibility Layer                   │
│  Owner: IntelligenceOS team (primary)                   │
│  BrandOS changes: @brandos/contracts + shared types     │
│           (additive only — no behavior change)          │
│                                                         │
│  IOS exposes IIntelligenceProvider interface.           │
│  BrandOS defines the contract. No migration happens.    │
│  BrandOS GTM continues unblocked.                       │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Epic 3 cannot begin until
                           │ Epic 2 exit criteria are met
                           ▼
┌─────────────────────────────────────────────────────────┐
│  EPIC 3 — BrandOS Adoption                             │
│  Owner: BrandOS team (primary)                          │
│  BrandOS changes: CPL, OCL, feature flags, rollout      │
│                                                         │
│  BrandOS swaps intelligence provider behind existing    │
│  proxy surface. Controlled rollout. Rollback at every   │
│  step. Retires @brandos/brand-intelligence package.     │
└─────────────────────────────────────────────────────────┘

Parallel work permitted:
  Epic 1 ←→ BrandOS GTM: fully parallel, zero coupling
  Epic 2 ←→ BrandOS GTM: mostly parallel; @brandos/contracts addition is a
             one-sprint coordination event only
  Epic 3:    requires Epic 1 + 2 complete; BrandOS team drives
```

---

## Epic 1 — IntelligenceOS Capability Superset

### Objective

Make IntelligenceOS a complete functional superset of BrandOS Brand Intelligence. After this epic, every intelligence capability currently provided by `@brandos/brand-intelligence` (L7) exists natively inside IntelligenceOS, at equal or greater depth. No BrandOS code changes are proposed or required.

### Scope

All work happens inside `packages/intelligence-os/`. No `@brandos/*` packages are touched. BrandOS continues shipping on its own schedule without awareness of this epic.

The scope is defined by the capability matrix in Section 3.1 of the source analysis. Every row with status **Missing** or **Partial** represents work this epic must complete.

### Epic 1 is NOT responsible for

- Defining how BrandOS will consume IntelligenceOS (Epic 2)
- Changing any BrandOS package (Epic 3)
- Designing the `IIntelligenceProvider` interface (Epic 2)
- Wiring IntelligenceOS into BrandOS infrastructure (Epic 3)

---

### Backlog

Each item below maps directly to a gap identified in the source analysis (Sections 3.1 and 4). Source references are cited; no new architectural conclusions are introduced here.

---

#### E1-1 — Human Learning Review API

**Priority:** Critical (blocks Epic 2 exit criteria)

**Current BrandOS implementation:**  
`IBrandIntelligenceRuntime.review(workspaceId, entryId, approved, reviewedBy)` — a working production workflow. CPL proxy: `reviewBrandMemorySignal()`. Admin UI calls this to move `brand_memory_entries` from `pending_review` → `approved` or `rejected`. Source: `packages/brand-intelligence/src/runtime/types.ts`, `IBrandIntelligenceRuntime` interface.

**Current IntelligenceOS implementation:**  
`LearningState` type includes `FLAGGED` (defined in `src/types/entities.ts`). The `intelligence.learnings` table supports all required state transitions. No public method on `IntelligenceOS` or any domain exposes a review surface. Source: `packages/intelligence-os/src/types/entities.ts`, `intelligence-os/src/db/schema.sql`.

**Gap:**  
No public review API exists. The state machine is defined but inaccessible from outside the package.

**Required implementation:**

New public method on `IntelligenceOS`:

```typescript
// packages/intelligence-os/src/IntelligenceOS.ts
async reviewLearning(
  userId: string,
  learningId: string,
  approved: boolean,
  reviewedBy: string
): Promise<void>
```

New domain method on `UserIntelligenceDomain`:

```typescript
// packages/intelligence-os/src/domains/UserIntelligenceDomain.ts
async reviewLearning(
  userId: string,
  learningId: string,
  approved: boolean,
  reviewedBy: string
): Promise<void>
// State transition: FLAGGED → ACTIVE (approved) | FLAGGED → ARCHIVED (rejected)
// Error on non-existent learningId: throw EntityNotFoundError
// Error on wrong userId: throw ValidationError
```

Event emitted on completion: `intelligence.learning.reviewed` (add to `IntelligenceEventType` in `src/types/events.ts`).

**Database changes:** None. `intelligence.learnings.state` already supports all required values.

**Dependencies:** None. Can begin immediately.

> **Scope addition (post-1.0, per the Semantics Analysis Deliverable 8):** the review API above correctly captures supervisory correction of a machine-proposed signal, but it's not the only high-trust human signal IOS should be able to act on. Add one small, additive verification task alongside it: confirm `IntelligenceOS.recordFeedbackEvent()`'s existing `FeedbackEvent.eventType` enum is correctly persisted end-to-end for `'explicit_feedback'`-typed events (a direct human verdict on a finished artifact, not a review of a candidate signal). This is not full `ArtifactExemplar`-promotion logic — that remains a later-sprint capability per `ArtifactIntelligenceDomain`'s own stub comments — it's confirming the write path for the *highest-trust* evidence category identified in the Semantics Analysis (Deliverable 3) actually persists today, so a future promotion job has real data to work from. Small addition; does not change E1-1's estimate or critical-path status.

**Acceptance criteria:**
- `IntelligenceOS.reviewLearning()` transitions a FLAGGED learning to ACTIVE (approved=true) or ARCHIVED (approved=false)
- Calling on a non-existent learningId throws `EntityNotFoundError`
- Calling on a learning belonging to a different userId throws `ValidationError`
- `intelligence.learning.reviewed` event is emitted on success
- Unit tests cover: approved path, rejected path, not-found case, wrong-user case
- Integration test verifies state persisted to `intelligence.learnings`
- `recordFeedbackEvent()` called with `eventType: 'explicit_feedback'` persists correctly to `intelligence.feedback_events` with its rating/note fields intact (verification only — no promotion logic in this task)

---

#### E1-2 — Workspace-Scoped Brand Voice

**Priority:** High (required for multi-user workspace parity)

**Current BrandOS implementation:**  
`brand_memory_entries.workspace_id` is the primary scope for all BI resolution. All five CPL proxy functions receive `workspaceId` as their primary parameter. The workspace is the brand — not the individual user. Source: `runtime_model.generated.md` §Brand Intelligence Model, `brand-intelligence.generated.md` §Key Integration Points.

**Current IntelligenceOS implementation:**  
`intelligence.learnings.workspace_id` is a nullable column with no FK and no composite index on workspace-only queries. `UserIntelligenceDomain` methods are user-scoped. There is no `WorkspaceIntelligenceDomain.getWorkspaceLearnings()`. Source: `src/db/schema.sql` learnings table, `src/domains/WorkspaceIntelligenceDomain.ts` (reads compliance constraints only).

**Gap:**  
IOS can model individual user intelligence but has no workspace-level brand voice layer. In a multi-user workspace (multiple users sharing a brand identity), the workspace brand voice — separate from any individual user's learned voice — does not exist in IOS.

> **Modeling refinement (post-1.0, per the Semantics Analysis Deliverable 8):** "workspace brand voice" is not one uniform kind of knowledge. Split it before implementing Phase B: a **declared, non-decaying floor** (compliance disclaimers, banned phrases, mandated style rules a workspace admin sets) belongs in `WorkspaceIntelligenceDomain.getContext()`'s existing `complianceConstraints` mechanism, which already does not decay — it should never be modeled as a workspace-scoped `Learning` row, because `Learning`'s decay machinery would let a hard constraint silently weaken if it isn't "reinforced" recently. Only a genuinely **inferred, evolving** workspace-level style pattern (e.g., "this team consistently writes shorter copy than any individual member's personal baseline," if such a pattern is ever found to exist) should use the `Learning`-with-decay path Phase B below describes. This doesn't change Phase B's task list, estimate, or the two new methods it adds — it changes which of the two methods a given piece of workspace knowledge should be routed through, and should be a documented decision point inside Phase B's implementation, not a new phase.

**Required implementation:**

Phase A — Composite index (immediate, no domain change):
```sql
CREATE INDEX intelligence_learnings_workspace_domain
  ON intelligence.learnings(workspace_id, domain, state)
  WHERE workspace_id IS NOT NULL;
```

Phase B — Workspace learnings domain method:
```typescript
// packages/intelligence-os/src/domains/WorkspaceIntelligenceDomain.ts
async getWorkspaceLearnings(
  workspaceId: string,
  domain?: DomainType,
): Promise<Learning[]>

async upsertWorkspaceLearning(input: WorkspaceLearningInput): Promise<string>
```

Phase C — BlueprintBuilder workspace voice layer:  
When `request.workspaceId` is present, `BlueprintBuilder.build()` fetches workspace learnings in its Step 1 parallel fetch. `NarrativePlanner` applies a workspace brand voice layer above user voice (workspace brand > user voice > archetype default > system default).

**Design constraint from source analysis (Section 4.2):** The sentinel approach (`userId = '_workspace_<workspaceId>'`) is acceptable as a Phase A bridge during development. Formalize as a proper workspace scope in Phase B.

**Database changes:** Index addition (Phase A). No new tables.

**Dependencies:** E1-1 can proceed in parallel. Phase C requires Phase B.

**Acceptance criteria:**
- `WorkspaceIntelligenceDomain.getWorkspaceLearnings(workspaceId)` returns workspace-scoped learnings
- Declared, non-decaying workspace constraints (compliance disclaimers, banned phrases, mandated style rules) are read via `WorkspaceIntelligenceDomain.getContext().complianceConstraints`, not stored as workspace-scoped `Learning` rows — confirm no Phase B code path writes a declared constraint into `intelligence.learnings`
- `BlueprintBuilder.build()` incorporates workspace voice directives when `workspaceId` is present
- A blueprint built for two different users in the same workspace shares the workspace brand voice layer
- A blueprint built with no workspace context does not fail (workspace voice layer is optional)
- Integration tests cover: single-user workspace, multi-user workspace (same workspace_id, different user_ids), no-workspace request, and a declared-constraint case verifying it does not decay across simulated time

---

#### E1-3 — Brand Summary Query API

**Priority:** High (required for workspace settings UI compatibility in Epic 2)

**Current BrandOS implementation:**  
`IBrandIntelligenceRuntime.getBrandSummary({ workspaceId, personaId? })` aggregates brand memory for the workspace settings UI display. CPL proxy: `getBrandSummary()`. Source: `brand-intelligence.generated.md` §Runtime method surface, `control-plane-layer.generated.md` §Public Exports.

**Current IntelligenceOS implementation:**  
No equivalent method on `IntelligenceOS`. No aggregate summary query exists in any domain store.

**Gap:**  
UI surfaces in BrandOS's workspace settings depend on a summary API that IOS does not expose.

**Required implementation:**

New public method on `IntelligenceOS`:

```typescript
// packages/intelligence-os/src/IntelligenceOS.ts
async getBrandSummary(params: {
  userId: string;
  workspaceId?: string;
}): Promise<IntelligenceSummary>
```

New type (will be promoted to `@brandos/shared-intelligence-types` in Epic 2):

```typescript
interface IntelligenceSummary {
  compositeConfidence: number;         // from profile.compositeConfidence; 0 if no profile
  archetypePrimary: string | null;     // from archetype.archetypeType
  archetypeConfidence: number | null;  // from archetype.confidence
  activeLearningsCount: number;        // count of learnings with state IN (ACTIVE, CONFIRMED, VALIDATED)
  topTaxonomyCategories: string[];     // top 3 taxonomy_category values by learning count
  voiceSummary: Record<string, unknown> | null;  // from profile.voiceSummary
  degraded: boolean;                   // true if no profile exists
}
```

New domain method on `UserIntelligenceDomain`:

```typescript
async countActiveLearnings(userId: string, workspaceId?: string): Promise<number>
async getTopTaxonomyCategories(userId: string, limit?: number): Promise<string[]>
```

**Database changes:** None. Queries existing tables with existing indexes.

**Dependencies:** None. Can begin immediately in parallel with E1-1 and E1-2.

**Acceptance criteria:**
- `getBrandSummary()` returns valid `IntelligenceSummary` for a user with no profile (degraded=true, all counts 0)
- Returns correct `compositeConfidence` from current profile
- Returns correct `activeLearningsCount` (only ACTIVE/CONFIRMED/VALIDATED states)
- Returns top 3 taxonomy categories by frequency
- `workspaceId` parameter filters learnings to workspace scope when provided
- Unit tests cover: no-profile user, user with profile, workspace-scoped query

---

#### E1-4 — VLM Visual Intelligence Bridge

**Priority:** Medium (net-new capability; does not block Epic 2)

> **Design correction (post-1.0, ratified by ADR-001):** the "Required implementation" below — VLM execution stays in BrandOS, IOS only subscribes to a forwarded result — is **superseded**. The Semantics Analysis (Deliverable 8) found that this design folds structured visual fields (`primaryColors`, `fontStyle`, `layoutDensity`) into the same free-text-flavored signal path as text learnings, and ADR-001 confirms visual extraction should be a stage inside IOS's own Knowledge Pipeline, not a BrandOS-side capability IOS merely observes. The corrected design is below; the original block is struck through for traceability, not because the section format changed.

**Current BrandOS implementation:**  
`brand_assets.vlm_analysis` (JSONB) stores visual language model analysis of uploaded images. Feeds brand visual identity (colors, fonts, layout density) into `IBrandCognitionContext`. Source: `runtime_model.generated.md` §Brand Asset.

**Current IntelligenceOS implementation:**  
`KnowledgeProcessor` handles text semantic extraction only (`VocabularyExtractor`, `FrameworkExtractor`, `PatternExtractor`). No visual-feature extraction stage exists. Source: `src/knowledge/KnowledgeProcessor.ts`.

**Gap:**  
IOS's Knowledge Pipeline has no extractor for the visual dimension of an uploaded knowledge asset (brand guidelines, design systems, logos, templates) — only the text dimension. This is an extraction-coverage gap inside IOS's existing pipeline, not a missing bridge to a BrandOS-side capability.

**Required implementation (corrected):**

This is extraction-coverage work inside IOS's own Knowledge Pipeline — the same shape as the three extractors that already exist, applied to a channel they don't read. It is not an event-subscription bridge to a BrandOS-side VLM call.

Step 1 — Add a `VisualFeatureExtractor` class to `src/knowledge/`, parallel to `VocabularyExtractor`/`FrameworkExtractor`/`PatternExtractor`, producing a structured result (e.g. `VisualFeatureExtractionResult`) with **distinct fields per dimension** — `colors`, `typography`, `layout`, `mood` — rather than one free-text blob. This mirrors the existing extractors' result shapes exactly (see `VocabularyExtractionResult` for the pattern to follow).

Step 2 — Wire `KnowledgeProcessor.process()` to invoke `VisualFeatureExtractor` when the ingested asset's `assetType`/content indicates a visual asset (image, design file, brand-guideline document with embedded visuals), alongside the existing text extractors — not behind a new event subscription. The asset still arrives through the existing `IntelligenceOS.ingestKnowledgeAsset()` public method; no new public method is introduced.

Step 3 — Persisted result lands on `KnowledgeAsset` (a new `extractedVisualFeatures` JSONB column, sibling to the existing `extracted_vocabulary`/`extracted_frameworks`/`extracted_patterns` columns) for reference-material assets, and/or as a `Learning` with `taxonomyCategory: 'personal_brand_signal'` (the closest existing fit; see ADR-001 §5 on whether a dedicated taxonomy value is warranted) under `UserIntelligenceDomain` for style/mood signals that should decay and accumulate confidence the way text-voice learnings already do.

**What this replaces from the original design:** no `brandos.brand_asset.analyzed` event type, no `KnowledgeProcessor` event subscription to a BrandOS-emitted payload, and no BrandOS-side `bus.emit()` dependency. Whether BrandOS *also* wants to run its own VLM analysis for its own purposes is outside IOS's scope either way — IOS's visual learning no longer depends on BrandOS having done so first.

**Database changes:** One additive JSONB column on `intelligence.knowledge_assets` (`extracted_visual_features`). Otherwise uses existing `intelligence.learnings` table — same as before.

**Dependencies:** None on BrandOS. This removes the prior design's only BrandOS-side dependency for Epic 1 — E1-4 can now be fully completed, tested, and verified end-to-end inside IOS alone, without waiting on Epic 2/3 infrastructure (contrast with the prior design, which the Implementation Guide's Epic Validation already found couldn't be verified end-to-end until E3-M1).

**Acceptance criteria (corrected):**
- `VisualFeatureExtractor.extract()` produces a result with distinct `colors`/`typography`/`layout`/`mood` fields (not a single collapsed string) for a representative set of test fixtures
- `KnowledgeProcessor.process()` invokes the visual extractor for visual-typed assets, alongside (not instead of) the existing text extractors when both apply
- Extracted visual features persist to `KnowledgeAsset.extractedVisualFeatures` for reference-material assets, or to a `personal_brand_signal`-tagged `Learning` for style/mood signals, per the owning-domain split in ADR-001 §5
- Unit tests cover: a representative image/design-file fixture → correctly-shaped extraction result; a non-visual asset → extractor not invoked, no error
- No event type, handler, or BrandOS-side dependency is introduced

---

<details>
<summary>Superseded original design (retained for traceability — do not implement)</summary>

**Original "Current IntelligenceOS implementation":** `KnowledgeProcessor` handles text semantic extraction only. No visual intelligence pipeline exists. Source: `src/knowledge/KnowledgeProcessor.ts`.

**Original "Gap":** IOS has no path from visual brand assets to intelligence learnings. BrandOS VLM analysis results are not observable by IOS today.

**Original "Required implementation":** This gap is addressed through event subscription, not a new extraction pipeline in IOS. VLM execution remains in BrandOS (it requires the AI runtime). IOS subscribes to the result.

```typescript
export type IntelligenceEventType =
  | ... (existing)
  | 'brandos.brand_asset.analyzed';   // BrandOS → IOS: VLM analysis complete

export interface BrandAssetAnalyzedPayload {
  userId: string;
  workspaceId: string;
  assetId: string;
  assetType: 'image' | 'logo' | 'banner';
  vlmAnalysis: {
    primaryColors: string[];
    fontStyle: string | null;
    layoutDensity: string | null;
    visualStyle: Record<string, unknown>;
  };
  occurredAt: string;
}
```

```typescript
// packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts
this.bus.on('brandos.brand_asset.analyzed', async (payload) => {
  await this.ingestVisualIntelligenceSignal(payload as BrandAssetAnalyzedPayload);
});
```

`ingestVisualIntelligenceSignal()` creates a `knowledge_intelligence` domain learning from the VLM payload. Taxonomy category: `personal_brand_signal` (visual dimension).

**Original "Dependencies":** Requires BrandOS to emit `brandos.brand_asset.analyzed` (this is a BrandOS change, but it is additive and does not affect any existing behavior — a fire-and-forget emit after VLM analysis completes). This is the only E1 item that has a BrandOS side, and it is a single `bus.emit()` call, not a structural change.

**Original "Acceptance criteria":** IOS registers handler for `brandos.brand_asset.analyzed` event; handler creates a `knowledge_intelligence` learning with correct taxonomy category; handler failure does not propagate; unit tests for valid/malformed payload.

</details>

---

#### E1-5 — A–E Classification Backward Compatibility Mapping

**Priority:** Medium (required for transition period in Epic 3)

> **Correction (carried from the Implementation Guide, Appendix finding #1 — not a visual-intelligence item, noted here only because this task description and its acceptance criteria directly assume the disproven 5-value scheme):** the real BrandOS classification type is `'A' | 'B' | 'C'` (3 values), not `A`–`E` (5 values). The task description, code sketch, and acceptance criteria below should be read through the Implementation Guide's corrected version (§2, Epic 1, Feature E1-5) rather than as written here. This roadmap's text is left in place rather than rewritten in full, since the Implementation Guide is the document responsible for resolving roadmap/code mismatches — duplicating its correction here risks the two documents drifting apart on the same fix.

**Current BrandOS implementation:**  
`brand_memory_entries.classification` uses a single-character A–E scheme defined in `@brandos/contracts` as `SIGNAL_CLASSIFICATION`. OCL's `IdentityContributor` and the governance layer reference this classification. Source: `contracts.generated.md` §brand-cognition-contracts.ts.

**Current IntelligenceOS implementation:**  
IOS uses `taxonomy_category` (25 values), `stability_class` (permanent/long_term/medium_term), and `confidence` (0–1 numeric). No A–E classification concept exists. Source: `src/types/entities.ts` §Taxonomy.

**Gap:**  
During the Epic 3 transition period, `BrandOSLegacyIntelligenceProvider` may need to produce A–E classified signals for backward compatibility. IOS must be able to compute an A–E equivalent on read.

**Required implementation:**

A pure utility function (no new table, no new domain method):

```typescript
// packages/intelligence-os/src/utils/classificationCompat.ts

/**
 * Maps IOS learning fields to BrandOS A–E classification.
 * Used only during transition. Not part of IOS core model.
 *
 * A = permanent stability + confidence >= 0.8 (highest authority)
 * B = long_term stability + confidence >= 0.6
 * C = medium_term stability + confidence >= 0.4
 * D = any stability + confidence >= 0.2
 * E = confidence < 0.2 or DECAYING/FLAGGED state
 */
export function toLegacyClassification(learning: Learning): 'A' | 'B' | 'C' | 'D' | 'E'
```

This function is exposed from `src/index.ts` as a named export but is explicitly marked `@internal — for transition period use only`.

**Database changes:** None.

**Dependencies:** None. Can begin at any time. Low effort.

**Acceptance criteria:**
- `toLegacyClassification()` produces A–E for all valid `Learning` inputs
- No Learning input causes an exception
- Unit tests cover all 5 output values and boundary confidence values
- Function is marked `@internal` in JSDoc

---

### Epic 1 Deliverables Summary

| Item | Priority | BrandOS changes | Sprint estimate |
|---|---|---|---|
| E1-1 Human learning review API | Critical | None | 0.5 sprints |
| E1-2 Workspace-scoped brand voice | High | None | 1–1.5 sprints |
| E1-3 Brand summary query API | High | None | 0.5 sprints |
| E1-4 VLM visual intelligence bridge | Medium | None (corrected — see design correction note above; was 1 `bus.emit()` call in the superseded design) | 1 sprint |
| E1-5 A–E classification compat mapping | Medium | None | 0.25 sprints |

**Total estimate:** 3.25–4 sprints for the full epic. E1-1, E1-3, and E1-5 can proceed in parallel. E1-2 Phase C depends on Phase B. E1-4 has no BrandOS dependency under the corrected design (see above) and can also proceed in parallel.

### Epic 1 Dependencies

- No BrandOS team involvement required, including for E1-4 under the corrected design — the prior design's one `bus.emit()` coordination point is no longer needed
- Supabase test project with `intelligence` schema must be available in IOS CI
- `@brandos/shared-intelligence-types` package should be initialized (even if empty) before E1-3, so the `IntelligenceSummary` type lands in the right location from the start

### Epic 1 Risks

**Risk — Workspace scope design complexity:** The sentinel approach for workspace learnings is pragmatic but temporary. If the IOS team skips Phase B (formal workspace scope) and ships only the sentinel, Epic 2 and Epic 3 will inherit technical debt that complicates the compatibility layer. Recommendation: complete Phase B within the same sprint as Phase A.

**Risk — E1-2 scope creep:** Workspace brand voice touches `BlueprintBuilder`, `NarrativePlanner`, and `WorkspaceIntelligenceDomain`. These are three separate subsystems. Scope carefully to avoid pulling in unrelated blueprint improvements.

### Epic 1 Acceptance Criteria (Epic-Level)

- Every capability in the source analysis capability matrix (Section 3.1) has status **Exists** or **Better implementation exists** in IOS
- No capability rows remain at **Missing** or **Partial**
- All new methods are covered by unit tests and at least one integration test against the `intelligence` schema
- `RULE-IOS-ISOLATION` remains enforced: `packages/intelligence-os/` imports zero `@brandos/*` implementation packages

### Epic 1 Exit Criteria

All of the following must be true before Epic 2 begins:

1. E1-1 (reviewLearning) — merged and integration-tested
2. E1-2 (workspace voice, Phase B) — merged and integration-tested
3. E1-3 (getBrandSummary) — merged and integration-tested
4. E1-5 (classification compat) — merged and unit-tested
5. IOS test suite passes in CI against test Supabase project
6. `RULE-IOS-ISOLATION` check passes with zero violations

E1-4 (VLM bridge) does not block Epic 2. Under the corrected design (see above), it has no BrandOS dependency and can be fully completed and verified within Epic 1 itself, rather than only partially verifiable until Epic 3 infrastructure exists.

---

## Epic 2 — BrandOS Compatibility Layer

### Objective

Define the interface contract that IntelligenceOS will implement and BrandOS will consume. After this epic, IntelligenceOS exposes every runtime surface currently provided by `@brandos/brand-intelligence` — through a new, stable interface — without changing any BrandOS production behavior.

No migration happens in this epic. BrandOS continues to run `@brandos/brand-intelligence` unmodified. The compatibility layer is a bridge that makes the swap in Epic 3 a controlled substitution rather than an architectural change.

### Scope

**IntelligenceOS team:**
- Implement `IIntelligenceProvider` on `IntelligenceOS`
- Produce the `IntelligenceOSProvider` adapter class (an implementation of `IIntelligenceProvider` that delegates to `IntelligenceOS`)

**BrandOS team (additive, non-behavioral):**
- Define `IIntelligenceProvider` interface in `@brandos/contracts`
- Create `@brandos/shared-intelligence-types` package (or module) with shared handoff types
- Create `BrandOSLegacyIntelligenceProvider` (wraps existing BI runtime, implements `IIntelligenceProvider`)
- Wire `BrandOSLegacyIntelligenceProvider` as the active provider in CPL (no behavior change)
- Add `RULE-IOS-ISOLATION` to `check-boundaries.mjs`

### Epic 2 is NOT responsible for

- Activating IntelligenceOS in any production route (Epic 3)
- Feature flags or rollout (Epic 3)
- Removing `@brandos/brand-intelligence` (Epic 3)
- Changing `IdentityContributor` to read `ArtifactBlueprintResult` exclusively (Epic 3 Milestone 4)

---

### Deliverables

#### E2-1 — Shared Type Package (`@brandos/shared-intelligence-types`)

**Purpose:** Zero-dependency type package owned jointly. Contains types that cross the IOS/BrandOS boundary. Neither system implements these types; they are the bilateral data contract.

**Location:** `packages/shared-intelligence-types/src/index.ts`

**Required types** (from source analysis Section 5.2):

```typescript
// ArtifactBlueprint — the primary handoff type IOS produces and BrandOS consumes.
// Replaces IBrandCognitionContext + ContractAssemblerFactory assembly in the long term.
export interface ArtifactBlueprintResult {
  blueprintId: string;
  userId: string;
  artifactType: string;
  voiceDirectives: VoiceDirectives;
  narrativeFrame: NarrativeFrame;
  structurePlan: StructurePlan;
  vocabularyDirectives: VocabularyDirectives;
  audienceCalibration: AudienceCalibration;
  projectContext: ProjectContext | null;
  complianceRequirements: ComplianceRequirement[];
  confidenceScore: number;        // 0–1
  degraded: boolean;              // true = built with partial/no intelligence
  builtAt: string;                // ISO 8601
  buildDurationMs: number;
}

// Input type BrandOS passes to IOS for blueprint generation.
export interface IntelligenceBlueprintRequest {
  userId: string;
  workspaceId: string;
  projectId?: string | null;
  artifactType: string;
  audienceRef?: string | null;
  personaId?: string | null;
}

// Event type BrandOS sends to IOS post-generation.
export interface IntelligenceFeedbackEvent {
  userId: string;
  artifactId: string;
  artifactType: string;
  projectId?: string | null;
  eventType: 'accepted' | 'edited' | 'rejected' | 'deployed' | 'explicit_feedback';
  editDiff?: Record<string, unknown> | null;
  explicitReason?: string | null;
  blueprintRef?: string | null;   // links to IOS artifact_blueprints.id
}

// Summary type returned by getBrandSummary().
export interface IntelligenceSummary {
  compositeConfidence: number;
  archetypePrimary: string | null;
  archetypeConfidence: number | null;
  activeLearningsCount: number;
  topTaxonomyCategories: string[];
  voiceSummary: Record<string, unknown> | null;
  degraded: boolean;
}

// Project sync type.
export interface IntelligenceProjectInput {
  userId: string;
  workspaceId?: string | null;
  brandosProjectId?: string | null;
  name: string;
  projectType?: string | null;
  lifecycleState?: 'IDEATION' | 'ACTIVE' | 'WIND_DOWN' | 'ARCHIVED';
}

// Knowledge asset input type.
export interface IntelligenceKnowledgeAssetInput {
  ownerType: 'user' | 'project' | 'workspace';
  userId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  assetType: 'playbook' | 'framework' | 'methodology' | 'template' | 'reference';
  title: string;
  sourceFileRef?: string | null;
}
```

**Boundary rules to add to `check-boundaries.mjs`:**

```
RULE-SIT-ISOLATION: @brandos/shared-intelligence-types must NOT import from any @brandos/*
package. It is zero-dependency. Only TypeScript primitive types and interfaces permitted.
```

**Acceptance criteria:**
- Package builds with zero dependencies
- All types are exported from `src/index.ts`
- `RULE-SIT-ISOLATION` passes in CI

---

#### E2-2 — `IIntelligenceProvider` Interface

**Location:** `packages/contracts/src/intelligence-provider.ts` (exported from `packages/contracts/src/index.ts`)

**Full interface definition** (from source analysis Section 5.1):

```typescript
// @brandos/contracts — packages/contracts/src/intelligence-provider.ts

import type {
  ArtifactBlueprintResult,
  IntelligenceBlueprintRequest,
  IntelligenceFeedbackEvent,
  IntelligenceSummary,
  IntelligenceProjectInput,
  IntelligenceKnowledgeAssetInput,
} from '@brandos/shared-intelligence-types';

export interface IIntelligenceProvider {
  // ── Called before every generation (critical path) ─────────────────────────
  buildBlueprint(request: IntelligenceBlueprintRequest): Promise<ArtifactBlueprintResult>;

  // ── Called post-generation (fire-and-forget) ───────────────────────────────
  recordFeedbackEvent(event: IntelligenceFeedbackEvent): Promise<void>;

  // ── Knowledge ingestion ────────────────────────────────────────────────────
  ingestKnowledgeAsset(
    asset: IntelligenceKnowledgeAssetInput,
    rawContent?: string
  ): Promise<string>;

  // ── Project sync ───────────────────────────────────────────────────────────
  upsertProject(input: IntelligenceProjectInput): Promise<string>;

  // ── Human review workflow ──────────────────────────────────────────────────
  reviewLearning(
    userId: string,
    learningId: string,
    approved: boolean,
    reviewedBy: string
  ): Promise<void>;

  // ── Brand summary (UI display) ─────────────────────────────────────────────
  getBrandSummary(params: {
    userId: string;
    workspaceId?: string;
  }): Promise<IntelligenceSummary>;

  // ── Observable pipeline events ─────────────────────────────────────────────
  readonly eventBus: IntelligenceEventBus;
}
```

**Versioning note:** `IIntelligenceProvider` is a bilateral contract. Breaking changes require coordination between both teams. The interface version should be tracked in a comment in the file header. Minor additions (new optional methods) are backward-compatible.

**Acceptance criteria:**
- Interface exported from `@brandos/contracts`
- TypeScript compiles without error
- Existing `@brandos/contracts` tests pass (additive change only)

---

#### E2-3 — `BrandOSLegacyIntelligenceProvider`

**Location:** `packages/control-plane-layer/src/intelligence/BrandOSLegacyIntelligenceProvider.ts`

**Purpose:** Wraps the existing `IBrandIntelligenceRuntime`. Implements `IIntelligenceProvider`. Production behavior is identical to today — this is a refactoring, not a behavior change.

```typescript
export class BrandOSLegacyIntelligenceProvider implements IIntelligenceProvider {
  constructor(private readonly runtime: IBrandIntelligenceRuntime) {}

  async buildBlueprint(request: IntelligenceBlueprintRequest): Promise<ArtifactBlueprintResult> {
    // Calls existing resolveBrandCognitionContext() path
    const context = await this.runtime.resolve({
      workspaceId: request.workspaceId,
      personaId: request.personaId ?? undefined,
    });
    return translateContextToBlueprint(context, request);
    // translateContextToBlueprint: maps IBrandCognitionContext → ArtifactBlueprintResult
    // All existing fields preserved; new fields (vocabulary, compliance) set to empty defaults
  }

  async recordFeedbackEvent(event: IntelligenceFeedbackEvent): Promise<void> {
    await this.runtime.recordArtifactObservation(event);
  }

  async reviewLearning(
    userId: string, learningId: string, approved: boolean, reviewedBy: string
  ): Promise<void> {
    // In legacy: entryId = learningId, workspaceId resolved from userId
    await this.runtime.review(userId, learningId, approved, reviewedBy);
  }

  async getBrandSummary(params: { userId: string; workspaceId?: string }): Promise<IntelligenceSummary> {
    const raw = await this.runtime.getBrandSummary({
      workspaceId: params.workspaceId ?? params.userId,
    });
    return translateLegacySummary(raw);
  }

  // No-ops in legacy provider (capabilities not present in BrandOS BI):
  async ingestKnowledgeAsset(): Promise<string> { return ''; }
  async upsertProject(): Promise<string> { return ''; }

  get eventBus(): IntelligenceEventBus { return noopEventBus; }
}
```

**Translation fidelity requirement:** `translateContextToBlueprint()` must produce an `ArtifactBlueprintResult` whose `voiceDirectives` are functionally equivalent to the `IBrandCognitionContext` currently consumed by `IdentityContributor`. This is validated by snapshot regression tests (see acceptance criteria).

**Acceptance criteria:**
- All existing CPL integration tests pass with `BrandOSLegacyIntelligenceProvider` wired
- `translateContextToBlueprint()` snapshot regression tests pass for a representative set of production-like `IBrandCognitionContext` fixtures
- `buildBlueprint()` P99 latency within 5% of current `resolveBrandCognitionContext()` latency (no added overhead)
- No changes to any route handler or existing test behavior

---

#### E2-4 — `IntelligenceOSProvider` (IOS-Side Adapter)

**Location:** `packages/intelligence-os/src/compat/IntelligenceOSProvider.ts`

> **Correction (post-1.0, per `ARCHITECTURE_REVIEW_E2-0.md`):** this file's location, as originally specified, sits inside the IOS package tree while its consumer (`CPLOrchestrator`) sits in BrandOS's tree — a relative import between them only resolves if both trees share one workspace. That implicit assumption is what produced the (now-superseded) E2-0 monorepo-consolidation prerequisite. The class still lives at this path *within the IOS repository*, but it must be exported from IOS's public `index.ts` (the same way `InProcessEventBus` already is) and consumed by BrandOS via an ordinary versioned-package import — `import { IntelligenceOSProvider } from '@brandos/intelligence-os'` against a published version, not a workspace-relative path. No change to the class's logic; only to how the other side resolves it.

**Purpose:** Implements `IIntelligenceProvider` by delegating to `IntelligenceOS`. This is the class BrandOS will eventually use as its active provider in Epic 3.

**Important:** This class must not import from `@brandos/contracts` directly. It imports from `@brandos/shared-intelligence-types` only. The interface type (`IIntelligenceProvider`) is structurally compatible (TypeScript structural typing) — no nominal type dependency on BrandOS.

```typescript
// packages/intelligence-os/src/compat/IntelligenceOSProvider.ts

import type {
  ArtifactBlueprintResult,
  IntelligenceBlueprintRequest,
  IntelligenceFeedbackEvent,
  IntelligenceSummary,
  IntelligenceProjectInput,
  IntelligenceKnowledgeAssetInput,
} from '@brandos/shared-intelligence-types';
import type { IntelligenceOS } from '../IntelligenceOS';
import type { IntelligenceEventBus } from '../events/IntelligenceEventBus';

export class IntelligenceOSProvider {
  constructor(private readonly ios: IntelligenceOS) {}

  async buildBlueprint(
    request: IntelligenceBlueprintRequest
  ): Promise<ArtifactBlueprintResult> {
    const blueprint = await this.ios.buildBlueprint({
      userId: request.userId,
      workspaceId: request.workspaceId,
      projectId: request.projectId ?? undefined,
      artifactType: request.artifactType,
      audienceRef: request.audienceRef ?? undefined,
    });
    return translateBlueprintToResult(blueprint);
    // Maps ArtifactBlueprint (IOS internal) → ArtifactBlueprintResult (shared contract)
  }

  async recordFeedbackEvent(event: IntelligenceFeedbackEvent): Promise<void> {
    await this.ios.recordFeedbackEvent(event);
  }

  async ingestKnowledgeAsset(
    asset: IntelligenceKnowledgeAssetInput,
    rawContent?: string
  ): Promise<string> {
    return this.ios.ingestKnowledgeAsset(asset, rawContent);
  }

  async upsertProject(input: IntelligenceProjectInput): Promise<string> {
    return this.ios.upsertProject(input);
  }

  async reviewLearning(
    userId: string, learningId: string, approved: boolean, reviewedBy: string
  ): Promise<void> {
    return this.ios.reviewLearning(userId, learningId, approved, reviewedBy);
  }

  async getBrandSummary(params: { userId: string; workspaceId?: string }): Promise<IntelligenceSummary> {
    return this.ios.getBrandSummary(params);
  }

  get eventBus(): IntelligenceEventBus {
    return this.ios.eventBus;
  }
}
```

**Acceptance criteria:**
- `IntelligenceOSProvider` implements `IIntelligenceProvider` structurally (TypeScript compiles)
- `RULE-IOS-ISOLATION` still passes: no import from `@brandos/contracts` or any `@brandos/*` implementation package
- Integration tests: `IntelligenceOSProvider.buildBlueprint()` returns a valid `ArtifactBlueprintResult` against the test Supabase project
- `IntelligenceOSProvider.reviewLearning()` delegates to `IntelligenceOS.reviewLearning()` (E1-1 dependency)
- `IntelligenceOSProvider.getBrandSummary()` delegates to `IntelligenceOS.getBrandSummary()` (E1-3 dependency)

---

#### E2-5 — CPL Provider Wiring (BrandOS-side, no behavior change)

**Location:** `packages/control-plane-layer/src/orchestrator.ts`

**Change:** Wire `IIntelligenceProvider` as the orchestrator's intelligence dependency. `BrandOSLegacyIntelligenceProvider` is the active implementation. Production behavior is identical.

```typescript
// packages/control-plane-layer/src/orchestrator.ts — the only behavioral change

// BEFORE:
const context = await resolveBrandCognitionContext({ workspaceId });
// context passed to ContractAssemblerFactory

// AFTER (Milestone 1 equivalent — same output, different code path):
const blueprint = await this.intelligenceProvider.buildBlueprint({
  userId: request.userId,
  workspaceId: request.workspaceId,
  projectId: request.projectId,
  artifactType: request.taskType,
  audienceRef: request.audienceRef,
});
// blueprint passed to ContractAssemblerFactory
```

`IdentityContributor` in OCL is updated to accept `ArtifactBlueprintResult | IBrandCognitionContext` (union type during transition). The union is not collapsed until Epic 3 Milestone 4.

**Acceptance criteria:**
- All existing BrandOS route integration tests pass with no behavior change
- `CPLOrchestrator` accepts `IIntelligenceProvider` as a constructor dependency (injectable)
- `BrandOSLegacyIntelligenceProvider` is the default (wired in `initCPL()`)
- `IdentityContributor` accepts the union type and maps both to the same output
- No route handler files are modified

---

#### E2-6 — Boundary Rule Additions

**Location:** `scripts/check-boundaries.mjs`

New rules to add (from source analysis Section 8.2 and Appendix):

| Rule ID | Constraint |
|---|---|
| `RULE-IOS-ISOLATION` | `@brandos/intelligence-os` must NOT import from any `@brandos/*` implementation package. Allowed: `@supabase/supabase-js`, `@brandos/shared-intelligence-types`. |
| `RULE-SIT-ISOLATION` | `@brandos/shared-intelligence-types` must NOT import from any `@brandos/*` package. |
| `RULE-IOS-CPL-ONLY` | `apps/web` routes must NOT import `@brandos/intelligence-os` directly. Extend `FORBIDDEN_IN_ROUTES`. |
| `RULE-IOS-OCL-NONE` | `@brandos/output-control-layer` must NOT import `@brandos/intelligence-os`. |

**Acceptance criteria:**
- All four rules pass in CI with zero violations after implementation
- `check-boundaries.mjs` documents each rule with a comment citing its source (the Appendix in the strategy document)

---

### Epic 2 Deliverables Summary

| Item | Owner | BrandOS changes | Sprint estimate |
|---|---|---|---|
| E2-1 Shared type package | Both (coordinate) | New package (additive) | 0.5 sprints |
| E2-2 `IIntelligenceProvider` interface | BrandOS | `@brandos/contracts` addition | 0.25 sprints |
| E2-3 `BrandOSLegacyIntelligenceProvider` | BrandOS | New file in CPL | 0.5 sprints |
| E2-4 `IntelligenceOSProvider` | IOS | New file in IOS | 0.5 sprints |
| E2-5 CPL provider wiring | BrandOS | `orchestrator.ts` + `IdentityContributor` | 0.5 sprints |
| E2-6 Boundary rules | BrandOS | `check-boundaries.mjs` | 0.25 sprints |

**Total estimate:** 1.5–2 sprints. E2-1 and E2-2 must be done first (they define the contract). E2-3, E2-4, E2-5 proceed in parallel after E2-1/2. E2-6 can be done at any point.

### Epic 2 Dependencies

- Epic 1 exit criteria must be met
- E2-4 (`IntelligenceOSProvider`) depends on E1-1 and E1-3 (the methods it delegates to)
- E2-5 (CPL wiring) depends on E2-3 (`BrandOSLegacyIntelligenceProvider`)
- E2-1 requires a coordination meeting between both teams to agree on type shapes before implementation begins

### Epic 2 Risks

**Risk — Translation fidelity in `BrandOSLegacyIntelligenceProvider`:** The `translateContextToBlueprint()` function is the most sensitive piece. If it produces subtly different `voiceDirectives` than the current `IBrandCognitionContext` path, artifact quality may regress without being immediately obvious. Mitigation: snapshot regression tests with production-like fixtures, verified before merging E2-3.

**Risk — `IdentityContributor` union type maintenance:** The union `ArtifactBlueprintResult | IBrandCognitionContext` in OCL creates two code paths. Both must be maintained until Epic 3 Milestone 4 collapses the union. Risk of one path silently drifting. Mitigation: both paths covered by regression tests; the union is collapsed as early as Milestone 4 allows.

### Epic 2 Acceptance Criteria (Epic-Level)

- `IIntelligenceProvider` is defined in `@brandos/contracts` and exported
- `@brandos/shared-intelligence-types` is a zero-dependency package with all required types
- `BrandOSLegacyIntelligenceProvider` is wired as active provider in CPL with no behavior change
- `IntelligenceOSProvider` is implemented and passes IOS integration tests
- All four boundary rules pass in CI
- All existing BrandOS tests pass (including route integration tests)

### Epic 2 Exit Criteria

All of the following must be true before Epic 3 begins:

1. `IIntelligenceProvider` in `@brandos/contracts` — merged and compiling
2. `@brandos/shared-intelligence-types` — merged with all types
3. `BrandOSLegacyIntelligenceProvider` — merged, regression-tested, wired as active provider
4. `IntelligenceOSProvider` — merged, integration-tested against test Supabase project
5. `IdentityContributor` — accepting union type, both paths regression-tested
6. All four `RULE-IOS-*` boundary rules — passing in CI with zero violations
7. No BrandOS behavior change detectable in any existing test

---

## Epic 3 — BrandOS Adoption

### Objective

Replace `@brandos/brand-intelligence` with `IntelligenceOSProvider` as the active intelligence provider in BrandOS. This is a controlled, rollback-safe substitution that preserves the existing CPL proxy surface, all existing route behavior, and all existing artifact quality characteristics. After this epic, `@brandos/brand-intelligence` is retired.

### Scope

All work is in BrandOS packages. IntelligenceOS does not change (unless a gap is discovered during validation, in which case it is addressed in IOS and Epic 3 is paused until resolved).

**This epic assumes Epic 1 and Epic 2 are fully complete and all exit criteria are met.**

### Epic 3 is NOT responsible for

- Closing any IOS capability gap (that was Epic 1)
- Defining the `IIntelligenceProvider` interface (that was Epic 2)
- Implementing `IntelligenceOSProvider` (that was Epic 2)

---

### Milestones

Epic 3 is organized into four sequential milestones from the source analysis (Section 6). Each milestone is independently deployable and independently reversible.

---

#### E3-M1 — Feature Flag & Dual-Write

**Objective:** Wire `IntelligenceOSProvider` as an alternate provider behind a workspace-granular feature flag. Enable dual-write to seed IOS data without affecting production behavior.

**Database migration:**
```sql
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS intelligence_provider TEXT
  DEFAULT 'legacy'
  CHECK (intelligence_provider IN ('legacy', 'shadow', 'ios'));
```

**CPL change (`orchestrator.ts`):**
```typescript
// Select provider based on workspace flag
const provider =
  workspaceSettings.intelligence_provider === 'ios'
    ? this.iosProvider
    : workspaceSettings.intelligence_provider === 'shadow'
      ? this.shadowProvider  // calls both; uses legacy output
      : this.legacyProvider;

const blueprint = await provider.buildBlueprint(request);
```

**Dual-write (fire-and-forget, flag='legacy'):**
```typescript
// Always record feedback in IOS for data seeding (non-blocking)
if (this.iosProvider && event.userId) {
  this.iosProvider.recordFeedbackEvent(event).catch(err =>
    logger.warn('IOS dual-write non-blocking failure', err)
  );
}
```

**Files modified:**
- `packages/control-plane-layer/src/orchestrator.ts`
- Database migration (workspace_settings)

**Files created:**
- `packages/control-plane-layer/src/intelligence/IntelligenceOSProvider.ts` (instantiates IOS via factory)

**Acceptance criteria:**
- Flag defaults to `'legacy'` for all workspaces; production behavior unchanged
- Dual-write `recordFeedbackEvent()` to IOS is fire-and-forget; IOS failure is logged, not thrown
- Monitoring: IOS dual-write error rate logged per workspace
- IOS dual-write can be disabled per workspace (by setting `intelligence_provider = 'legacy'`)
- All existing tests pass

---

#### E3-M2 — Shadow Mode & Parity Validation

**Objective:** For opted-in workspaces, run both providers and compare blueprint outputs. Use legacy output for actual generation. Validate IOS parity before cutover.

**Shadow mode mechanics (`flag='shadow'`):**
```typescript
// When flag='shadow':
const [legacyBlueprint, iosBlueprint] = await Promise.allSettled([
  this.legacyProvider.buildBlueprint(request),
  this.iosProvider.buildBlueprint(request),
]);

// Use legacy output for generation regardless
const blueprint = legacyBlueprint.status === 'fulfilled'
  ? legacyBlueprint.value
  : createDegradedBlueprint(request);

// Log IOS output for comparison (non-blocking)
if (iosBlueprint.status === 'fulfilled') {
  this.telemetry.logBlueprintComparison(legacyBlueprint.value, iosBlueprint.value, request);
} else {
  logger.warn('Shadow IOS blueprint failed', iosBlueprint.reason);
}
```

**Parity exit criterion (from source analysis Section 6, Milestone 3):** IOS blueprint voice directives must produce governance scores ≥ legacy context for the same requests. Target: ≥ 95% parity over a 2-week shadow run on internal workspaces.

**Rollout:** Enable `flag='shadow'` for internal (Anthropic/team) workspaces only. Collect 2 weeks of telemetry.

**Monitoring dashboard required:**
- Per-workspace: governance score distribution (legacy vs. IOS)
- P95 latency: `buildBlueprint()` for legacy and IOS
- IOS error rate in shadow mode
- Parity score: % of requests where IOS score ≥ legacy score

**E3-M2 exit criterion:**
- ≥ 95% parity score over 14 days on internal workspaces
- IOS `buildBlueprint()` P95 latency ≤ 200ms (shadow mode does not block on IOS)
- IOS error rate in shadow mode < 1%

---

#### E3-M3 — Progressive Rollout (`flag='ios'`)

**Objective:** Make IntelligenceOSProvider the active provider for production workspaces in a controlled, reversible rollout.

**Rollout sequence:**
1. Internal workspaces only (1–2 workspaces) — 1 week
2. 10% of production workspaces — 1 week
3. 25% — 1 week
4. 50% — 1 week
5. 100% — 2 weeks observation

**Rollback trigger:** Any of the following automatically rolls back the affected workspace to `flag='legacy'`:
- Governance score average drops > 3% vs. legacy baseline for the workspace
- CPL request error rate increases > 0.5% for the workspace
- User-initiated rollback request from workspace admin

**Rollback procedure (operator):**
```sql
UPDATE workspace_settings
SET intelligence_provider = 'legacy'
WHERE workspace_id = '<affected_workspace_id>';
```

No code deploy required.

**Files modified in E3-M3:**
- None (rollout is configuration-only via workspace flag)
- Monitoring dashboards updated

**OCL cleanup (when workspace share on 'ios' > 95%):**  
`IdentityContributor` union type (`ArtifactBlueprintResult | IBrandCognitionContext`) can be narrowed. However, **do not collapse the union until Milestone 4 (100% on 'ios' and 2 weeks stable)**. Premature collapse prevents rollback to legacy.

**E3-M3 exit criterion:**
- 100% of workspaces on `intelligence_provider = 'ios'` for ≥ 2 weeks
- Zero forced rollbacks for ≥ 2 consecutive weeks
- Governance score distribution unchanged from legacy baseline (within 2%)
- CPL P95 latency within 10% of legacy baseline

---

#### E3-M4 — `@brandos/brand-intelligence` Retirement

**Objective:** Remove the legacy provider, retire the BrandOS BI tables, and remove `@brandos/brand-intelligence` from the monorepo.

**Pre-conditions (all must be true):**
- E3-M3 exit criteria met
- No workspace on `intelligence_provider = 'legacy'` for ≥ 2 weeks
- Data migration script validated on staging

**Data migration:**  
Export `brand_memory_entries` and `identity_signals` → `intelligence.learnings` for any workspace that was never on IOS primary. Mapping: A-class entries → VALIDATED learning with `stability_class=permanent`; B-class → `long_term`; C/D/E → `medium_term` (note: per the Implementation Guide Appendix finding #1, confirm the real source classification is 3-valued (`A`/`B`/`C`) before finalizing this mapping — the C/D/E branch above may not apply). Taxonomy category: `personal_brand_signal` (fallback) — **with one refinement (per ADR-001):** any `identity_signals` row whose payload carries visual-dimension data (colors, fonts, layout — the same fields E1-4's corrected design extracts going forward) should migrate its visual fields into the row's `extractedVisualFeatures`-equivalent structure (or a dedicated visual-flavored `Learning`, per however E1-4 ultimately persists this data) rather than collapsing them into the same flat `personal_brand_signal` text-shaped row as non-visual signals. This keeps migrated historical data structurally consistent with what the corrected E1-4 extractor produces for new data, rather than creating two differently-shaped representations of the same kind of fact depending on when it was learned. This is a refinement to the mapping logic within this existing task — it does not add a new migration step or change E3-M4's sequencing.

```sql
-- Drop in order (FK-safe):
DROP TABLE IF EXISTS public.identity_versions;
DROP TABLE IF EXISTS public.identity_signals;
DROP TABLE IF EXISTS public.brand_memory_entries;
```

**Files removed:**
- `packages/brand-intelligence/` — entire package
- `packages/control-plane-layer/src/intelligence/BrandOSLegacyIntelligenceProvider.ts`
- Legacy CPL proxy functions (`getBrandMemory`, `reviewBrandMemorySignal`, `resolveBrandCognitionContext` as they existed pre-Epic 2)

**Files modified:**
- `packages/control-plane-layer/src/orchestrator.ts` — remove legacy provider path and feature flag check
- `packages/output-control-layer/src/contributors/IdentityContributor.ts` — remove union type, accept `ArtifactBlueprintResult` exclusively
- `packages/contracts/src/index.ts` — remove `IBrandCognitionContext`, `IBrandIntelligenceRuntime`, and related BI types (after verifying no remaining consumers)
- `scripts/check-boundaries.mjs` — remove RULE-3, RULE-6, RULE-7 (CPL BI-specific rules; superseded by RULE-IOS-ISOLATION)
- `apps/web/instrumentation.ts` — remove `initBrandIntelligenceRuntime()` boot step
- `package.json` (root and CPL) — remove `@brandos/brand-intelligence` dependency

**Rules removed from `check-boundaries.mjs`:**
- `RULE-3` (CPL BI symbol allowlist) — no longer needed
- `RULE-6` (CPL ↛ concrete BI repos) — no longer needed
- `RULE-7` (CPL ↛ concrete BIRuntime class) — no longer needed

**Acceptance criteria:**
- `pnpm build` succeeds with `@brandos/brand-intelligence` removed
- All route integration tests pass
- All existing generation tests produce artifacts with governance scores within 2% of pre-retirement baseline
- `check-boundaries.mjs` passes with all new RULE-IOS-* rules and without the retired rules
- Database: `brand_memory_entries`, `identity_signals`, `identity_versions` tables do not exist
- `@brandos/brand-intelligence` does not appear in any `package.json`

---

### Epic 3 Deliverables Summary

| Milestone | Key change | Rollback | Risk |
|---|---|---|---|
| E3-M1 Feature flag + dual-write | DB migration, CPL wiring | Flag → 'legacy' | Low |
| E3-M2 Shadow mode | Telemetry + comparison | Disable shadow flag | Low |
| E3-M3 Progressive rollout | Config only (no code) | Flag per workspace | Medium |
| E3-M4 Retirement | Package removal, DB drops | None (irreversible) | Low (post-validation) |

**Total estimate:** 4–6 sprints including 4-week rollout observation period.

### Epic 3 Dependencies

- Epic 1 and Epic 2 exit criteria fully met
- IOS data seeded via dual-write (E3-M1 must run for ≥ 2 weeks before E3-M2)
- Shadow mode parity criterion met (E3-M2 must run for ≥ 2 weeks before E3-M3)
- Monitoring dashboards operational before E3-M2 begins

### Epic 3 Risks

**Risk — Latency regression (HIGH during E3-M2/M3):** `buildBlueprint()` adds a DB round-trip to the critical path. The current `resolveBrandCognitionContext()` path also makes a DB call, but IOS involves parallel domain fetches. Source analysis (Section 10, Risk 1) sets P95 target at ≤ 200ms for shadow mode, tightening to ≤ 100ms for full rollout. Monitor closely in E3-M2. If exceeded, introduce blueprint caching keyed by `(userId, artifactType, workspaceId)` with a 5-minute TTL before advancing to E3-M3.

**Risk — Data sparsity for early IOS workspaces (MEDIUM):** Workspaces that receive thin IOS data during dual-write (E3-M1) will start E3-M3 with sparse intelligence. Mitigation: IOS degrades gracefully (blueprints always return, `degraded=true` flag is set). However, artifact quality may be lower than legacy for the first few generations. The 2-week shadow validation period in E3-M2 provides a quality gate before any workspace is moved to 'ios'.

**Risk — Irreversibility of E3-M4 (LOW, manageable):** Table drops and package removal cannot be undone. Mitigation: the rollout period (E3-M3, 4+ weeks) provides a long observation window. E3-M4 only begins when zero rollbacks have occurred for 2 consecutive weeks.

### Epic 3 Acceptance Criteria (Epic-Level)

- `@brandos/brand-intelligence` package removed from monorepo
- `brand_memory_entries`, `identity_signals`, `identity_versions` tables dropped
- All BrandOS routes produce artifacts with governance scores within 2% of pre-migration baseline
- CPL P95 latency within 10% of pre-migration baseline (with IOS as sole provider)
- `IdentityContributor` reads `ArtifactBlueprintResult` exclusively (no union type)
- `IIntelligenceProvider` is the only intelligence abstraction in CPL
- All `RULE-IOS-*` boundary rules pass in CI

### Epic 3 Exit Criteria

The migration is complete when:

1. `@brandos/brand-intelligence` does not exist in the monorepo
2. `pnpm build` and all tests pass
3. No BrandOS route imports any BI runtime type or class
4. `check-boundaries.mjs` passes with only `RULE-IOS-*` rules governing intelligence boundaries
5. Intelligence schema tables are live and authoritative; BrandOS BI tables are absent
6. 30-day post-retirement monitoring shows no quality or latency regression

---

## Cross-Epic Reference Index

The following table maps every technical finding in the source analysis to the epic that acts on it. Cross-reference here rather than duplicating content.

| Source Analysis Section | Epic | Item |
|---|---|---|
| §3.1 Capability matrix — Missing: human review | Epic 1 | E1-1 |
| §3.1 Capability matrix — Partial: workspace scope | Epic 1 | E1-2 |
| §3.1 Capability matrix — Missing: brand summary | Epic 1 | E1-3 |
| §3.1 Capability matrix — VLM bridge (design corrected — see Epic 1 E1-4 note; now Knowledge Pipeline extraction, not an event bridge) | Epic 1 | E1-4 |
| §3.1 Capability matrix — A–E classification | Epic 1 | E1-5 |
| §5.1 IIntelligenceProvider interface | Epic 2 | E2-2 |
| §5.2 ArtifactBlueprint handoff type | Epic 2 | E2-1 |
| §5.3 CPL integration pattern | Epic 2 | E2-5 |
| §5.4 IdentityContributor adaptation | Epic 2 | E2-5; Epic 3 E3-M4 |
| §5.5 Dependency rule RULE-IOS-ISOLATION | Epic 2 | E2-6 |
| §6 Migration Milestone 1 | Epic 2 | E2-3, E2-4, E2-5 |
| §6 Migration Milestone 2 | Epic 3 | E3-M1 |
| §6 Migration Milestone 3 | Epic 3 | E3-M2 |
| §6 Migration Milestone 4 | Epic 3 | E3-M3 |
| §6 Migration Milestone 5 | Epic 3 | E3-M4 |
| §7.1 Target layer map | Epic 2 | E2-1, E2-2; Epic 3 E3-M4 |
| §7.3 Extraction path | Post-Epic 3 (future) | — |
| §8 Migration readiness checklist | All epics | Exit criteria sections |
| §9 Risks | All epics | Risk sections |
| §2.3 Boot sequence (instrumentation.ts) | Epic 3 | E3-M4 (remove BI boot step) |
| §2.5 Request flow | Epic 3 | E3-M1, E3-M2 (provider selection) |
| §2.6 Architectural rules (RULE-3, 6, 7) | Epic 3 | E3-M4 (rules retired) |

---

## Parallel Development Summary

| Period | BrandOS | IntelligenceOS |
|---|---|---|
| Epic 1 | GTM development continues unblocked. Zero dependency on IOS. | Closes capability gaps (E1-1 through E1-5). No BrandOS involvement needed. |
| Epic 2 | One coordination sprint: define `IIntelligenceProvider` and `@brandos/shared-intelligence-types`. Wire `BrandOSLegacyIntelligenceProvider`. No behavior change. GTM continues. | Implement `IntelligenceOSProvider`. Integration tests. |
| Epic 3 M1–M2 | Feature flag infrastructure, shadow mode, monitoring. GTM continues on all non-shadow workspaces. | No changes unless gap discovered in validation. |
| Epic 3 M3 | Progressive rollout. GTM continues on all workspaces (rollout is config-only). | No changes unless gap discovered in rollout. |
| Epic 3 M4 | Package retirement. One focused sprint. GTM can continue. | No changes. |

The only hard synchronization points between teams are:

1. **Epic 1 complete → Epic 2 can begin.** IOS team signals readiness; BrandOS team begins interface definition sprint.
2. **Epic 2 complete → Epic 3 can begin.** Both teams confirm exit criteria; BrandOS team drives Epic 3 independently.
3. **E1-4 VLM bridge:** No longer a cross-team synchronization point under the corrected design (see Epic 1, E1-4) — visual feature extraction is now entirely IOS-side Knowledge Pipeline work with no BrandOS coordination required.
