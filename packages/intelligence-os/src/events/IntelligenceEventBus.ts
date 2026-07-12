/**
 * IntelligenceEventBus.ts
 *
 * Event bus abstraction and default in-process implementation.
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 7.1 (verbatim).
 *
 * The interface is the coupling contract. The InProcessEventBus is the
 * Sprint 0 / test default. Two production swap-ins are stubbed here as
 * comments (BullMQ for task queues, Inngest for serverless) — implement
 * whichever fits the BrandOS deployment model at integration time (Sprint 4).
 */

import type { IntelligenceEventType, IntelligenceEventPayload } from '../types/events';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IntelligenceEventBus {
  emit<T extends IntelligenceEventType>(
    event: T,
    payload: IntelligenceEventPayload<T>,
  ): Promise<void>;

  on<T extends IntelligenceEventType>(
    event: T,
    handler: (payload: IntelligenceEventPayload<T>) => Promise<void>,
  ): void;
}

// ── In-process default ────────────────────────────────────────────────────────

/**
 * InProcessEventBus
 *
 * Synchronous fan-out using a Map of handler arrays. Errors in individual
 * handlers are caught and logged but do not prevent other handlers from
 * running and do not throw to the caller (fire-and-forget semantics).
 *
 * Source: Architecture Section 7.1 (verbatim implementation reproduced here).
 *
 * Suitable for:
 *   • Sprint 0–3 development and all Vitest integration tests
 *   • Single-process production deployments where async queuing is not needed
 *
 * Replace with BullMQEventBus or InngestEventBus for distributed/serverless
 * production before Sprint 4 (BrandOS Integration).
 */
export class InProcessEventBus implements IntelligenceEventBus {
  private readonly handlers = new Map<string, Array<(p: unknown) => Promise<void>>>();

  async emit<T extends IntelligenceEventType>(
    event: T,
    payload: IntelligenceEventPayload<T>,
  ): Promise<void> {
    const handlers = this.handlers.get(event) ?? [];
    // Fire-and-forget: errors are logged but not thrown to the caller.
    // Promise.allSettled ensures all handlers run even if one rejects.
    const results = await Promise.allSettled(handlers.map(h => h(payload)));
    for (const result of results) {
      if (result.status === 'rejected') {
        // Replace with structured logger when one is wired in.
        console.error(`[IntelligenceEventBus] Handler error for event "${event}":`, result.reason);
      }
    }
  }

  on<T extends IntelligenceEventType>(
    event: T,
    handler: (payload: IntelligenceEventPayload<T>) => Promise<void>,
  ): void {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, [
      ...existing,
      handler as (p: unknown) => Promise<void>,
    ]);
  }

  /** Returns the number of handlers registered for a given event type. Useful in tests. */
  handlerCount(event: IntelligenceEventType): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  /** Removes all handlers. Call between tests to prevent cross-test leakage. */
  reset(): void {
    this.handlers.clear();
  }
}

// ── Production swap-ins (stubs — implement at Sprint 4) ───────────────────────

// export class BullMQEventBus implements IntelligenceEventBus {
//   constructor(private readonly queue: Queue) {}
//   async emit<T extends IntelligenceEventType>(event: T, payload: IntelligenceEventPayload<T>) {
//     await this.queue.add(event, payload);
//   }
//   on<T extends IntelligenceEventType>(event: T, handler: ...) {
//     // Register as BullMQ process worker
//   }
// }

// export class InngestEventBus implements IntelligenceEventBus {
//   async emit<T extends IntelligenceEventType>(event: T, payload: IntelligenceEventPayload<T>) {
//     await inngest.send({ name: event, data: payload });
//   }
//   on() { /* Inngest uses file-based function registration, not runtime .on() */ }
// }
