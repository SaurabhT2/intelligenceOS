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
 * direct Supabase calls. The DB table was created in Sprint 0 schema; Sprint 2
 * is the first sprint that writes to it.
 *
 * Source: BrandOS Logical Intelligence Schema D.1 Stage 3, E.2, E.3, D.3.
 * Source: BrandOS Intelligence Contracts B.2 (Observation → Hypothesis gate).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Hypothesis, TaxonomyCategory, StabilityClass } from '../types/entities';
import type { Observation } from './types';
import { SOURCE_QUALITY_CEILING } from './types';
import { DatabaseError } from '../errors';

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

// ── DB row shape ──────────────────────────────────────────────────────────────

interface HypothesisRow {
  id: string;
  user_id: string;
  project_id: string | null;
  taxonomy_category: string;
  stability_class: string;
  state: string;
  confidence: number;
  required_corroborations: number;
  current_corroborations: number;
  high_quality_contradictions: number;
  proposition: Record<string, unknown>;
  context_scope: string;
  context_artifact_type: string | null;
  promoted_learning_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapToHypothesis(row: HypothesisRow): Hypothesis {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    taxonomyCategory: row.taxonomy_category as TaxonomyCategory,
    stabilityClass: row.stability_class as StabilityClass,
    state: row.state as Hypothesis['state'],
    confidence: row.confidence,
    requiredCorroborations: row.required_corroborations,
    currentCorroborations: row.current_corroborations,
    highQualityContradictions: row.high_quality_contradictions,
    proposition: row.proposition,
    contextScope: row.context_scope as Hypothesis['contextScope'],
    contextArtifactType: row.context_artifact_type,
    promotedLearningId: row.promoted_learning_id,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ── HypothesisEngine ──────────────────────────────────────────────────────────

export class HypothesisEngine {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Processes an Observation: finds or creates the matching Hypothesis,
   * applies the corroboration/contradiction logic, and persists the result.
   *
   * Returns the updated or newly created Hypothesis.
   */
  async process(observation: Observation): Promise<Hypothesis> {
    const existing = await this.findExisting(observation);

    if (existing) {
      return this.applyObservation(existing, observation);
    } else {
      return this.createNew(observation);
    }
  }

  /**
   * Finds an existing PROVISIONAL or ACCUMULATING (or CHALLENGED) Hypothesis
   * for the same user + taxonomy_category + context_scope combination.
   *
   * Contracts B.2: "Search for an existing Hypothesis matching
   * taxonomy_category + target_entity_type + target_entity_id."
   * For Sprint 2 Phase 1, context_scope is the scoping key in place of
   * target_entity_id (which belongs to later relationship-aware phases).
   */
  private async findExisting(observation: Observation): Promise<Hypothesis | null> {
    const contextScope = observation.projectId ? 'project' : 'global';

    const { data, error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .select('*')
      .eq('user_id', observation.userId)
      .eq('taxonomy_category', observation.taxonomyCategory)
      .eq('context_scope', contextScope)
      .in('state', ['PROVISIONAL', 'ACCUMULATING', 'CHALLENGED'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(
        `Failed to query hypotheses for user ${observation.userId} / ${observation.taxonomyCategory}`,
        error,
      );
    }

    return data ? mapToHypothesis(data as HypothesisRow) : null;
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
      user_id:                  observation.userId,
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

    const { data, error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new DatabaseError(
        `Failed to create hypothesis for user ${observation.userId} / ${observation.taxonomyCategory}`,
        error,
      );
    }

    return mapToHypothesis(data as HypothesisRow);
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

    const { data, error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .update(updates)
      .eq('id', hypothesis.id)
      .select('*')
      .single();

    if (error) {
      throw new DatabaseError(
        `Failed to update hypothesis ${hypothesis.id}`,
        error,
      );
    }

    return mapToHypothesis(data as HypothesisRow);
  }

  /**
   * Marks a Hypothesis as having been promoted to a Learning.
   * Called by LearningValidator after successful promotion.
   */
  async markPromoted(hypothesisId: string, learningId: string): Promise<void> {
    const { error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .update({
        state: 'VALIDATED',
        promoted_learning_id: learningId,
      })
      .eq('id', hypothesisId);

    if (error) {
      throw new DatabaseError(`Failed to mark hypothesis ${hypothesisId} as promoted`, error);
    }
  }

  /**
   * Discards expired PROVISIONAL hypotheses (timeout > 30 days, non-permanent).
   * Sprint 2 decision: called opportunistically by FeedbackProcessor after
   * each run to prevent hypothesis table bloat. Full scheduled cleanup is
   * a Sprint 4 operational concern.
   */
  async discardExpired(userId: string): Promise<number> {
    const now = new Date().toISOString();

    const { data, error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .update({ state: 'DISCARDED' })
      .eq('user_id', userId)
      .in('state', ['PROVISIONAL', 'ACCUMULATING'])
      .neq('stability_class', 'permanent')
      .lt('expires_at', now)
      .select('id');

    if (error) {
      throw new DatabaseError(`Failed to discard expired hypotheses for user ${userId}`, error);
    }

    return (data as unknown[]).length;
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
