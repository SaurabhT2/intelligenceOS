# Agent State

**Purpose:** a fast-onboarding snapshot for the next AI agent or engineer picking up this
repository. This document is meant to be read *second*, right after `docs/vision.md` and before
`docs/ARCHITECTURE.md`'s full detail — it should let you become useful in minutes, not hours.

**Maintenance contract:** update this document at the end of any significant architectural or
implementation task, per the project instructions' Multi-Agent Workflow. Re-verify against source
and the live database rather than copying the previous entry forward — this document rots exactly
the way `IMPLEMENTATION_STATUS.md`'s own maintenance note warns about if it isn't kept honest.

**Last verified against:** `intelligenceOS` @ `f5c17ee` (main), live Supabase project
`gzimytyjtidqtudqqhfx` ("IntelligenceOS"), 2026-07-22.

---

## 1. Current Architecture Summary

IntelligenceOS is a subject-centric intelligence platform (see `docs/vision.md`) consumed two ways:
in-process (`IIntelligenceProvider`, 6 methods) and over HTTP (`CognitionProvider`, 5 methods, the
cross-repository contract with BrandOS/`BOS`). Both are built from the same six Domain classes and
three pipeline orchestrators. The full, current, code-verified picture lives in
`docs/ARCHITECTURE.md` — this section is a compressed pointer into it, not a replacement.

- **Repository layout:** `packages/shared-intelligence-types` (IIntelligenceProvider boundary
  types) + `packages/cognition-contract` (CognitionProvider boundary types, physically duplicated
  in `BOS` — see §5) + `packages/intelligence-os` (the engine) + `apps/api` / `apps/demo` /
  `apps/playground` (deployable runtimes, per `ADR-002`).
- **The Learning Pipeline** (`Signal → Observation → Hypothesis → Learning`, `ARCHITECTURE.md` §9)
  is the one path any candidate piece of intelligence travels, regardless of subject type
  (`ADR-003`) or origin (`ADR-005`).
- **The Evidence/Identity Bridge** (`ADR-005`, most recent architectural work — see §3 below) lets
  Knowledge (uploaded documents today) feed that same pipeline as a new Stage 1 producer, without
  ever bypassing corroboration.
- **Database:** Supabase Postgres, `intelligence` schema, 13 tables. Live project
  `gzimytyjtidqtudqqhfx`. **Important, repository-specific caveat:** `schema.sql` and the numbered
  migration files in this repo are **not fully reconciled with the live project's actual schema** —
  several migrations (002, 004, 007 confirmed) have been applied directly via the Supabase MCP
  connector in past sessions, ahead of what a fresh read of `schema.sql` alone would suggest. Treat
  the live project as the current source of truth for "what columns actually exist," and
  `docs/IMPLEMENTATION_STATUS.md` §4 for the fullest currently-written account of the gap. This is
  flagged again in §6 below because it's the single highest-leverage piece of process debt in the
  repository right now.

## 2. Current Milestone

