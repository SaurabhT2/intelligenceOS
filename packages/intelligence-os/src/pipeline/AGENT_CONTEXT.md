# AGENT_CONTEXT.md — `packages/intelligence-os/src/pipeline`

## Purpose

The Learning Pipeline: turns a feedback event (or other signal-bearing input) into durable, validated intelligence about a user. Six classes, one orchestrator (`FeedbackProcessor`), wired together in a strict Signal → Observation → Hypothesis → Learning → Profile sequence. `FeedbackProcessor` also handles a second, shorter path: explicit user corrections, which bypass the Signal → Hypothesis quarantine gate entirely (see `LearningValidator.maybeConfirm()` below).

## Completion Mission update (post-Epic-2 session)

Two things changed in this directory this session — see `docs/IMPLEMENTATION_STATUS.md` for the full session entry:

1. **Gap Analysis G-2 resolved.** `HypothesisEngine`, `LearningValidator`, and `ProfileBuilder` no longer hold a `SupabaseClient`. Each now takes a `UserIntelligenceDomain` instance and calls its methods (`findOpenHypothesis`/`createHypothesis`/`updateHypothesis`/`markHypothesisPromoted`/`discardExpiredHypotheses`, `insertLearning`/`getLatestValidatedLearning`/`confirmLearning`, `upsertProfile`/`markPreviousProfilesNonCurrent`/`getAllActiveLearnings`/`countLearningsSince`). All state-transition and scoring *logic* (corroboration math, confidence ceilings, composite-confidence weighting) is unchanged — only persistence moved. `FeedbackProcessor` itself also had a smaller instance of the same anti-pattern (`markSignalsExtracted()` wrote to `intelligence.feedback_events` — owned by `ArtifactIntelligenceDomain` — via its own client); that's fixed too, via a new `ArtifactIntelligenceDomain.markSignalsExtracted()` method and a fourth constructor parameter.
2. **`intelligence.user.correction` connected.** `LearningValidator.maybeConfirm()` and the `UserCorrectionPayload` event contract both existed before this session but had no caller — a genuinely dormant capability, not a stub. `FeedbackProcessor.register()` now also subscribes to `intelligence.user.correction` and routes it through a new `processCorrection()` method. Coverage: `tests/unit/pipeline/UserCorrection.test.ts` (new this session).

RULE-PIPELINE-NO-DIRECT-DB (`packages/intelligence-os/scripts/check-boundaries.mjs`) now mechanically enforces point 1 — any file under `pipeline/` that imports `@supabase/supabase-js` fails `pnpm check:boundaries`.

## Responsibilities

| Class | Responsibility |
|---|---|
| `SignalExtractor` | Classify a `FeedbackEventPayload` into zero or more raw `Signal`s; apply the quarantine gate (`shouldQuarantine`) against `role_play` / `hypothetical` / `emotional_state` context flags. |
| `ObservationBuilder` | Score a `Signal`'s source quality, apply the resulting confidence ceiling, attach a `taxonomyCategory` and the `stabilityClass` that category implies. |
| `HypothesisEngine` | Match an `Observation` against existing `Hypothesis` rows (corroborate or contradict) or create a new one; drive the `PROVISIONAL → ACCUMULATING → VALIDATED/DISCARDED/REJECTED` state machine. Persists via `UserIntelligenceDomain`. |
| `LearningValidator` | Check whether a `Hypothesis` has crossed its corroboration threshold and has no unresolved contradiction; if so, promote it into a persisted `Learning`. Also handles the explicit-correction fast path (`maybeConfirm`), now wired to the `intelligence.user.correction` event via `FeedbackProcessor`. Persists via `UserIntelligenceDomain`. |
| `ProfileBuilder` | Decide whether accumulated changes warrant a profile rebuild (`shouldRebuild`); when they do, version the profile, recompute composite confidence across active Learnings, persist, and mark the prior version non-current. Persists via `UserIntelligenceDomain`. |
| `FeedbackProcessor` | The orchestrator. Subscribes to `intelligence.artifact.feedback` and `intelligence.user.correction` on the event bus; runs every signal a feedback event produces through all five stages above, collecting per-stage failures into `PipelineRunResult.errors` rather than aborting on the first one. Marks `feedback_events.signals_extracted` via `ArtifactIntelligenceDomain`. |

## Allowed dependencies

- `../domains/UserIntelligenceDomain`, `../domains/ArtifactIntelligenceDomain` (constructor-injected; the only way this directory touches the database — see RULE-PIPELINE-NO-DIRECT-DB above).
- `../types/entities`, `../types/domains`, `./types` (pipeline-internal: `Observation`, `SourceQuality`, `PipelineRunResult`, `PipelineStageError`).
- `../errors`.
- `../events/IntelligenceEventBus` (`FeedbackProcessor` only — for `register()`/subscription).
- `@intelligence-os/shared-types` for `FeedbackEvent`/`FeedbackEventPayload` shapes where the pipeline needs to read what the calling system reported.
- `../types/events` for `UserCorrectionPayload`.

## Forbidden dependencies

