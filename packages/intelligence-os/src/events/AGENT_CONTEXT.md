# AGENT_CONTEXT.md — `packages/intelligence-os/src/events`

## Purpose

The seam between IntelligenceOS's internal pipelines and the outside world's observability needs. One interface, one production-grade default implementation. This directory is intentionally small — resist the urge to grow it beyond what a real, current need justifies.

## Responsibilities

- `IntelligenceEventBus` — the interface every pipeline orchestrator (`FeedbackProcessor`, `KnowledgeProcessor`) and `BlueprintBuilder` depends on: `emit(type, payload)`, `on(type, handler)`.
- `InProcessEventBus` — the default, production-grade implementation: synchronous, in-memory, fire-and-forget, with per-handler error isolation (one handler throwing does not prevent other handlers for the same event from running, and does not propagate back to the emitter).

## Allowed dependencies

- `../types/events` (`IntelligenceEventType`, `IntelligenceEventPayload`).

## Forbidden dependencies

- Nothing else. This directory should remain dependency-free aside from the event type definitions — that's part of why it's safe and easy to swap out.

## Public interfaces

```ts
interface IntelligenceEventBus {
  emit<T extends IntelligenceEventType>(type: T, payload: IntelligenceEventPayload[T]): Promise<void>;
  on<T extends IntelligenceEventType>(type: T, handler: (payload: IntelligenceEventPayload[T]) => Promise<void> | void): void;
}

class InProcessEventBus implements IntelligenceEventBus { /* ... */ }
```

Two commented-out sketches exist in this file for `BullMQEventBus` and `InngestEventBus` — neither is implemented. They exist purely as a note on what a distributed swap-in would look like; do not implement either speculatively. Implement one only when IntelligenceOS genuinely needs to run pipeline processing across more than one process, and at that point, write it as a new class implementing the same `IntelligenceEventBus` interface — don't change the interface itself to accommodate it unless the interface is genuinely insufficient.

## Common implementation mistakes

- **Making event handling awaited/blocking on the emitter side in a way that changes `recordFeedbackEvent()`'s or `ingestKnowledgeAsset()`'s current behavior.** `recordFeedbackEvent()` relies on `bus.emit()` returning quickly so the calling system gets a fast response while the Learning Pipeline runs after the fact. Any change to `InProcessEventBus.emit()` that makes it wait for all handlers to fully complete before resolving would change this contract — check both call sites in `IntelligenceOS.ts` before changing emit's semantics.
- **Adding a new event type without updating the matching payload type in `types/events.ts`.** The 14-member `IntelligenceEventType` union and its corresponding `IntelligenceEventPayload` mapping must stay in lockstep — TypeScript will catch a missing payload shape, but it won't catch a payload shape that's present but wrong, so review new payload types as carefully as the new event name itself.
- **Letting one handler's exception take down the bus or stop other handlers from running.** Per-handler error isolation is a tested property — confirm any change to `emit()`'s dispatch loop still wraps each handler call independently.

## Testing expectations

- `InProcessEventBus` needs direct tests for: basic emit/subscribe round-trip, multiple handlers on the same event type, and the per-handler error-isolation guarantee (one throwing handler must not prevent a second handler from running, and must not reject the `emit()` call itself).
- Any new bus implementation must pass the same test suite (consider extracting a shared "bus contract" test suite parameterized over implementations once a second implementation actually exists — not needed yet with only one).
