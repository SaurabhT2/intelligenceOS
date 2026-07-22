# Context Refresh Summary

> **Generated file — do not edit by hand.** Produced by `scripts/context/generate-consolidated.mjs`. This file intentionally has no wall-clock timestamp — see this file's generator header comment for why — so that two runs against the same source tree are byte-identical.

**Repository fingerprint:** `2110e59b5162ad4a` (sha256 of every parsed file's path + byte length, truncated). Compare this value across two runs to know whether anything this framework tracks changed.

## Corpus analyzed

- Packages: 6
- Source files parsed: 71
- Classes: 41
- Methods (across all classes): 183
- Declared event types: 15
- Event emit/on call sites: 13 emits, 4 handlers
- `intelligence.*` tables touched by code: 10
- Table access call sites: 37
- Stub markers (`new PhaseNotImplementedError`/`new DomainNotActivatedError`): 11
- Import-graph cycles: 0

## Artifacts produced this run

- [x] `.context/architecture.generated.md` — every narrative section (monorepo context through repository health), consolidated, with a table of contents.
- [x] `.context/architecture.generated.json` — every graph/JSON artifact (knowledgeGraph, fileLevelGraph, dependencyImpact, behaviorContracts, topicGraphs), sectioned by key.
- [x] `.context/context_refresh_summary.generated.md` (this file)

## Known gaps carried forward (see the "Repository Health" section of `architecture.generated.md` for detail)

- 11 stub method(s) across `ArtifactIntelligenceDomain`, `KnowledgeIntelligenceDomain`, `ProjectIntelligenceDomain`, `RelationshipIntelligenceDomain`, `WorkspaceIntelligenceDomain`.
- 6 event type(s) declared in `types/events.ts` with no in-repo emit site: `intelligence.conflict.detected`, `intelligence.conflict.recurring`, `intelligence.hypothesis.created`, `intelligence.hypothesis.promoted`, `intelligence.learning.confirmed`, `intelligence.project.updated`.
- 1 CognitionContext field(s) with no implemented contributor: `CognitionContext.visualIdentity`.

## How to regenerate

```bash
pnpm context:generate   # regenerate architecture.generated.{md,json} + this file
pnpm build              # runs context:generate automatically, then the workspace build
```
