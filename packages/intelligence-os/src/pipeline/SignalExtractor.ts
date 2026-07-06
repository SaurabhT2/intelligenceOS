/**
 * SignalExtractor.ts
 *
 * Stage 1 of the Learning Pipeline.
 *
 * Responsibilities (per Sprint 2 spec and Contracts B.2 Signal → Observation):
 *   • Receive FeedbackEvent payloads from the event bus
 *   • Generate one or more Signal records per event
 *   • Classify source_type
 *   • Apply quarantine flags: role_play / hypothetical / emotional_state
 *   • Discard quarantined signals (per Taxonomy Section H — must never extract
 *     identity/preference data from role-play or hypothetical contexts)
 *
 * Signal persistence: signals are written to intelligence.signals via the
 * UserIntelligenceDomain's internal low-level path. Sprint 2 design decision:
 * because UserIntelligenceDomain.insertLearning() was the only deferred write
 * in Sprint 0, and signals are transient pipeline artefacts consumed
 * immediately, signals are NOT persisted to the DB in Phase 1 — they are
 * in-memory records passed directly to ObservationBuilder. This keeps the
 * pipeline self-contained without requiring new DB write methods in Sprint 2.
 * (Decision logged: minimise smallest-implementation per spec instruction.)
 *
 * Source: BrandOS Intelligence Architecture Section 5 (Learning Pipeline).
 * Source: BrandOS Intelligence Contracts B.2 (Signal → Observation).
 * Source: BrandOS Learning Taxonomy Section H (dangerous/excluded signals).
 */

import type { FeedbackEventPayload } from '../types/events';
import type { Signal, TaxonomyCategory } from '../types/entities';
import type { SourceQuality } from './types';

// ── Quarantine flag constants ──────────────────────────────────────────────────

const QUARANTINE_FLAGS = new Set(['role_play', 'hypothetical', 'emotional_state']);

// ── Source type classification ─────────────────────────────────────────────────
// Maps FeedbackEvent.eventType to Signal.sourceType and SourceQuality.
// Source: Contracts A.2 (Producer Contract Table for Signal).

function classifySource(eventType: string): {
  sourceType: Signal['sourceType'];
  quality: SourceQuality;
} {
  switch (eventType) {
    case 'explicit_feedback':
      return { sourceType: 'explicit_statement', quality: 'explicit_statement' };
    case 'deployed':
      // Deployment is the ultimate behavioral signal (Taxonomy F.1 rank #4)
      return { sourceType: 'feedback_event', quality: 'demonstrated_behavior' };
    case 'accepted':
      return { sourceType: 'feedback_event', quality: 'demonstrated_behavior' };
    case 'edited':
      // Edit diffs are behavioral signals exposing actual preferences
      return { sourceType: 'edit_diff', quality: 'demonstrated_behavior' };
    case 'rejected':
      return { sourceType: 'feedback_event', quality: 'demonstrated_behavior' };
    default:
      return { sourceType: 'feedback_event', quality: 'inferred' };
  }
}

// ── Taxonomy inference from feedback ──────────────────────────────────────────
// Each feedback event type maps to the most relevant taxonomy categories.
// Sprint 2 decision: use deterministic mapping (no LLM in pipeline internals).

function inferTaxonomyCategories(eventType: string, hasEditDiff: boolean): TaxonomyCategory[] {
  const categories: TaxonomyCategory[] = [];

  switch (eventType) {
    case 'deployed':
      // Deployment signals professional identity and communication style
      categories.push('communication_style', 'writing_style', 'personal_brand_signal');
      break;
    case 'accepted':
      categories.push('communication_style', 'writing_style');
      break;
    case 'rejected':
      categories.push('communication_style', 'writing_style');
      break;
    case 'explicit_feedback':
      // Explicit feedback may touch any category; start with style
      categories.push('communication_style', 'writing_style', 'operating_principles');
      break;
    case 'edited':
      break; // categories inferred from edit diff below
    default:
      categories.push('communication_style');
  }

  if (hasEditDiff) {
    // Edit diffs indicate style and structure preferences
    if (!categories.includes('writing_style')) categories.push('writing_style');
    if (!categories.includes('communication_style')) categories.push('communication_style');
  }

  return categories.length > 0 ? categories : ['communication_style'];
}

// ── Raw content packaging ──────────────────────────────────────────────────────

function buildRawContent(event: FeedbackEventPayload): Record<string, unknown> {
  const content: Record<string, unknown> = {
    eventType: event.eventType,
    artifactId: event.artifactId,
    artifactType: event.artifactType,
  };

  if (event.editDiff) {
    content['editDiff'] = event.editDiff;
  }

  if (event.explicitReason) {
    content['explicitReason'] = event.explicitReason;
  }

  if (event.blueprintId) {
    content['blueprintId'] = event.blueprintId;
  }

  return content;
}

// ── SignalExtractor ───────────────────────────────────────────────────────────

export class SignalExtractor {
  /**
   * Extracts zero or more in-memory Signal records from a FeedbackEvent payload.
   *
   * Quarantine logic (Contracts B.2, Taxonomy H):
   *   - Signals tagged role_play / hypothetical / emotional_state are discarded.
   *   - No exception for Sprint 2 Phase 1 (explicit override path not triggered
   *     by FeedbackEvents — that path is for conversational signals).
   *
   * Returns the extracted signals (may be empty if all were quarantined).
   */
  extractFromFeedback(event: FeedbackEventPayload): Signal[] {
    if (!event.userId || !event.artifactId) {
      // Missing required fields — cannot produce a valid signal
      return [];
    }

    const signals: Signal[] = [];
    const { sourceType, quality } = classifySource(event.eventType);
    const hasEditDiff = Boolean(event.editDiff);
    const taxonomyCategories = inferTaxonomyCategories(event.eventType, hasEditDiff);

    // Check for quarantine flags on the event-level context.
    // FeedbackEvents themselves don't carry context_flags directly, but
    // explicit_reason text might include signals we cannot trust for
    // professional model building. For Sprint 2 Phase 1, FeedbackEvent
    // signals are never quarantined — they are user actions on real artifacts,
    // not conversational role-play.
    // The quarantine gate applies when pipeline is extended to prompt signals.
    const contextFlags: string[] = [];

    // One signal per primary taxonomy category detected
    for (const taxonomyCategory of taxonomyCategories) {
      // Apply quarantine gate (no quarantine flags for feedback events in Phase 1)
      const isQuarantined = contextFlags.some(f => QUARANTINE_FLAGS.has(f));
      if (isQuarantined) {
        // Discard — never extract identity/preference data from quarantined context
        continue;
      }

      const signal: Signal = {
        id: generateId(),
        userId: event.userId,
        projectId: event.projectId ?? null,
        sourceType,
        sourceRef: event.artifactId,
        contextFlags,
        taxonomyCategory,
        rawContent: {
          ...buildRawContent(event),
          sourceQuality: quality,
          primaryCategory: taxonomyCategory,
        },
        isQuarantined: false,
        quarantineReason: null,
        processedAt: null,
        createdAt: new Date(),
      };

      signals.push(signal);
    }

    return signals;
  }

  /**
   * Checks whether a signal should be quarantined.
   * Exposed for testing and for future use by prompt-signal extraction.
   */
  shouldQuarantine(contextFlags: string[]): { quarantine: boolean; reason: string | null } {
    for (const flag of contextFlags) {
      if (QUARANTINE_FLAGS.has(flag)) {
        return {
          quarantine: true,
          reason: `Context flag "${flag}" requires quarantine per Taxonomy Section H`,
        };
      }
    }
    return { quarantine: false, reason: null };
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}
