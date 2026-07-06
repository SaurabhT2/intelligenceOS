/**
 * LearningValidator.ts
 *
 * Stage 4–5 of the Learning Pipeline.
 *
 * Responsibilities (per Sprint 2 spec and Contracts B.2 Hypothesis → Learning):
 *   • Evaluate corroboration threshold for Hypothesis → Learning promotion
 *   • Check for unresolved high-quality contradictions
 *   • Apply escalation rule (3+ corroborations, 0 contradictions → High confidence)
 *   • Create Learning records (state: VALIDATED)
 *   • Assign stability_class, decay_rate, context_scope
 *   • Write to intelligence.learnings via UserIntelligenceDomain
 *
 * The domain write is handled by calling the DB directly here rather than
 * through UserIntelligenceDomain.insertLearning() (which throws
 * PhaseNotImplementedError). Sprint 2 design decision: implement the actual
 * DB write in this validator since it owns Stage 5 per the architecture.
 * UserIntelligenceDomain.insertLearning() will be un-stubbed as part of
 * this sprint per the architecture pattern — the domain stub exists as a
 * typed surface; the real implementation goes here and is called from here.
 *
 * Source: BrandOS Logical Intelligence Schema D.1 Stages 4–5, D.4, E.3.
 * Source: BrandOS Intelligence Contracts B.2 (Hypothesis → Learning gate).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Hypothesis, Learning, StabilityClass, TaxonomyCategory } from '../types/entities';
import type { DomainType } from '../types/domains';
import type { Observation } from './types';
import { DatabaseError } from '../errors';

// ── Decay rate map (Schema D.1 Stage 5 — from stability_class) ───────────────
// permanent → none, long_term → slow, medium_term → standard

const DECAY_RATE: Record<StabilityClass, Learning['decayRate']> = {
  permanent:   'none',
  long_term:   'slow',
  medium_term: 'standard',
};

// ── High confidence threshold for escalation ──────────────────────────────────
// Schema D.4: 3+ corroborations with 0 contradictions → High confidence
const ESCALATION_CONFIDENCE = 0.85;

// ── DB row shape ──────────────────────────────────────────────────────────────

interface LearningRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  project_id: string | null;
  domain: string;
  taxonomy_category: string;
  stability_class: string;
  state: string;
  confidence: number;
  context_scope: string;
  context_artifact_type: string | null;
  context_project_id: string | null;
  context_audience_type: string | null;
  content: Record<string, unknown>;
  source_summary: Record<string, unknown>;
  decay_rate: string | null;
  last_confirmed_at: string | null;
  decay_started_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapToLearning(row: LearningRow): Learning {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    domain: row.domain as DomainType,
    taxonomyCategory: row.taxonomy_category as TaxonomyCategory,
    stabilityClass: row.stability_class as StabilityClass,
    state: row.state as Learning['state'],
    confidence: row.confidence,
    contextScope: row.context_scope as Learning['contextScope'],
    contextArtifactType: row.context_artifact_type,
    contextProjectId: row.context_project_id,
    contextAudienceType: row.context_audience_type,
    content: row.content,
    sourceSummary: row.source_summary,
    decayRate: row.decay_rate as Learning['decayRate'],
    lastConfirmedAt: row.last_confirmed_at ? new Date(row.last_confirmed_at) : null,
    decayStartedAt: row.decay_started_at ? new Date(row.decay_started_at) : null,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ── Domain lookup ──────────────────────────────────────────────────────────────

const CATEGORY_DOMAIN: Partial<Record<TaxonomyCategory, DomainType>> = {
  stakeholder_map:       'relationship_intelligence',
  audience_intelligence: 'relationship_intelligence',
  knowledge_assets:      'knowledge_intelligence',
};

function domainFor(category: TaxonomyCategory): DomainType {
  return CATEGORY_DOMAIN[category] ?? 'user_intelligence';
}

// ── LearningValidator ─────────────────────────────────────────────────────────

export interface ValidationResult {
  promoted: boolean;
  learning: Learning | null;
  reason: string;
}

export class LearningValidator {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Evaluates whether the Hypothesis is ready for promotion to a Learning.
   *
   * Promotion conditions (Contracts B.2 Hypothesis → Learning):
   *   • current_corroborations ≥ required_corroborations
   *   • high_quality_contradictions === 0
   *   OR
   *   • Escalation: current_corroborations ≥ 3 AND high_quality_contradictions === 0
   *
   * Returns ValidationResult with promoted=true and the created Learning on success.
   */
  async evaluate(hypothesis: Hypothesis, triggeringObservation?: Observation): Promise<ValidationResult> {
    // Must be in a promotable state
    if (!isPromotableState(hypothesis.state)) {
      return {
        promoted: false,
        learning: null,
        reason: `Hypothesis state ${hypothesis.state} is not promotable`,
      };
    }

    // Cannot promote with unresolved high-quality contradictions
    if (hypothesis.highQualityContradictions > 0) {
      return {
        promoted: false,
        learning: null,
        reason: `Hypothesis has ${hypothesis.highQualityContradictions} unresolved high-quality contradiction(s)`,
      };
    }

    const meetsThreshold =
      hypothesis.currentCorroborations >= hypothesis.requiredCorroborations;
    const meetsEscalation =
      hypothesis.currentCorroborations >= 3 && hypothesis.highQualityContradictions === 0;

    if (!meetsThreshold && !meetsEscalation) {
      return {
        promoted: false,
        learning: null,
        reason: `Corroborations ${hypothesis.currentCorroborations}/${hypothesis.requiredCorroborations} — threshold not met`,
      };
    }

    // Determine final confidence
    const confidence = meetsEscalation
      ? Math.max(hypothesis.confidence, ESCALATION_CONFIDENCE)
      : hypothesis.confidence;

    // Promote to Learning
    const learning = await this.createLearning(hypothesis, confidence, triggeringObservation);

    return {
      promoted: true,
      learning,
      reason: meetsEscalation
        ? `Escalation rule: ${hypothesis.currentCorroborations} corroborations, 0 contradictions`
        : `Threshold met: ${hypothesis.currentCorroborations}/${hypothesis.requiredCorroborations} corroborations`,
    };
  }

  /**
   * Checks whether an existing Learning for this user + category should be
   * confirmed (upgraded from VALIDATED to CONFIRMED) based on new corroboration.
   */
  async maybeConfirm(userId: string, taxonomyCategory: TaxonomyCategory): Promise<boolean> {
    // Find VALIDATED learnings for this user + category
    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .select('*')
      .eq('user_id', userId)
      .eq('taxonomy_category', taxonomyCategory)
      .eq('state', 'VALIDATED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new DatabaseError(`Failed to query learnings for confirmation`, error);
    if (!data) return false;

    const learning = mapToLearning(data as LearningRow);

    // Confirm it with boosted confidence
    const confirmedConfidence = Math.min(learning.confidence + 0.1, 1.0);

    const { error: updateError } = await this.db
      .schema('intelligence')
      .from('learnings')
      .update({
        state: 'CONFIRMED',
        confidence: confirmedConfidence,
        last_confirmed_at: new Date().toISOString(),
      })
      .eq('id', learning.id);

    if (updateError) throw new DatabaseError(`Failed to confirm learning ${learning.id}`, updateError);

    return true;
  }

  // ── Private: create Learning record ─────────────────────────────────────────

  private async createLearning(
    hypothesis: Hypothesis,
    confidence: number,
    triggeringObservation?: Observation,
  ): Promise<Learning> {
    const contextScope: Learning['contextScope'] = hypothesis.contextScope;
    const decayRate = DECAY_RATE[hypothesis.stabilityClass];
    const domain = domainFor(hypothesis.taxonomyCategory);

    const sourceSummary: Record<string, unknown> = {
      hypothesisId: hypothesis.id,
      corroborations: hypothesis.currentCorroborations,
      contradictions: hypothesis.highQualityContradictions,
      promotedAt: new Date().toISOString(),
    };

    if (triggeringObservation) {
      sourceSummary['triggeringSignalId'] = triggeringObservation.signalId;
      sourceSummary['sourceQuality'] = triggeringObservation.sourceQuality;
    }

    const payload = {
      user_id:              hypothesis.userId,
      workspace_id:         null as string | null,
      project_id:           hypothesis.projectId,
      domain,
      taxonomy_category:    hypothesis.taxonomyCategory,
      stability_class:      hypothesis.stabilityClass,
      state:                'VALIDATED' as const,
      confidence,
      context_scope:        contextScope,
      context_artifact_type: hypothesis.contextArtifactType,
      context_project_id:   hypothesis.projectId,
      context_audience_type: null as string | null,
      content:              hypothesis.proposition,
      source_summary:       sourceSummary,
      decay_rate:           decayRate,
      last_confirmed_at:    new Date().toISOString(),
      decay_started_at:     null as string | null,
      archived_at:          null as string | null,
    };

    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new DatabaseError(
        `Failed to create learning for hypothesis ${hypothesis.id}`,
        error,
      );
    }

    return mapToLearning(data as LearningRow);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPromotableState(state: Hypothesis['state']): boolean {
  return state === 'ACCUMULATING' || state === 'CHALLENGED';
}
