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
 *   • Explicit-correction fast path (`maybeConfirm`): upgrade an existing
 *     VALIDATED Learning to CONFIRMED when a user correction event
 *     (`intelligence.user.correction`) targets that taxonomy category —
 *     corrections bypass quarantine and apply immediately (Contracts B.2).
 *
 * Persistence: writes to intelligence.learnings via UserIntelligenceDomain's
 * insertLearning() / getLatestValidatedLearning() / confirmLearning() — this
 * class holds no SupabaseClient of its own.
 *
 * Completion Mission note (Gap Analysis G-2, resolved this session): prior
 * to this session, this class held its own `SupabaseClient` and wrote to
 * `intelligence.learnings` directly, bypassing `UserIntelligenceDomain`,
 * which is the documented sole owner of that table. All persistence now
 * routes through the domain; the promotion/confirmation business logic
 * (threshold checks, escalation rule, confidence math) is unchanged.
 *
 * Source: BrandOS Logical Intelligence Schema D.1 Stages 4–5, D.4, E.3.
 * Source: BrandOS Intelligence Contracts B.2 (Hypothesis → Learning gate).
 */

import type { Hypothesis, Learning, StabilityClass, TaxonomyCategory } from '../types/entities';
import type { DomainType } from '../types/domains';
import type { UserIntelligenceDomain } from '../domains/UserIntelligenceDomain';
import type { Observation } from './types';
import { subjectRefOf } from '../types/subject';

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

// ── Explicit-correction confirmation boost ────────────────────────────────────
// A correction targeting an already-VALIDATED Learning's taxonomy category
// is treated as strong corroboration: confirm the Learning with a modest
// confidence bump, mirroring the boost previously applied by maybeConfirm().
const CORRECTION_CONFIRMATION_BOOST = 0.1;

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
  constructor(private readonly userDomain: UserIntelligenceDomain) {}

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
   *
   * Wired this session to the `intelligence.user.correction` event via
   * `FeedbackProcessor` (Completion Mission — connects a previously dormant
   * capability: this method existed and was documented as the intended
   * handler for explicit corrections, but nothing on the event bus called
   * it — see IMPLEMENTATION_STATUS.md for the full trace).
   */
  async maybeConfirm(userId: string, taxonomyCategory: TaxonomyCategory): Promise<boolean> {
    const learning = await this.userDomain.getLatestValidatedLearning(userId, taxonomyCategory);
    if (!learning) return false;

    const confirmedConfidence = Math.min(learning.confidence + CORRECTION_CONFIRMATION_BOOST, 1.0);
    await this.userDomain.confirmLearning(learning.id, confirmedConfidence);

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
    // ADR-003 (Subject-Centric Intelligence): the Subject that owns this
    // Hypothesis owns the Learning it's promoted into — this reads
    // `hypothesis.subjectType`/`workspaceId` rather than assuming a User
    // subject and hardcoding `workspaceId: null` the way this method did
    // before ADR-003. A Workspace-subject Learning is tagged
    // 'workspace_intelligence' regardless of taxonomy category, mirroring
    // `ObservationBuilder.build()`'s identical override and
    // `WorkspaceIntelligenceDomain.getWorkspaceLearnings()`'s existing
    // domain-filter convention.
    const subject = subjectRefOf(hypothesis);
    const domain: DomainType =
      subject.subjectType === 'workspace' ? 'workspace_intelligence' : domainFor(hypothesis.taxonomyCategory);

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

    return this.userDomain.insertLearning({
      userId:              subject.subjectType === 'user' ? subject.subjectId : null,
      workspaceId:         subject.subjectType === 'workspace' ? subject.subjectId : null,
      subjectType:         subject.subjectType,
      projectId:           hypothesis.projectId,
      domain,
      taxonomyCategory:    hypothesis.taxonomyCategory,
      stabilityClass:      hypothesis.stabilityClass,
      state:               'VALIDATED',
      confidence,
      contextScope,
      contextArtifactType: hypothesis.contextArtifactType,
      contextProjectId:    hypothesis.projectId,
      contextAudienceType: null,
      content:             hypothesis.proposition,
      sourceSummary,
      decayRate,
      lastConfirmedAt:     new Date(),
      decayStartedAt:      null,
      archivedAt:          null,
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPromotableState(state: Hypothesis['state']): boolean {
  return state === 'ACCUMULATING' || state === 'CHALLENGED';
}
