# IntelligenceOS — Repository Read Order

This is the optimal onboarding sequence for an engineer or AI agent who has never seen this repository, BrandOS, or any related system before. It assumes nothing except the ability to read TypeScript and SQL. Each step lists *why* it comes where it does and *what question it answers* — so if you're resuming mid-sequence, you can tell which question you've already had answered.

This sequence is reproduced in condensed form inside `INTELLIGENCEOS_BOOTSTRAP.md` §9. This standalone version exists because read-order is something a tool can also drive directly (e.g., an onboarding script that opens each file in sequence) — keep both in sync if either changes; the generated `repository_context.generated.md` (see Repository Context Strategy) is the right place to mechanically verify the file list referenced below still exists and hasn't moved.

---

### Phase 0 — Orientation (no code yet)

| Step | Read | Answers |
|---|---|---|
| 1 | `INTELLIGENCEOS_BOOTSTRAP.md`, start to finish | What is this system for, what are its core concepts, what are its hard rules? |
| 2 | `.context/repository_context.generated.md` (once it exists — see Repository Context Strategy) | What does the repository look like *right now*, exactly — current package list, current public API surface, current test summary? |

Do not open any `.ts` file before finishing step 1. Almost every source file's docblock assumes you already know the vocabulary the bootstrap defines (Signal, Observation, Hypothesis, Learning, domain, Blueprint) — reading code first means re-deriving that vocabulary the hard way, file by file.

### Phase 1 — The contract (15 minutes)

| Step | Read | Answers |
|---|---|---|
| 3 | `packages/shared-intelligence-types/src/ArtifactRequest.ts` | What does a calling system send IntelligenceOS to ask for a blueprint? |
| 4 | `packages/shared-intelligence-types/src/ArtifactBlueprint.ts` | What does IntelligenceOS hand back? This is the richest type in the whole boundary — spend real time here. |
| 5 | `packages/shared-intelligence-types/src/FeedbackEvent.ts` | What does a calling system report back after an artifact is delivered? |
| 6 | `packages/shared-intelligence-types/src/index.ts` | Confirms there's nothing else in this package you missed. |

After this phase, you know everything the *outside world* knows about IntelligenceOS — which is a deliberately small, complete picture. Everything from here on is "how does the inside actually produce and consume that contract."

### Phase 2 — The entry point (20 minutes)

| Step | Read | Answers |
|---|---|---|
| 7 | `packages/intelligence-os/src/IntelligenceOS.ts` | What are the four things you can ask this system to do, and what gets constructed to make that possible? |
| 8 | `packages/intelligence-os/src/index.ts` | What, exactly, is exported for outside use — confirm it matches what `IntelligenceOS.ts`'s own docblock claims. |
| 9 | `packages/intelligence-os/src/errors.ts` | What does it look like when something is deliberately not implemented yet, versus genuinely broken? |

By the end of Phase 2 you should be able to answer: "if I call `buildBlueprint()` right now against an empty database, what happens?" (Answer: it still returns a valid blueprint — confirm you understand *why* before moving on; if you can't yet, re-read `IntelligenceOS.ts`'s docblock.)

### Phase 3 — The shape of everything (30–45 minutes)

| Step | Read | Answers |
|---|---|---|
| 10 | `packages/intelligence-os/src/types/entities.ts` | What does the system actually persist, and in what shape? |
| 11 | `packages/intelligence-os/src/types/domains.ts` | What does each domain's *internal* input/filter API look like (as opposed to the cross-boundary contract from Phase 1)? |
| 12 | `packages/intelligence-os/src/types/events.ts` | What can the system tell an observer is happening, and with what payload? |
| 13 | `packages/intelligence-os/src/db/schema.sql`, fully, including comments | What does this look like as an actual Postgres schema — tables, RLS, seed data? Read the comment at the top about `GRANT`/exposed-schemas; you'll need it if you ever stand up a real instance. |

This phase is the longest single read in the sequence and that's appropriate — it's the part of the system that changes the least often and that every other file assumes you already understand.

### Phase 4 — The persistence boundary (30 minutes)

| Step | Read | Answers |
|---|---|---|
| 14 | `packages/intelligence-os/src/domains/AGENT_CONTEXT.md` | What's the rule, and what's the one already-broken instance of it I should know about before I go further? |
| 15 | `packages/intelligence-os/src/domains/UserIntelligenceDomain.ts` | The richest, best-commented domain — read it as the template for how the other five should look. |
| 16 | The remaining five domain files, in this order: `ProjectIntelligenceDomain.ts` → `ArtifactIntelligenceDomain.ts` → `KnowledgeIntelligenceDomain.ts` → `WorkspaceIntelligenceDomain.ts` → `RelationshipIntelligenceDomain.ts` | Same shape, decreasing completeness — ending on the one domain that's entirely inert by design. |

By the end of this phase you should be able to state, for each of the six domains, whether it's fully live, partially live, or fully deferred, and why — without looking anything up.

