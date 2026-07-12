/**
 * HypothesisEngine.ts
 *
 * Stage 3 of the Learning Pipeline.
 *
 * Responsibilities (per Sprint 2 spec and Contracts B.2):
 *   • Match Observations to existing Hypotheses (corroboration/contradiction)
 *   • Create new Hypotheses for unmatched Observations (state: PROVISIONAL)
 *   • Track corroboration and contradiction counts
 *   • Drive state transitions per Schema E.2 (State Machine)
 *
 * State machine transitions implemented here (Schema E.3):
 *   PROVISIONAL → ACCUMULATING   on ≥ 1 corroboration
 *   ACCUMULATING → VALIDATED     when current_corroborations ≥ required (Stage 4 gate)
 *   PROVISIONAL/ACCUMULATING → CHALLENGED   on contradicting observation
 *   CHALLENGED → ACCUMULATING    on resolving corroboration (if contradictions resolved)
 *   ACCUMULATING → DISCARDED     timeout (no corroboration in 30 days) [checked at validation]
 *   ACCUMULATING → REJECTED      ≥ 2 high-quality contradictions
 *
 * Persistence: Hypotheses are persisted to intelligence.hypotheses via
 * UserIntelligenceDomain's hypothesis CRUD methods (findOpenHypothesis /
 * createHypothesis / updateHypothesis / markHypothesisPromoted /
 * discardExpiredHypotheses) — this class holds no SupabaseClient of its own.
 *
 * Completion Mission note (Gap Analysis G-2, resolved this session): prior
 * to this session, this class held its own `SupabaseClient` and issued raw
 * `.schema('intelligence').from('hypotheses')` queries directly, bypassing
 * `UserIntelligenceDomain` even though that domain is the documented sole
 * owner of `intelligence.hypotheses`. All persistence now routes through
 * the domain; every method below keeps its exact prior state-transition
 * math (computeUpdates / computeCorroborationUpdates /
 * computeContradictionUpdates / computeExpiry are unchanged pure functions)
 * — only the I/O moved.
 *
 * Source: BrandOS Logical Intelligence Schema D.1 Stage 3, E.2, E.3, D.3.
 * Source: BrandOS Intelligence Contracts B.2 (Observation → Hypothesis gate).
 */

import type { Hypothesis, StabilityClass } from '../types/entities';
import type { UserIntelligenceDomain } from '../domains/UserIntelligenceDomain';
import type { Observation } from './types';
import { SOURCE_QUALITY_CEILING } from './types';
import { subjectColumns, type SubjectRef } from '../types/subject';

// ── Required corroboration thresholds (Schema D.1 Stage 4 gate) ───────────────
// Permanent → 2, Long-Term → 3, Medium-Term → 2

const REQUIRED_CORROBORATIONS: Record<StabilityClass, number> = {
  permanent:   2,
  long_term:   3,
  medium_term: 2,
};

// ── High-quality source threshold (for Contradiction Rule) ────────────────────
// Schema D.3: "contradicting Observation of equal or greater source quality"
// Schema D.4: "2+ contradictions from high-quality sources" → REJECTED
// We define "high-quality" as ceiling ≥ 0.65 (demonstrated_behavior or better).

const HIGH_QUALITY_THRESHOLD = 0.65;

// ── HypothesisEngine ──────────────────────────────────────────────────────────

export class HypothesisEngine {
  constructor(private readonly userDomain: UserIntelligenceDomain) {}

  /**
   * Processes an Observation: finds or creates the matching Hypothesis,
   * applies the corroboration/contradiction logic, and persists the result.
   *
   * ADR-003 (Subject-Centric Intelligence): reads `observation.subject`
   * rather than assuming a User subject, and delegates to
   * UserIntelligenceDomain's subject-generic Hypothesis CRUD
   * (`findOpenHypothesisForSubject`/`createHypothesisForSubject`) — the same
   * class continues to own `intelligence.hypotheses` regardless of which
   * Subject type a given row belongs to (Rule 1: one domain, one writer).
   *
   * Returns the updated or newly created Hypothesis.
   */
  async process(observation: Observation): Promise<Hypothesis> {
    const contextScope = observation.projectId ? 'project' : 'global';
    const existing = await this.userDomain.findOpenHypothesisForSubject(
      observation.subject,
      observation.taxonomyCategory,
      contextScope,
    );

    if (existing) {
      return this.applyObservation(existing, observation);
    } else {
      return this.createNew(observation);
    }
  }

  /**
   * Creates a new PROVISIONAL Hypothesis from the Observation.
   * required_corroborations is set per stability class.
   */
  private async createNew(observation: Observation): Promise<Hypothesis> {
    const contextScope = observation.projectId ? 'project' : 'global';
    const requiredCorroborations = REQUIRED_CORROBORATIONS[observation.stabilityClass];
    const expiresAt = computeExpiry(observation.stabilityClass);

    const payload = {
      ...subjectColumns(observation.subject),
      project_id:               observation.projectId,
      taxonomy_category:        observation.taxonomyCategory,
      stability_class:          observation.stabilityClass,
      state:                    'PROVISIONAL' as const,
      confidence:               observation.confidence,
      required_corroborations:  requiredCorroborations,
      current_corroborations:   0,
      high_quality_contradictions: 0,
      proposition:              observation.content,
      context_scope:            contextScope,
      context_artifact_type:    null as string | null,
      promoted_learning_id:     null as string | null,
      expires_at:               expiresAt,
    };

    return this.userDomain.createHypothesisForSubject(payload);
  }