- **`@supabase/supabase-js`, anywhere in this directory.** Mechanically enforced (RULE-PIPELINE-NO-DIRECT-DB). If a new stage needs data, add a method to the domain that owns the relevant table and call that — do not construct a `SupabaseClient` here, even for a read.
- **`blueprint/` or `knowledge/`.** The Learning Pipeline is fully independent of blueprint assembly and knowledge ingestion — it only ever produces Learnings that those other areas later *read*. Nothing here should import from either.
- **Anything synchronous in the request path.** `FeedbackProcessor` only ever runs off the event bus, triggered by `recordFeedbackEvent()`'s `bus.emit()` call (or, for corrections, a future `recordCorrection()`-style caller emitting `intelligence.user.correction` — no such public `IntelligenceOS` method exists yet; see Gap Analysis, "Opportunities" for the emitter-side half of this capability). Nothing in this directory should be called synchronously from `IntelligenceOS.buildBlueprint()` or any other read path.

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
  constructor(userDomain: UserIntelligenceDomain);
  process(observation: Observation): Promise<Hypothesis>;
  markPromoted(hypothesisId: string, learningId: string): Promise<void>;
  discardExpired(userId: string): Promise<number>;
}

class LearningValidator {
  constructor(userDomain: UserIntelligenceDomain);
  evaluate(hypothesis: Hypothesis, triggeringObservation?: Observation): Promise<ValidationResult>;
  maybeConfirm(userId: string, taxonomyCategory: TaxonomyCategory): Promise<boolean>;
}

class ProfileBuilder {
  constructor(userDomain: UserIntelligenceDomain, bus: IntelligenceEventBus);
  shouldRebuild(userId: string, newLearning: Learning): Promise<RebuildDecision>;
  rebuild(userId: string, changedDomains?: string[]): Promise<IntelligenceProfile>;
}

class FeedbackProcessor {
  constructor(bus: IntelligenceEventBus, userDomain: UserIntelligenceDomain, artifactDomain: ArtifactIntelligenceDomain);
  register(): void; // subscribes to 'intelligence.artifact.feedback' and 'intelligence.user.correction'
  process(event: FeedbackEventPayload): Promise<PipelineRunResult>;
  processCorrection(payload: UserCorrectionPayload): Promise<{ confirmed: boolean }>;
}
```

## Common implementation mistakes

- **Bypassing the quarantine gate, or making it configurable.** `shouldQuarantine()` exists to guarantee that role-play, hypothetical, and momentary-emotional signals never become durable Learnings about who a user is. Don't add a parameter that lets a caller skip it "for this one case" — the one documented exception is an explicit user correction event, handled separately by `LearningValidator.maybeConfirm()` via `FeedbackProcessor.processCorrection()`, not by weakening this gate.
- **Treating confidence ceilings as a starting point rather than a hard cap.** `ObservationBuilder.applyCeiling()` caps confidence based on source quality (`explicit_statement`: 1.00, `demonstrated_behavior`/`uploaded_artifact`: 0.90, `inferred`: 0.35) regardless of how many times something is later corroborated. A new extraction path should call this method, not invent its own confidence math.
- **Adding a corroboration count or threshold value without updating every consumer.** Corroboration thresholds (2 for `permanent`, 3 for `long_term`, 2 for `medium_term`) are consumed in both `HypothesisEngine`'s state-transition logic and `LearningValidator.evaluate()`. Changing one without the other will produce a Hypothesis that one class considers validated and the other doesn't.
- **Reaching for a `SupabaseClient` instead of a domain method.** This was this directory's one real architectural debt (Gap Analysis G-2) until this session, and RULE-PIPELINE-NO-DIRECT-DB now catches it automatically — but the *judgment* still matters going forward: if a new stage needs a new query shape, add the method to `UserIntelligenceDomain` (or the relevant owning domain) rather than reaching around it, even though nothing will stop you from importing `@supabase/supabase-js` in a *different*, not-yet-restricted directory.
- **Letting one stage's exception abort the whole `FeedbackProcessor.process()` run.** Every stage's call inside `process()` should be wrapped so a single failure is captured into `PipelineRunResult.errors` and the remaining signals still get processed. This is tested behavior (see `pipeline-integration.test.ts`) — a change that lets an exception propagate past `process()` is a regression even if it "only" affects one signal. The same applies to `processCorrection()`: a failed confirmation returns `{ confirmed: false }`, it never throws past the event-bus boundary.

## Testing expectations

- `tests/unit/pipeline/` holds focused tests per class: `SignalExtractor.test.ts`, `ObservationBuilder.test.ts`, and (new this session) `UserCorrection.test.ts` (covers `LearningValidator.maybeConfirm()` and `FeedbackProcessor.processCorrection()`/`register()`'s correction subscription). `HypothesisEngine`, `LearningValidator.evaluate()`, and `ProfileBuilder` still have no *fully isolated* per-class unit test file of their own — they're exercised thoroughly through `pipeline-integration.test.ts`'s cross-stage scenarios, but a dedicated file per class (asserting each pure computation function in isolation, e.g. `computeCorroborationUpdates`/`computeContradictionUpdates`/`computeExpiry`) is still a good next contribution. Not blocking — the integration coverage is real and passes today — just less precise for pinpointing a regression's exact cause.
- `tests/unit/pipeline/pipeline-integration.test.ts` exercises the full Signal → Profile flow against a mocked Supabase client (now wrapped in `UserIntelligenceDomain`/`ArtifactIntelligenceDomain` instances, per the G-2 fix) and should be the test you run first after any cross-stage change.
- Specifically test the quarantine gate's negative cases (role-play, hypothetical, emotional-state flags correctly discarding a signal) and the explicit-correction fast path — both are safety properties, not incidental behavior, and deserve their own explicit assertions rather than only being covered as a side effect of a happy-path test.
- Test graceful degradation directly: construct a scenario where one stage throws and assert the remaining signals in the same `process()` call still complete and the error lands in `PipelineRunResult.errors`.
