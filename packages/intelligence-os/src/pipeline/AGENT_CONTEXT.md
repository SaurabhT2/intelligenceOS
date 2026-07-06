# AGENT_CONTEXT.md — `packages/intelligence-os/src/pipeline`

## Purpose

The Learning Pipeline: turns a feedback event (or other signal-bearing input) into durable, validated intelligence about a user. Six classes, one orchestrator (`FeedbackProcessor`), wired together in a strict Signal → Observation → Hypothesis → Learning → Profile sequence.

## Responsibilities

| Class | Responsibility |
|---|---|
| `SignalExtractor` | Classify a `FeedbackEventPayload` into zero or more raw `Signal`s; apply the quarantine gate (`shouldQuarantine`) against `role_play` / `hypothetical` / `emotional_state` context flags. |
| `ObservationBuilder` | Score a `Signal`'s source quality, apply the resulting confidence ceiling, attach a `taxonomyCategory` and the `stabilityClass` that category implies. |
| `HypothesisEngine` | Match an `Observation` against existing `Hypothesis` rows (corroborate or contradict) or create a new one; drive the `PROVISIONAL → ACCUMULATING → VALIDATED/DISCARDED/REJECTED` state machine. |
| `LearningValidator` | Check whether a `Hypothesis` has crossed its corroboration threshold and has no unresolved contradiction; if so, promote it into a persisted `Learning`. Also handles the explicit-correction fast path (`maybeConfirm`). |
| `ProfileBuilder` | Decide whether accumulated changes warrant a profile rebuild (`shouldRebuild`); when they do, version the profile, recompute composite confidence across active Learnings, persist, and mark the prior version non-current. |
| `FeedbackProcessor` | The orchestrator. Subscribes to `intelligence.artifact.feedback` on the event bus; runs every signal a feedback event produces through all five stages above, collecting per-stage failures into `PipelineRunResult.errors` rather than aborting on the first one. |

## Allowed dependencies

- `@supabase/supabase-js` (`SupabaseClient`, injected via constructor).
- `../types/entities`, `../types/domains`, `./types` (pipeline-internal: `Observation`, `SourceQuality`, `PipelineRunResult`, `PipelineStageError`).
- `../errors`.
- `../events/IntelligenceEventBus` (`FeedbackProcessor` only — for `register()`/subscription).
- `@intelligence-os/shared-types` for `FeedbackEvent`/`FeedbackEventPayload` shapes where the pipeline needs to read what the calling system reported.

## Forbidden dependencies

- **`blueprint/` or `knowledge/`.** The Learning Pipeline is fully independent of blueprint assembly and knowledge ingestion — it only ever produces Learnings that those other areas later *read*. Nothing here should import from either.
- **Direct construction of a domain class for a purpose its owning domain already serves.** This is currently violated (see below) — don't extend the violation; route new persistence needs through the domain.
- **Anything synchronous in the request path.** `FeedbackProcessor` only ever runs off the event bus, triggered by `recordFeedbackEvent()`'s `bus.emit()` call. Nothing in this directory should be called synchronously from `IntelligenceOS.buildBlueprint()` or any other read path.

## Public interfaces