### Phase 5 — How a piece of feedback becomes durable knowledge (45–60 minutes)

| Step | Read | Answers |
|---|---|---|
| 17 | `packages/intelligence-os/src/pipeline/AGENT_CONTEXT.md` | What's this pipeline's job, and what's the one safety property (the quarantine gate) I must not casually weaken? |
| 18 | `packages/intelligence-os/src/pipeline/types.ts` | What does a `Signal` and an `Observation` actually look like? |
| 19 | `SignalExtractor.ts` → `ObservationBuilder.ts` → `HypothesisEngine.ts` → `LearningValidator.ts` → `ProfileBuilder.ts`, in that order | Each class's piece of the Signal → Profile chain, in the order data actually flows through them. |
| 20 | `FeedbackProcessor.ts`, last | How all five of the above get wired together and run off the event bus, with per-stage failure isolation. |

### Phase 6 — How a request becomes a Blueprint (45–60 minutes)

| Step | Read | Answers |
|---|---|---|
| 21 | `packages/intelligence-os/src/blueprint/AGENT_CONTEXT.md` | What's this pipeline's job, and what's the one guarantee (always returns a usable blueprint) I must preserve in anything I add? |
| 22 | `internal/defaults.ts` → `internal/conflictDetection.ts` | What do the fallback values look like, and what counts as a detectable conflict? |
| 23 | `ProjectContextBuilder.ts` → `AudienceCalibrator.ts` → `StructurePlanner.ts` → `NarrativePlanner.ts` → `ConflictResolutionModel.ts`, in that order | Each planning step, in the order `BlueprintBuilder` actually calls them. |
| 24 | `BlueprintBuilder.ts`, last | The full assembly sequence, including the parallel Step-1 fetch and the fire-and-forget persistence/event-emission at the end. |

### Phase 7 — How an upload becomes structured knowledge (30–45 minutes)

| Step | Read | Answers |
|---|---|---|
| 25 | `packages/intelligence-os/src/knowledge/AGENT_CONTEXT.md` | What's this pipeline's job, and where does its one known boundary violation live? |
| 26 | `types.ts` → `KnowledgeAssetExtractor.ts` → `VocabularyExtractor.ts` → `FrameworkExtractor.ts` → `PatternExtractor.ts` → `KnowledgeValidator.ts`, in that order | Each extraction step, in pipeline order. |
| 27 | `KnowledgeProcessor.ts`, last | The full orchestration, and the specific spot (`persistAsset()`) where the boundary violation from step 25 actually happens — confirm you can point to the exact line. |

### Phase 8 — Tying it together (15–20 minutes)

| Step | Read | Answers |
|---|---|---|
| 28 | `packages/intelligence-os/src/events/AGENT_CONTEXT.md` and `IntelligenceEventBus.ts` | What's the actual mechanism connecting "an event got emitted" to "a pipeline ran"? |
| 29 | `packages/intelligence-os/src/db/AGENT_CONTEXT.md` | Anything about the schema/query-builder boundary you didn't already get from Phase 3. |
| 30 | `packages/intelligence-os/tests/integration/intelligence-os.test.ts`, fully | The fastest way to see the *whole system* exercised end to end, including the exact shape a mocked `SupabaseClient` needs. |
| 31 | `packages/intelligence-os/tests/integration/blueprint.test.ts` | The Blueprint Pipeline exercised end to end, complementing step 30. |

### Phase 9 — You are now productive

At this point you should be able to:
- Trace, from memory, what happens between a calling system invoking `recordFeedbackEvent()` and a user's `IntelligenceProfile` getting a new version.
- Trace, from memory, what happens between a calling system invoking `buildBlueprint()` and receiving an `ArtifactBlueprint`, including what happens when the user has no prior history at all.
- Name, without looking, which of the six domains is fully live, which are partial, and which is fully inert — and why.
- Point to the specific files where the codebase currently violates its own one-domain-one-writer rule, and explain why that's tracked as a gap rather than a pattern to copy.

From here, read any remaining unit test as needed, and treat `foundations/` (see the closing note in the Bootstrap) as deep-reference material rather than something to read end-to-end — most engineers will never need to open most of those documents.

### What this sequence deliberately skips on a first pass

- `IntelligenceOS_Engineering_Roadmap.md`, `IntelligenceOS_Adoption_Strategy.md`, and the `foundations/` documents are **not** in this sequence. They're valuable for understanding *why* certain design decisions were made and what a possible future direction looks like, but none of them are necessary to be productive in this codebase today, and reading them before the code risks anchoring on a planning document's intent over the code's actual, current behavior — which is sometimes different (see Gap Analysis). Read them later, deliberately, when you have a specific "why" question the code and the Bootstrap together don't answer.
- Individual unit test files beyond the two integration tests in Phase 8 — there are enough of them that reading every one up front has a poor time-to-productivity payoff. Open the specific unit test for whatever file you're about to change, when you're about to change it.
