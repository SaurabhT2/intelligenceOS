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
import type { ObservationInput } from '@platform/cognition-contract';

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

// ── Taxonomy inference from a workspace Observation (ADR-003) ─────────────────
// `ObservationInput` carries only process metadata (score, topic,
// artifactType, wasRepaired) — no textual analysis of `outputText`.
// Deliberately conservative for the same reason `inferTaxonomyCategories`
// above is deterministic rather than LLM-based (Implementation Philosophy,
// ARCHITECTURE.md §13): every category emitted here must be a direct,
// honest reading of a field BrandOS actually reported, never a guess about
// voice or content dressed up as a finding — the discipline this file's
// former `context/observationToWorkspaceLearning.ts` companion already
// established and this function preserves.

function isMeaningfulScore(score: number): boolean {
  return Number.isFinite(score) && score > 0;
}

/** Governance/richness scores in this platform are 0–100; `Observation.confidence` (and eventually `Learning.confidence`) is constrained to 0–1. Already-normalized inputs (e.g. from tests) pass through unchanged. */
function normalizeObservedScore(score: number): number {
  const raw = score > 1 ? score / 100 : score;
  return Math.min(1, Math.max(0, raw));
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
        workspaceId: null,
        subjectType: 'user',
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
   * ADR-003 (Subject-Centric Intelligence) §2.1 — Stage 1 of the Learning
   * Pipeline for a Workspace subject. Extracts zero or more in-memory
   * Signal records from a `CognitionProvider.observe()` payload, the same
   * role `extractFromFeedback` plays for a User subject.
   *
   * This replaces the former `context/observationToWorkspaceLearning.ts`,
   * which built an already-classified `WorkspaceLearningInput` by hand and
   * wrote it directly — a second, simplified pipeline running in parallel
   * to this one (a duplication `PLATFORM_CONTRACT.md` §5's "no duplicated
   * intelligence" principle and this repository's own architecture forbid
   * once a single generalized path exists). Workspace observations now
   * enter at the same Stage 1 every other Subject's evidence enters at, and
   * flow through the same Observation → Hypothesis → Learning →
   * IntelligenceProfile machinery `pipeline/ObservationBuilder.ts` and
   * friends already implement generically.
   *
   * `CPLOrchestrator` (BrandOS) fires `observe()` once per internal
   * regeneration attempt, before the real governance score is known — those
   * calls carry `score: 0` as a documented placeholder ("PENDING" in
   * BrandOS's own logs), not a genuine "this artifact scored zero" signal.
   * Treating every `score: 0` as real data would flood the workspace's
   * Hypotheses with noise, so — exactly as the module this supersedes did —
   * those are discarded here, before a Signal is ever created.
   */
  extractFromObservation(input: ObservationInput): Signal[] {
    if (!input.workspaceId || !input.requestId) return [];
    if (!isMeaningfulScore(input.score)) return [];

    const signals: Signal[] = [];
    const observedAt = input.observedAt ?? new Date().toISOString();
    // A governance-repaired artifact's score reflects the repaired output,
    // not the model's first-pass behavior — treat it as a weaker (inferred)
    // signal of quality rather than a directly demonstrated one.
    const quality: SourceQuality = input.wasRepaired ? 'inferred' : 'demonstrated_behavior';

    const baseRawContent: Record<string, unknown> = {
      requestId: input.requestId,
      artifactType: input.artifactType ?? null,
      topic: input.topic ?? null,
      wasRepaired: input.wasRepaired ?? false,
      observedScore: input.score,
      normalizedScore: normalizeObservedScore(input.score),
      observedAt,
      sourceQuality: quality,
    };

    signals.push({
      id: generateId(),
      userId: null,
      workspaceId: input.workspaceId,
      subjectType: 'workspace',
      projectId: null,
      sourceType: 'feedback_event',
      sourceRef: input.requestId,
      contextFlags: [],
      taxonomyCategory: 'success_metrics',
      rawContent: {
        ...baseRawContent,
        primaryCategory: 'success_metrics',
        normalizedScore: normalizeObservedScore(input.score),
      },
      isQuarantined: false,
      quarantineReason: null,
      processedAt: null,
      createdAt: new Date(),
    });

    // `topic`, when present, is a directly-reported fact about what this
    // artifact was about — tagging it under expertise_domains states only
    // what BrandOS actually told us ("this workspace produced an artifact
    // about topic X"), not an inferred voice or style judgment.
    if (input.topic) {
      signals.push({
        id: generateId(),
        userId: null,
        workspaceId: input.workspaceId,
        subjectType: 'workspace',
        projectId: null,
        sourceType: 'feedback_event',
        sourceRef: input.requestId,
        contextFlags: [],
        taxonomyCategory: 'expertise_domains',
        rawContent: {
          ...baseRawContent,
          primaryCategory: 'expertise_domains',
          topic: input.topic,
        },
        isQuarantined: false,
        quarantineReason: null,
        processedAt: null,
        createdAt: new Date(),
      });
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