```ts
class SignalExtractor {
  extractFromFeedback(event: FeedbackEventPayload): Signal[];
  shouldQuarantine(contextFlags: string[]): { quarantine: boolean; reason: string | null };
}

class ObservationBuilder {
  build(signal: Signal): Observation | null;
  applyCeiling(rawConfidence: number, quality: SourceQuality): number;
  stabilityClassFor(category: TaxonomyCategory): StabilityClass;
}

class HypothesisEngine {
  constructor(db: SupabaseClient);
  process(observation: Observation): Promise<Hypothesis>;
  markPromoted(hypothesisId: string, learningId: string): Promise<void>;
  discardExpired(userId: string): Promise<number>;
}

class LearningValidator {
  constructor(db: SupabaseClient);
  evaluate(hypothesis: Hypothesis, triggeringObservation?: Observation): Promise<ValidationResult>;
  maybeConfirm(userId: string, taxonomyCategory: TaxonomyCategory): Promise<boolean>;
}

class ProfileBuilder {
  constructor(db: SupabaseClient, /* ...other collaborators, see file */);
  shouldRebuild(userId: string, newLearning: Learning): Promise<RebuildDecision>;
  rebuild(userId: string, changedDomains?: string[]): Promise<IntelligenceProfile>;
}

class FeedbackProcessor {
  constructor(db: SupabaseClient, bus: IntelligenceEventBus);
  register(): void; // subscribes to 'intelligence.artifact.feedback'
  process(event: FeedbackEventPayload): Promise<PipelineRunResult>;
}
```

## Common implementation mistakes

- **Bypassing the quarantine gate, or making it configurable.** `shouldQuarantine()` exists to guarantee that role-play, hypothetical, and momentary-emotional signals never become durable Learnings about who a user is. Don't add a parameter that lets a caller skip it "for this one case" — the one documented exception is an explicit user correction event, handled separately by `LearningValidator.maybeConfirm()`, not by weakening this gate.
- **Treating confidence ceilings as a starting point rather than a hard cap.** `ObservationBuilder.applyCeiling()` caps confidence based on source quality (`explicit_statement`: 1.00, `demonstrated_behavior`/`uploaded_artifact`: 0.90, `inferred`: 0.35) regardless of how many times something is later corroborated. A new extraction path should call this method, not invent its own confidence math.
- **Adding a corroboration count or threshold value without updating every consumer.** Corroboration thresholds (2 for `permanent`, 3 for `long_term`, 2 for `medium_term`) are consumed in both `HypothesisEngine`'s state-transition logic and `LearningValidator.evaluate()`. Changing one without the other will produce a Hypothesis that one class considers validated and the other doesn't.
- **Writing directly to `intelligence.hypotheses`, `intelligence.learnings`, or `intelligence.profiles` instead of through `UserIntelligenceDomain`.** `HypothesisEngine`, `LearningValidator`, and `ProfileBuilder` currently do exactly this — each holds its own `SupabaseClient` and writes past the domain layer (see Gap Analysis G-2). This is a known, tracked architectural debt, not a pattern to imitate in a sixth file. If you're touching one of these three classes for an unrelated reason, consider whether routing its write through `UserIntelligenceDomain.insertLearning()` / `.upsertProfile()` is in scope for your change — it's the single highest-leverage fix available in this directory.
- **Letting one stage's exception abort the whole `FeedbackProcessor.process()` run.** Every stage's call inside `process()` should be wrapped so a single failure is captured into `PipelineRunResult.errors` and the remaining signals still get processed. This is tested behavior (see `pipeline-integration.test.ts`) — a change that lets an exception propagate past `process()` is a regression even if it "only" affects one signal.

## Testing expectations

- `tests/unit/pipeline/` holds focused tests per class (currently `SignalExtractor.test.ts`, `ObservationBuilder.test.ts` — `HypothesisEngine`, `LearningValidator`, and `ProfileBuilder` currently have no dedicated unit test file and are exercised only indirectly through `pipeline-integration.test.ts`; closing that gap is a good first contribution to this directory, see Gap Analysis G-4).
- `tests/unit/pipeline/pipeline-integration.test.ts` exercises the full Signal → Profile flow against a mocked Supabase client and should be the test you run first after any cross-stage change.
- Specifically test the quarantine gate's negative cases (role-play, hypothetical, emotional-state flags correctly discarding a signal) and the explicit-correction fast path — both are safety properties, not incidental behavior, and deserve their own explicit assertions rather than only being covered as a side effect of a happy-path test.
- Test graceful degradation directly: construct a scenario where one stage throws and assert the remaining signals in the same `process()` call still complete and the error lands in `PipelineRunResult.errors`.
