# Archive

Everything under `docs/archive/` is **historical**. None of it is required
reading to work in this repository today, and none of it is kept current —
it is preserved because it explains *why* IntelligenceOS was designed the
way it was, not *how it works right now*. For current state, start at
[`docs/README.md`](../README.md).

Nothing here is deleted outright, per this consolidation's instructions to
preserve architectural knowledge and decision history. It's organized so a
reader can tell, from the folder alone, roughly how load-bearing a document
still is.

## `foundations/`

The original specification documents IntelligenceOS was built from —
written before any code existed, for a system originally called BrandOS.
Six documents, each already self-labeled inside as a "Historical
specification document" with a pointer to what supersedes it:

| Document | Why it's still worth opening |
|---|---|
| `Learning_Taxonomy.md` | The source of the 25-value `TaxonomyCategory` union and the §H exclusion framework the quarantine gate (`SignalExtractor.shouldQuarantine()`) implements. If you need to understand *why* a category has the stability class it has, this is the primary source — `ARCHITECTURE.md` only states the rule. |
| `Intelligence_Architecture.md` | The direct ancestor of the six-domain model. Explains the first-principles reasoning for domain boundaries that `ARCHITECTURE.md` now states as settled fact. |
| `Intelligence_Contracts.md` | §J's phase-by-phase activation model is more detailed than any summary elsewhere — the authoritative source for domain activation triggers (e.g. exactly what "Phase 2" means for `RelationshipIntelligenceDomain`). |
| `Logical_Intelligence_Schema.md` | The original 24-entity logical model. 16 entities made it into `types/entities.ts` as-is; this document is the record of the other 8 and why each was deferred, embedded, or dropped. The Postgres schema described here is superseded by `packages/intelligence-os/src/db/schema.sql` — never use this document for current column names. |
| `IntelligenceOS_Architecture.md` | The original engineering architecture spec (package structure, module boundaries) IntelligenceOS's repository layout descended from. |
| `Ownership_Audit.docx` | A capability-transfer audit (BrandOS → IntelligenceOS), cited by `ADR-001` as independent corroboration for the visual-intelligence decision. |

## `planning/`

Roadmaps, implementation guides, and analysis documents written *during*
Epic 1 and Epic 2 to plan and validate the work — all self-labeled
historical, all superseded by what's actually in the repository today.

| Document | What it was for |
|---|---|
| `Engineering_Roadmap.md` | The original three-epic plan (Epic 1: capability superset, Epic 2: BrandOS compatibility layer, Epic 3: BrandOS adoption). Epic 1 and 2 are complete; see `ROADMAP.md` for what's still open. |
| `Adoption_Strategy.md` | The source architectural analysis the Engineering Roadmap was reorganized from — BrandOS's runtime behavior as observed from its source code, and the original gap analysis against it. |
| `Implementation_Guide.md` | Validated the Roadmap and Adoption Strategy against real source code and expanded it into a task backlog. Records ten factual mismatches found between the planning documents and the code at the time — useful if you ever need to understand why a task was re-scoped mid-flight. |
| `Gap_Analysis_2026-06.md` | A point-in-time self-description audit (findings `G-1` through `G-12` — `G-12` added later, documenting a "implemented but disconnected" pattern distinct from `G-1`/`G-2`'s "actively misleading" tier). This file is updated in place with dated status banners rather than superseded by a new file when findings are resolved — `G-1`, `G-2`, `G-3`, `G-9`, `G-11`, and `G-12` are all marked resolved inline as of the Completion Mission session. The findings still open as of that session are carried forward into `IMPLEMENTATION_STATUS.md`'s Known Issues section, re-verified against current code rather than copied as-is. |
| `Architecture_Review_E2-0.md` | The review that found the original monorepo-consolidation prerequisite was an implementation assumption, not an architectural requirement — the reasoning behind why IntelligenceOS and BrandOS stayed separate repositories integrated through a published contract instead. |
| `BrandOS_Intelligence_Semantics_Analysis.md` | A deep semantic analysis of BrandOS's own learning model, used to design IntelligenceOS's Epic 1 features (especially the visual-intelligence and classification-compat work) natively rather than by porting BrandOS's implementation. |
| `Repository_Context_Strategy_Proposal.md` | **A proposal, not a shipped feature.** Describes a `.context/*.generated.md` tooling system (mechanically-generated repository-state snapshots) that was designed but never implemented — there is no `.context/` directory and no `pnpm context:generate` script in this repository. Kept because the design is still sound and worth revisiting if the repository grows past the size where hand-maintained docs stay accurate on their own; see `ROADMAP.md`. |
| `Repository_Read_Order_Detailed.md` | A longer, time-estimated version of the onboarding sequence now summarized in `ARCHITECTURE.md`'s Read Order section. Kept for the phase-by-phase detail (what question each step answers, roughly how long it takes) that didn't fit in the condensed version. |
| `Agent_Context_Placement_Note.md` | Explains the reasoning behind which directories get an `AGENT_CONTEXT.md` and why (bounded ownership unit + large/sensitive enough to need stated boundary rules). The placement table itself is now just a historical record of a one-time delivery step — the files already live where they belong, with one exception now tracked in `IMPLEMENTATION_STATUS.md`'s Known Issues. |

## `sessions/`

Snapshots of `IMPLEMENTATION_STATUS.md` as it stood at three earlier
project checkpoints, kept for continuity of the session-by-session record.
The current `docs/IMPLEMENTATION_STATUS.md` supersedes all three and is the
only one that should be read for current status.

| Document | Checkpoint |
|---|---|
| `StageGate_Epic1_Epic2_Boundary.md` | Stage Gate Review — the review that closed Epic 1 and reframed Epic 2 as platform publication rather than BrandOS integration. |
| `Session4_E1-2_PhaseC.md` | Session 4 — completed the workspace-scoped brand voice feature's final phase. |
| `Session5_Epic2_PlatformPublication.md` | Session 5 — Epic 2 platform-publication work: package renaming, `IIntelligenceProvider`, `ArtifactBlueprint.degraded`/`.confidenceScore`, boundary-check tooling. |
| `Session6_CompletionMission.md` | Session 6 — Completion Mission: closed Gap Analysis G-2 (the domain-ownership boundary violation, resolved in full — `pipeline/`/`knowledge/` no longer hold a raw `SupabaseClient`), wired up `POST /v1/knowledge/ingest` in both `apps/api` hosts (previously `501` in every real deployment), connected `intelligence.user.correction`'s handler side, and persisted `ArtifactBlueprint.degraded`/`.confidenceScore` to the schema. The Milestone 2–4 work (the `CognitionProvider`/HTTP contract layer, the `apps/*` runtime split) that preceded this session was never recorded in a dedicated status document before the prior documentation pass reconstructed it from source — this file is the first session record to build directly on that reconstruction rather than needing to redo it. |
