# Handoff: Knowledge Lifecycle Completion (Cold-Start Concurrency + Contribution Scoring)

**Date:** 2026-07-23
**Author:** AI agent, acting on a task brief titled "BrandOS ↔ IntelligenceOS Knowledge Lifecycle
Completion" plus a follow-up scoping decision from the project owner (see §3).
**Branch:** `feat/contribution-scoring-and-cold-start-fix` (off `main` @ `f5c17ee`) — PR #5, open.
**Companion PR:** `BOS#2` (`fix/library-ingestion-contribution-ui`) — depends on this PR; see its
own description for the BOS-side half of this work.
**Type:** Bug fix (Objective 4) + reframed feature (Objective 2) + live database migration.
Production code changed; DB schema changed (additive).

---

## 1. Objective

The task brief (verbatim, six objectives) asked for:

1. Automatic knowledge ingestion with no manual "Analyze" click required.
2. Knowledge ingestion to produce real, cumulative learning — explicitly including confidence
   formation from a single document ("Document 1... creates an initial workspace opinion.
   Confidence: 0.63").
3. Fix the Library UI's broken PATCH/save flow.
4. Fix profile-rebuild concurrency conflicts.
5. Better observability.
6. An architecture review before any implementation.

Objective 6 was taken literally and done first — see §2. It surfaced that Objective 1's premise
was stale (auto-ingestion already existed) and that Objective 2 as literally specified directly
contradicts `ADR-005`. Both findings were raised with the project owner before any implementation;
§3 records the resulting decision. This document covers the `intelligenceOS`-side implementation
that followed. `BOS#2` covers the other repository's half (UI, route wiring).

## 2. Architecture Review (performed before implementation)

Full source-level read of both repositories' relevant paths, plus the live bug report (application
logs + Supabase table logs) the task brief was accompanied by. Key findings:

