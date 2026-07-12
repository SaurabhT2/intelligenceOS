# Changelog

All notable changes to the IntelligenceOS workspace will be documented here. For
package-specific changes, see each package's own `CHANGELOG.md`
(`packages/intelligence-os/CHANGELOG.md`, `packages/shared-intelligence-types/CHANGELOG.md`).
`packages/cognition-contract` does not yet have its own changelog — see
`docs/IMPLEMENTATION_STATUS.md` Known Issues regarding this package's
current physical duplication across two repositories.

## Unreleased

### Fixed / Added
- Independent `ADR-003 Compliance Audit` verified against source and closed (see
  `packages/intelligence-os/CHANGELOG.md`'s `0.3.0` entry and
  `docs/IMPLEMENTATION_STATUS.md` §3, third session): closed findings D-1
  (dead `observationToWorkspaceLearning.ts`, deleted), D-3 (identity
  synthesis gained a Knowledge-sourced `identityConfiguration` input,
  symmetric with the existing `voiceConfiguration`), and D-4
  (`ingestWorkspaceConfiguration` promoted onto `IIntelligenceProvider`
  and exposed via a new `POST /v1/workspace-configuration` route).
  D-2 (three independent field-merge implementations) and D-5 (ordinary
  document-extracted Knowledge still has no path into Cognition — the
  largest remaining gap) recorded as Known Issues rather than closed;
  see `docs/IMPLEMENTATION_STATUS.md` §5 for why.

### Documentation

- Updated the documentation set for the Completion Mission session (see
  `packages/intelligence-os/CHANGELOG.md`'s `0.2.1` entry and
  `docs/IMPLEMENTATION_STATUS.md` §3): closed out the two Known Issues
  that session resolved (the domain-ownership boundary violation, and the
  un-wired Knowledge Ingest route), added the new Known Issue it surfaced
  (`intelligence.user.correction` has no emitter yet), and updated
  `ARCHITECTURE.md`'s domain-status table, boundary-rule list, and test
  counts to match. `docs/archive/sessions/Session6_CompletionMission.md`
  preserves the full session record.
- Consolidated the entire `docs/` tree (prior pass): replaced ~12,500
  lines of accumulated bootstrap, architecture, platform, roadmap,
  implementation-guide, and status documents (most self-describing as
  historical, several containing real drift against the code) with seven
  living documents (`ARCHITECTURE.md`, `PLATFORM_CONTRACT.md`,
  `INTEGRATION_GUIDE.md`, `IMPLEMENTATION_STATUS.md`, `ROADMAP.md`,
  `DEPLOYMENT.md`, plus the ADRs under `adr/`) and an organized `archive/`
  for everything historical. See `docs/archive/README.md` for what moved
  where.

## v0.2.1-workspace (cumulative, not independently versioned)

Corresponds to `@intelligence-os/core` `0.2.1` (Completion Mission
session). The workspace root itself is `private: true` and not
independently versioned.

### Fixed

- `intelligence.hypotheses`/`.learnings`/`.profiles`/`.knowledge_assets`
  writes now correctly route through their owning domain instead of a
  raw `SupabaseClient` held by pipeline/knowledge internals (Gap Analysis
  G-2, resolved in full). Mechanically enforced going forward via a new
  `RULE-PIPELINE-NO-DIRECT-DB` boundary-check rule.
- `POST /v1/knowledge/ingest` now works end-to-end on both `apps/api`
  entrypoints — previously returned `501` in every real deployment
  despite the underlying Knowledge Pipeline being fully implemented.

### Added

- `UserIntelligenceDomain`: real `upsertProfile()`/`insertLearning()`
  (previously stubs) plus a full Hypothesis CRUD surface.
- `KnowledgeIntelligenceDomain.persistExtracted()`,
  `ArtifactIntelligenceDomain.markSignalsExtracted()`.
- `ArtifactBlueprint.degraded`/`.confidenceScore` now persisted to
  `intelligence.artifact_blueprints` (schema updated; not yet applied to
  a live database in this environment).
- `FeedbackProcessor` now subscribes to `intelligence.user.correction`
  and routes it to `LearningValidator.maybeConfirm()` — the handler side
  only; there is still no public method that emits this event.

## v0.2.0-workspace (cumulative, not independently versioned)

Corresponds to `@intelligence-os/core` `0.2.0` (Epic 2 — Platform
Publication) plus the Milestone 2–4 work that followed it (see
`docs/IMPLEMENTATION_STATUS.md` §3 for why both an Epic and a Milestone
numbering scheme appear across this codebase).

### Added

- Standalone repository, independent of BrandOS's, with independent
  package boundaries (`@intelligence-os/core`, `@intelligence-os/shared-types`).
- `@platform/cognition-contract` — the cross-platform HTTP contract package,
  `CognitionProviderImpl`, `ContextBuilder`, and the HTTP route handler
  (`createCognitionHttpServer`) exposing the BrandOS ⇄ IntelligenceOS
  integration's HTTP routes. See `docs/PLATFORM_CONTRACT.md`.
- `apps/*` runtime layer (`api`, `demo`, `playground`) — see `ADR-002`.
- `IIntelligenceProvider` / `IntelligenceOSProvider` — the platform's
  published in-process provider contract and adapter.

### Changed

- npm scope renamed `@brandos/*` → `@intelligence-os/*`; all 14 event types
  unified under the `intelligence.*` namespace (previously 5 of 14 used
  `brandos.*`).