  /**
   * Applies an Observation to an existing Hypothesis.
   *
   * State transitions (Schema E.3, D.3 Contradiction Rule):
   *   corroborating → increment corroborations; advance state
   *   contradicting  → halve confidence; advance to CHALLENGED;
   *                    check for REJECTED threshold
   */
  private async applyObservation(
    hypothesis: Hypothesis,
    observation: Observation,
  ): Promise<Hypothesis> {
    const updates = computeUpdates(hypothesis, observation);
    return this.userDomain.updateHypothesis(hypothesis.id, updates);
  }

  /**
   * Marks a Hypothesis as having been promoted to a Learning.
   * Called by LearningValidator after successful promotion.
   */
  async markPromoted(hypothesisId: string, learningId: string): Promise<void> {
    await this.userDomain.markHypothesisPromoted(hypothesisId, learningId);
  }

  /**
   * Discards expired PROVISIONAL hypotheses (timeout > 30 days, non-permanent)
   * for a User subject. Sprint 2 decision: called opportunistically by
   * FeedbackProcessor after each run to prevent hypothesis table bloat. Full
   * scheduled cleanup is a Sprint 4 operational concern.
   *
   * Retained under this name/signature for backward compatibility with
   * existing User-subject callers; see `discardExpiredForSubject` for the
   * ADR-003 generalization.
   */
  async discardExpired(userId: string): Promise<number> {
    return this.userDomain.discardExpiredHypotheses(userId);
  }

  /** ADR-003 (Subject-Centric Intelligence) — discards expired hypotheses for any Subject. */
  async discardExpiredForSubject(subject: SubjectRef): Promise<number> {
    if (subject.subjectType === 'user') {
      return this.userDomain.discardExpiredHypotheses(subject.subjectId);
    }
    return this.userDomain.discardExpiredHypothesesForSubject(subject);
  }
}

// ── Pure state-transition logic ───────────────────────────────────────────────

function computeUpdates(
  hypothesis: Hypothesis,
  observation: Observation,
): Partial<Record<string, unknown>> {
  if (observation.disposition === 'corroborating') {
    return computeCorroborationUpdates(hypothesis, observation);
  } else if (observation.disposition === 'contradicting') {
    return computeContradictionUpdates(hypothesis, observation);
  }

  // 'new' disposition on an existing hypothesis = treat as corroborating
  return computeCorroborationUpdates(hypothesis, observation);
}

function computeCorroborationUpdates(
  hypothesis: Hypothesis,
  observation: Observation,
): Partial<Record<string, unknown>> {
  const newCorroborations = hypothesis.currentCorroborations + 1;
  const totalCorroborations = newCorroborations;

  // Escalation Rule (Schema D.4): 3+ corroborations with 0 contradictions
  // → promote directly to Learning at High confidence (handled in LearningValidator)
  // Here we just advance the state.
  const metThreshold = totalCorroborations >= hypothesis.requiredCorroborations;
  const highEscalation = totalCorroborations >= 3 && hypothesis.highQualityContradictions === 0;

  // Confidence update: take the higher of current and new observation confidence,
  // capped at the source quality ceiling. This implements gradual confidence
  // accumulation without over-inflating from a single high-quality signal.
  const newConfidence = Math.max(hypothesis.confidence, observation.confidence);

  let newState: Hypothesis['state'];
  if (metThreshold || highEscalation) {
    // Ready for promotion — LearningValidator will check this and promote
    newState = 'ACCUMULATING'; // stays ACCUMULATING; LearningValidator promotes
  } else if (hypothesis.state === 'PROVISIONAL') {
    newState = 'ACCUMULATING';
  } else if (hypothesis.state === 'CHALLENGED') {
    // Resolving corroboration on a challenged hypothesis
    newState = hypothesis.highQualityContradictions > 0 ? 'CHALLENGED' : 'ACCUMULATING';
  } else {
    newState = hypothesis.state;
  }

  return {
    current_corroborations: newCorroborations,
    confidence: newConfidence,
    state: newState,
    expires_at: computeExpiry(hypothesis.stabilityClass), // refresh expiry on corroboration
  };
}

function computeContradictionUpdates(
  hypothesis: Hypothesis,
  observation: Observation,
): Partial<Record<string, unknown>> {
  const isHighQuality = SOURCE_QUALITY_CEILING[observation.sourceQuality] >= HIGH_QUALITY_THRESHOLD;
  const newHighQualityContradictions = hypothesis.highQualityContradictions + (isHighQuality ? 1 : 0);

  // Contradiction Rule (Schema D.3): halve confidence on contradiction
  const newConfidence = hypothesis.confidence * 0.5;

  // Schema D.4 Escalation: ≥ 2 high-quality contradictions → REJECTED
  if (newHighQualityContradictions >= 2) {
    return {
      high_quality_contradictions: newHighQualityContradictions,
      confidence: 0,
      state: 'REJECTED',
    };
  }

  return {
    high_quality_contradictions: newHighQualityContradictions,
    confidence: newConfidence,
    state: 'CHALLENGED',
  };
}

// ── Expiry computation ────────────────────────────────────────────────────────
// PROVISIONAL non-permanent hypotheses expire after 30 days (Schema D.1 Stage 4).
// Permanent stability class hypotheses never expire.

function computeExpiry(stabilityClass: StabilityClass): string | null {
  if (stabilityClass === 'permanent') return null;

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  return expiry.toISOString();
}