**Post-`ADR-005` (Evidence/Identity Bridge), pre-live-validation.** The bridge is implemented,
schema-verified live, and merged to `main` (PR #2). The Completion Plan's engineering scope
(`IMPLEMENTATION_STATUS.md` §3, fifth session) is closed. What remains is either genuinely blocked
outside this repository (cross-repo contract coordination, registry publish), a Product Question
(`audience`/`guidance` scoping), or the live end-to-end validation of `ADR-005` itself — see §4.

## 3. Recent Architectural Work

Most recent first. Full detail in each item's ADR and in `IMPLEMENTATION_STATUS.md` §3.

1. **`ADR-005` — Evidence/Identity Bridge (Implemented, merged via PR #2).** Added
   `EvidenceExtractor` (source-agnostic Stage 1 producer) and `KnowledgeAssetEvidenceAdapter` (the
   one Knowledge-specific file in the bridge) so uploaded documents' extracted
   frameworks/vocabulary in four identity-relevant taxonomy categories
   (`intellectual_frameworks`, `strategic_thinking_patterns`, `professional_identity`,
   `personal_brand_signal`) can corroborate a Hypothesis the same way Experience-side observations
   already do. Every downstream stage (`ObservationBuilder`, `HypothesisEngine`,
   `LearningValidator`, `ProfileBuilder`, `identitySynthesis.ts`) is unmodified. Added an additive
   `hypotheses.evidence_trail jsonb` column (migration 007) for full provenance, copied into
   `Learning.sourceSummary.evidenceTrail` on promotion. This review's independent architectural
   validation is recorded in `docs/handoffs/2026-07-22_initial_architecture_review.md`.
2. **`ADR-003` — Subject-Centric Intelligence (Implemented and audited-closed).** Generalized the
   Learning Pipeline from user-only to `SubjectRef`-based (User | Workspace), removing a
   second, weaker, hand-written workspace-scoped path that had been sitting beside the real
   pipeline instead of using it.
3. **`ADR-004` — Cognitive Consolidation.** Generalized `ProfileBuilder`/`IntelligenceProfile` to
   also read a Subject's Knowledge, not only its Experience, producing three of six previously-stub
   `CognitionContext` sections (`knowledge`, `reasoning`, `positioning`).
4. **`ADR-002` — `apps/` runtime layer.** Split runtime wiring out of `packages/intelligence-os`
   into `apps/api`/`apps/demo`/`apps/playground`; the migration gap this created was fully resolved
   in the fifth Completion Plan session (dev launcher removed, boundary-check carve-out removed).
5. **`ADR-001` — Visual Intelligence stays inside the existing six domains**, not a seventh domain.

## 4. Current Focus Areas

Nothing is currently in active development as of this document's last verification. The two most
useful next things to pick up, in order:

1. **Live end-to-end validation of the Evidence/Identity Bridge (`ADR-005`).** This is code-complete
   and schema-verified, but has **not yet been observed to produce a live, identity-relevant
   Hypothesis from a real document upload** — see §6, finding 1, for the concrete evidence and a
   recommended validation script. This is the single most valuable next investigation: it either
   confirms the bridge works end-to-end in production, or surfaces a real wiring gap while the
   context is still fresh.
2. **Reconcile `schema.sql`/migration files with the live Supabase project's actual schema**
   (§1's caveat, `IMPLEMENTATION_STATUS.md` §4) — a process-hygiene fix, not a design task.

## 5. Open Architectural Questions

Carried forward from `ROADMAP.md`/`IMPLEMENTATION_STATUS.md` §5–6, restated here for visibility —
each is a **Product Question**, not an engineering task, per those documents' own framing:

- **Scope `audience`/`guidance`** — the two `CognitionContext` sections neither `ADR-004` nor
  `ADR-005` addressed. `audience` likely extends the existing `AudienceProfile`/`AudienceCalibrator`;
  `guidance` has no obvious existing home yet.
- **Multi-Subject identity composition** — should a Workspace's identity ever additively include a
  named contributing User's identity? Explicitly deferred (`ADR-003` §5) until a genuinely
  multi-user consumer exists.
- **Positioning's Knowledge-side input** — `positioningSummary` is Experience-only by design
  (`ADR-004` §0.1); a Knowledge-side positioning extractor is valuable future work but a
  first-principles scoping decision, not a mechanical extension.
- **BrandOS's raw-signal review UI contract** — BrandOS needs a way to list reviewable signals for
  human approve/reject; the current contract only supports acting on an opaque id. No target
  direction decided yet (`PLATFORM_CONTRACT.md` §3).
- **A third Subject type** — explicitly not designed against speculatively (`ADR-003` §5); build
  when a real consumer demonstrates the need.

## 6. Known Technical Debt

In rough order of leverage. Items 1–2 are new findings from this review's independent validation
pass (database inspection); items 3+ are carried forward, re-verified against source, from
`IMPLEMENTATION_STATUS.md` §5.

1. **The Evidence/Identity Bridge has zero live corroboration to date.** Direct query of the live
   `intelligence.hypotheses` table (2026-07-22) shows two existing rows, both predating/outside the
   bridge's scope (`expertise_domains`, `success_metrics` — neither an identity-relevant category)
   and both with an empty `evidence_trail` (`trail_len: 0`). Of 23 live `intelligence.knowledge_assets`
   rows, the two with substantial extraction (`Edition 3 (1).pdf` — 122 vocabulary terms, 1
   framework; `ai-control-plane-executive-brief.pdf` — 22 terms) were independently inspected: in
   both cases the extraction correctly produced **no** identity-relevant evidence candidate — the
   one `intellectual_frameworks`-tagged term in each document fell below
   `KnowledgeAssetEvidenceAdapter`'s `MIN_VOCAB_ITEMS_PER_CATEGORY` (2) threshold, and the one
   extracted framework's confidence (0.4) fell below `FRAMEWORK_MIN_CONFIDENCE` (0.5). **This is the
   evidence-quality gate working exactly as designed on real data, not a bug** — but it also means
   the bridge's core promise (`identity:NO` → `identity:YES`) has not yet been observed live for any
   real Subject. Recommended validation: seed or upload a document with ≥2 recurring
   identity-relevant terms or one high-confidence (≥0.5) analytical/evaluative framework, and
   confirm a `Hypothesis` is created with a populated `evidence_trail`. See the handoff document for
   full detail.
2. **Two of this repository's own status documents contain internally stale claims about live
   migration state.** `ROADMAP.md`'s "Still not done" list (near-term section) still states
   `migrations/004_subject_centric_intelligence.sql` "has not been applied to any live Supabase
   project," and `IMPLEMENTATION_STATUS.md` §6's Recommended Next Steps item 2 still lists applying
   `schema.sql`/migrations 002/004/005 as "blocked purely on infrastructure access" — both
   contradicted by that same file's own §3 (sixth session) and §4, which correctly report
   `workspace_id`/`subject_type`/`evidence_trail` as confirmed live via the Supabase MCP connector.
   Independently reconfirmed live in this session (§1 above). Low-severity — the correct
   information exists elsewhere in the same document set — but exactly the kind of drift
   `docs/vision.md` §3 item 6 asks to be treated as a defect. Recommend a documentation pass to
   reconcile `ROADMAP.md`'s near-term list and `IMPLEMENTATION_STATUS.md` §6 with §3/§4's more
   current findings, and to note `ADR-005` as a partial closure of `ROADMAP.md`'s "ordinary
   document-extracted Knowledge still has no path into voice/identity synthesis" item (partial:
   identity only, via evidence/corroboration — not a direct field-mapping path, and `voice` remains
   untouched).
3. **`schema.sql`/migration-file reconciliation with the live project is incomplete** —
   carried forward from `IMPLEMENTATION_STATUS.md` §4. The live project is currently ahead of
   `schema.sql` for at least `hypotheses.workspace_id`/`subject_type`/`evidence_trail`. Treat the
   live project as ground truth until this is reconciled.
4. **`migrations/007_evidence_provenance.sql`'s own file header still reads "NOT YET EXECUTED,"**
   despite `IMPLEMENTATION_STATUS.md` and this session's independent verification confirming it was
   applied directly to the live project via the Supabase MCP connector. A future reader of the
   migration file in isolation (rather than the status doc) would be misled. Low-severity, easy fix:
   update the file's own header comment to record when and how it was actually applied, matching
   the convention the file's other comments already follow.
5. **`@platform/cognition-contract` is physically duplicated** between this repository and `BOS`,
   with no shared registry to resolve against. Needs coordinated cross-repository agreement; not a
   decision this repository can make alone.
6. **`ProjectInput.brandosProjectId`/`getProjectByBrandosId()` still carry one consumer's name** —
   a breaking public-contract change requiring coordinated `BOS`-side adoption, not a same-repository
   rename.
7. **Provenance comments will continue to rot slowly** — unchanged, low-urgency, best fixed
   incrementally as files are touched for unrelated reasons.
8. **The five seeded universal artifact patterns are undocumented outside raw SQL.**

## 7. Active Branches and Pull Requests

As observed at the start of this session (`git branch -a` / `git log`, `intelligenceOS`):

| Branch | Status |
|---|---|
| `main` | Current, `f5c17ee` — includes `ADR-005` (merged via PR #2) and the `fix/subject-identity-ownership` fix (merged via PR #1). |
| `feature/knowledge-identity-evidence-bridge` | Merged into `main` via PR #2. Stale remote ref; safe to delete once confirmed merged. |
| `fix/subject-identity-ownership` | Merged into `main` via PR #1. Stale remote ref; safe to delete once confirmed merged. |
| `docs/architecture-review-and-bootstrap` | **New, this session.** Adds this document, `docs/vision.md`, and the handoff below. Not merged — see the handoff document's recommended next steps. |

`BOS` (companion repository) at the time of this review: `main` @ `f3fff4c`, with
`fix/subject-identity-ownership` merged via its own PR #1 (mirrors the `intelligenceOS`-side fix on
the consumer side). No open branches beyond `main` observed.

## 8. Recommended Next Priorities

Ordered by leverage relative to effort, consistent with `IMPLEMENTATION_STATUS.md` §6 and
`docs/vision.md` §5, with this review's findings folded in:

1. **Run the `ADR-005` live-validation script** described in §6 item 1 / the handoff document —
   highest leverage: either confirms the most recent major architectural investment works end to
   end, or surfaces a real gap while full context is still available.
2. **Reconcile `ROADMAP.md` and `IMPLEMENTATION_STATUS.md` §6 with their own §3/§4 findings**
   (§6 item 2) and fix migration 007's stale header (§6 item 4) — small, mechanical, removes a
   standing source of confusion for the next agent.
3. **Scope `audience`/`guidance`** — a Product Question, but the next substantive piece of the
   `CognitionContext` target shape.
4. **Resolve `@platform/cognition-contract` duplication** with `BOS` maintainers.
5. Everything else in `IMPLEMENTATION_STATUS.md` §6 and `ROADMAP.md`'s longer-term section, in the
   order those documents already specify.