- **Auto-ingestion already existed.** `BOS`'s `apps/web/app/api/assets/route.ts` already
  fire-and-forgets `ingestWorkspaceKnowledgeAsset()` immediately after upload, for every non-image
  type, gated by prior work (`G-25`, `G-19`, `EM-2.1` per that file's own header). The perceived
  "must click Analyze" behavior traced to the Library page fetching assets once on mount and never
  again — a document sat at `processing` until manual refresh, which read as stuck.
- **Clicking Analyze on a still-auto-ingesting asset double-fires ingestion.** Confirmed
  against the bug report's own logs: 4 `POST /v1/knowledge/ingest` calls for 2 uploaded PDFs.
- **The resulting concurrent ingestions hit a genuine, previously-undetected thundering herd in
  `ProfileBuilder`.** `shouldRebuildForSubjectFromKnowledge()`/`shouldRebuildForSubject()` both
  correctly return `shouldRebuild: true` unconditionally when no profile exists yet for a Subject —
  but nothing prevented *multiple concurrent callers* from all observing that same null state and
  each independently starting a full `rebuildForSubject()`. The existing 3-attempt
  retry-on-`ProfileVersionConflictError` loop (correct for an occasional 2-way race) gets exhausted
  by a real 4-way cold-start burst, surfacing as the uncaught error in the bug report and leaving
  the Subject with **zero** profile until an unrelated later trigger happened to succeed alone.
  This is the direct root cause of `contribution = 0%` in the BrandOS UI: the rebuild that would
  have populated it kept dying.
- **`apps/assets/[id]/route.ts` (BOS) was dead, duplicate code** — a stale pre-`EM-2.1` copy of the
  VLM/document-analysis logic that predates the real implementation in `analyze/route.ts`, and
  never had `PATCH`/`DELETE` handlers. Root cause of the reported 405/JSON-parse crash; see
  `BOS#2` for the fix.
- **Objective 2 as literally specified conflicts with `ADR-005`.** The brief's own worked example
  (single document → confidence 0.63) is exactly the "direct Knowledge → Learning promotion
  shortcut" `ADR-005` and `docs/vision.md` §4 explicitly reject, on record, as a deliberate trust
  boundary — not an oversight. This was raised with the project owner rather than silently
  implemented or silently ignored.

Full detail of this review — including live inspection of `intelligence.hypotheses` and
`intelligence.knowledge_assets` confirming the corroboration gate is *working correctly*, not
broken, on real uploaded documents — is in the review conversation; the operative finding for this
implementation is the ADR-005 conflict above and the decision in §3.

## 3. Decision Record

Presented to the project owner as an explicit choice rather than assumed. Decision:

> Preserve the ADR-005 corroboration gate untouched. Reframe Objective 2: every ingestion must
> contribute *evidence* to workspace intelligence even when it doesn't create a trusted learning.
> Contribution should measure evidence added — knowledge graph growth, new concepts, relationships,
> terminology, confidence deltas, corroboration progress — not only finalized learnings. Fix the
> cold-start rebuild race. Fix the Library UI's ingestion/duplicate-ingestion/contribution
> reflection. Continue using the existing architecture and ADRs rather than replacing them.

This document and PR implement that decision, not the brief's original Objective 2 wording.

## 4. Implementation Summary

### 4.1 Cold-start profile rebuild race (Objective 4)

`ProfileBuilder.rebuildForSubject()` now holds an in-flight-Promise map
(`inFlightRebuilds`, keyed identically to the existing `pendingKnowledgeRebuilds` G-7 map). A
second (third, fourth...) concurrent call for the same Subject joins the first caller's Promise
instead of starting a competing `upsertProfile()` write — the actual rebuild work moved into a new
private `performRebuildForSubject()`, called through exactly one choke point.

Both trigger-decision methods were updated to consult the same map:
- `shouldRebuildForSubjectFromKnowledge()` — when it detects an in-flight rebuild, it now also
  schedules a G-7 trailing rebuild (reusing the existing mechanism), so a knowledge asset whose
  write wasn't visible to the in-flight rebuild's own read still gets picked up shortly after,
  rather than silently dropped until an unrelated future trigger.
- `shouldRebuildForSubject()` (Learning-triggered) — declines when a rebuild is in-flight, but has
  no trailing scheduler of its own to reuse (that mechanism is Knowledge-path-specific). Documented
  as a narrower fix and a real, scoped follow-up in §6 — not silently equivalent to the
  Knowledge-side fix.

The DB-level unique constraint (`intelligence_profiles_workspace_current` /
`intelligence_profiles_user_current`, both confirmed live — see §5) and the existing retry loop
remain as the correctness backstop for a multi-process deployment; this fix removes them as the
*only* protection for the common single-process case, which is what was actually failing.

### 4.2 Contribution scoring (Objective 2, reframed)

New `knowledge/ContributionScorer.ts` — a pure function, `computeContribution()`, run as a new
Stage 6 in `KnowledgeProcessor.process()` (between validation and persist). Computes a 0–100 score
from data the pipeline already produces by that point:

- **Volume** (55 of 100 points): term/framework/pattern counts, diminishing-returns-scaled.
- **Novelty** (45 of 100 points): `1 − corroborationScore` — `KnowledgeValidator`'s existing measure
  of vocabulary overlap with current assets.
- **Duplicate cap** (12 of 100 points, hard ceiling): when `KnowledgeValidator.isDuplicate` fires,
  regardless of volume.
- **`reasons: string[]`**: a short human-readable explanation trail, logged alongside the score
  (Objective 5) and surfaced to the BOS UI.

Deliberately reads **only** from `KnowledgeValidator`/`VocabularyExtractor`/`FrameworkExtractor`/
`PatternExtractor` output — never touches `EvidenceExtractor`, `HypothesisEngine`, or any
Hypothesis/Learning table. A document can score highly here while contributing nothing to identity
yet; that is the correct, designed behavior per the decision in §3, not a gap in this
implementation.

Persisted on `intelligence.knowledge_assets.contribution_summary` (new column, migration 008 —
applied live, see §5) and returned from `POST /v1/knowledge/ingest` as an **additive** `contribution`
field, via a new optional `KnowledgeIngestPort.getKnowledgeAssetContribution()` method (added
optional specifically so no existing caller of `createCognitionHttpServer` needs to change) —
`IntelligenceOS` implements it by reading back the just-persisted asset (safe because
`ingestKnowledgeAsset()` awaits `bus.emit()`, and `InProcessEventBus` awaits every listener before
resolving, so the row is guaranteed written by the time the HTTP handler asks for it).

### 4.3 Observability (Objective 5)

`KnowledgeProcessor`'s existing structured completion log gained a `contribution` stage in
`stageOutcomes` and two new fields: `contributionScore` and `contributionReasons` — the log line
now states *why* a document contributed what it did (novelty vs. overlap, duplicate match, volume),
not just a bare number.

## 5. Validation Performed

**Static/test validation (this repository):**
- `tsc --noEmit` — clean.
- `npm run build` (`tsc -p tsconfig.build.json`) — clean.
- `apps/api` `tsc --noEmit` (consumes the changed package) — clean.
- `npm run check:boundaries` — all 3 rules clean, 0 violations.
- Full test suite: **666/666 passing**, 44 files. 11 new tests: 4 in `ProfileBuilder.test.ts`
  directly reproducing the 4-concurrent-caller cold-start race and asserting exactly one
  `upsertProfile()` write occurs; 7 in the new `ContributionScorer.test.ts` covering the brief's own
  worked examples (novel-vs-duplicate, corroboration strengthening, score bounds, explainability).
  6 existing test files updated for the new required `contributionSummary` field / additive
  `contribution` response field / new `stageOutcomes` key.

**Live database validation (Supabase connector, this session):**
- Confirmed `intelligence_profiles_workspace_current` and `intelligence_profiles_user_current` are
  exactly the partial unique indexes the bug report's stack trace named — the concurrency fix
  targets the real constraint, not an assumed one.
- **Confirmed the bug live, independent of the code fix**: workspace
  `eaf3bd49-d1a0-4473-8832-10a32e1dfd8b` has 5 current `intelligence.knowledge_assets` rows
  (created `03:18:27`–`03:18:46` UTC, 2026-07-23) but its `intelligence.profiles` row has
  `updated_at == created_at` (`03:18:28`) — one rebuild won the cold-start race, the other ~4 never
  succeeded and were never retried. See `docs/agent-state.md` §6 item 0 for the full note. This
  workspace is a live, real smoke-test target for confirming the fix once deployed (§6).
- Applied migration 008 directly to the live project (`gzimytyjtidqtudqqhfx`). Verified via
  `information_schema.columns` (`contribution_summary`, `jsonb`, `NOT NULL`, default `'{}'::jsonb`)
  and `get_advisors(type=security)` — 0 new findings introduced by the change.

**Not validated this session:**
- No live end-to-end smoke test of the fix itself (upload → concurrent ingest → correct single
  rebuild → non-zero contribution in the BOS UI) — that requires `BOS#2` deployed alongside this PR
  and a real upload burst. Recommended as the first post-merge action; see §7.
- `apps/demo`/`apps/playground` were not typechecked or exercised — out of scope, this task didn't
  touch anything they depend on beyond what `apps/api`'s clean typecheck already covers structurally.

## 6. Remaining Work

Deliberately not built this session — scoped, not silently dropped:

1. **Objective 2, Phase 2 — evidence-candidate linkage.** The reframed contribution score (§4.2) is
   entirely synchronous, computed within `KnowledgeProcessor.process()`. The *other* half of "how
   much did this contribute toward identity, even before promotion" — how many identity-relevant
   evidence candidates `KnowledgeAssetEvidenceAdapter` actually built, and whether they corroborated
   an existing `Hypothesis` — lives in the separate, async, event-driven evidence bridge
   (`FeedbackProcessor.processKnowledgeEvidence()`), which runs *after* the HTTP response for
   `POST /v1/knowledge/ingest` has already returned. Wiring that into a "corroboration progress"
   readout (distinct from, and additive to, `contribution_summary`) is real, well-scoped follow-up
   work — likely a small update to `intelligence.knowledge_assets` (or a sibling record) written
   from inside `processKnowledgeEvidence()` itself, following the same descriptive-only discipline
   `ContributionScorer.ts` established. Not started because it requires touching
   `EvidenceExtractor`'s actual return shape, which this session only read, not modified — a
   correctness risk not worth taking without dedicated attention.
2. **Learning-triggered trailing rebuild scheduler.** `shouldRebuildForSubject()`'s fix (§4.1) is
   narrower than the Knowledge-side one by design, documented in code and in
   `docs/agent-state.md` §8. Build a Learning-side equivalent of G-7's trailing debounce only if
   this narrower fix proves insufficient in practice — no evidence yet that it is.
3. **Workspace `eaf3bd49-...`'s stale profile** (§5) will self-heal on its next natural trigger once
   this PR (and `BOS#2`) are deployed. If validating quickly is wanted, a one-off manual
   `rebuildForSubject()` invocation for that Subject would force it — not done this session to keep
   this PR's diff to the actual code/schema change, not an ad hoc data repair.

## 7. Known Risks

- **This PR and `BOS#2` are interdependent.** `BOS#2`'s `KnowledgeIngestClient` already defaults
  `contribution` to `null` if the server response omits it, so deploying `BOS#2` first (before this
  PR merges) is safe — it just won't show new UI content yet. Deploying this PR first is also safe
  — `contribution` is purely additive to the HTTP response. Merge order doesn't matter for
  correctness; both are needed together for the visible fix.
- **No live end-to-end smoke test yet** (§5) — static/unit validation is thorough, but the actual
  failure mode in the bug report (a real browser session, real concurrent uploads) hasn't been
  re-run against the fix. Recommend doing so before considering Objective 1/3/4 fully closed.
- **`shouldRebuildForSubject`'s narrower fix** (§6 item 2) is a known, accepted gap, not a
  discovered-too-late one — flagged here so it isn't mistaken for an oversight if it does turn out
  to matter.

## 8. Recommended Next Steps

See `docs/agent-state.md` §8's new item 0 for the prioritized list (merge both PRs together → smoke
test against the real stale workspace → Phase 2 → Learning-side scheduler if needed). This handoff
intentionally doesn't duplicate that list — `agent-state.md` is the document future sessions should
treat as current.
