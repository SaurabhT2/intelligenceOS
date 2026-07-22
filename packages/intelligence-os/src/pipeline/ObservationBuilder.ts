/**
 * ObservationBuilder.ts
 *
 * Stage 2 of the Learning Pipeline.
 *
 * Responsibilities (per Sprint 2 spec and Contracts B.2):
 *   • Validate incoming Signals
 *   • Score source quality
 *   • Attach taxonomy categorisation
 *   • Enforce confidence ceilings defined by source quality (Schema D.3 Ceiling Rule)
 *   • Produce Observation records for the HypothesisEngine
 *
 * Source: BrandOS Logical Intelligence Schema D.1 Stage 2, D.3.
 * Source: BrandOS Intelligence Contracts B.2 (Signal → Observation gate).
 */

import type { Signal, TaxonomyCategory, StabilityClass, EvidenceRecord } from '../types/entities';
import type { DomainType } from '../types/domains';
import type { Observation, SourceQuality } from './types';
import { SOURCE_QUALITY_CEILING } from './types';
import type { SubjectRef } from '../types/subject';

// ── Stability class map ────────────────────────────────────────────────────────
// Source: BrandOS Learning Taxonomy (each category's stability class).
// Permanent = professional identity core; Long-Term = expertise/frameworks;
// Medium-Term = preferences/style/context-bound.

const CATEGORY_STABILITY: Record<TaxonomyCategory, StabilityClass> = {
  professional_identity:          'permanent',
  expertise_domains:              'long_term',
  skills_inventory:               'long_term',
  communication_style:            'long_term',
  writing_style:                  'long_term',
  strategic_thinking_patterns:    'long_term',
  decision_making_style:          'long_term',
  goals_and_objectives:           'medium_term',
  constraints_and_boundaries:     'medium_term',
  operating_principles:           'permanent',
  knowledge_assets:               'long_term',
  intellectual_frameworks:        'long_term',
  stakeholder_map:                'medium_term',
  audience_intelligence:          'medium_term',
  tool_and_technology_preferences:'medium_term',
  model_preferences:              'medium_term',
  success_metrics:                'medium_term',
  temporal_patterns:              'medium_term',
  emotional_register:             'medium_term',
  learning_and_curiosity_patterns:'medium_term',
  collaboration_and_leadership_style:'long_term',
  cultural_and_linguistic_context:'long_term',
  domain_specific_vocabulary:     'long_term',
  competitive_intelligence:       'medium_term',
  personal_brand_signal:          'long_term',
};

// ── Domain ownership map ───────────────────────────────────────────────────────
// Maps taxonomy categories to their owning domain (Schema F.1).

const CATEGORY_DOMAIN: Record<TaxonomyCategory, DomainType> = {
  professional_identity:          'user_intelligence',
  expertise_domains:              'user_intelligence',
  skills_inventory:               'user_intelligence',
  communication_style:            'user_intelligence',
  writing_style:                  'user_intelligence',
  strategic_thinking_patterns:    'user_intelligence',
  decision_making_style:          'user_intelligence',
  goals_and_objectives:           'user_intelligence',
  constraints_and_boundaries:     'user_intelligence',
  operating_principles:           'user_intelligence',
  knowledge_assets:               'knowledge_intelligence',
  intellectual_frameworks:        'user_intelligence',
  stakeholder_map:                'relationship_intelligence',
  audience_intelligence:          'relationship_intelligence',
  tool_and_technology_preferences:'user_intelligence',
  model_preferences:              'user_intelligence',
  success_metrics:                'user_intelligence',
  temporal_patterns:              'user_intelligence',
  emotional_register:             'user_intelligence',
  learning_and_curiosity_patterns:'user_intelligence',
  collaboration_and_leadership_style:'user_intelligence',
  cultural_and_linguistic_context:'user_intelligence',
  domain_specific_vocabulary:     'user_intelligence',
  competitive_intelligence:       'user_intelligence',
  personal_brand_signal:          'user_intelligence',
};

// ── Source quality classification from signal source type ─────────────────────

function classifySourceQuality(signal: Signal): SourceQuality {
  switch (signal.sourceType) {
    case 'explicit_statement':
      return 'explicit_statement';
    case 'uploaded_artifact':
      return 'uploaded_artifact';
    case 'feedback_event':
    case 'behavioral':
      return 'demonstrated_behavior';
    case 'edit_diff':
      // Edit diffs are demonstrated behavior — they reveal actual preference
      return 'demonstrated_behavior';
    case 'prompt':
    default:
      return 'inferred';
  }
}

// ── Initial confidence from source quality ────────────────────────────────────
// Sprint 2 decision: initial confidence = 60% of ceiling, floored at 0.1.
// This provides a meaningful starting value without over-claiming confidence
// before corroboration (Schema D.3 Ceiling Rule — ceiling is an upper bound,
// not a starting value).

function initialConfidence(quality: SourceQuality): number {
  const ceiling = SOURCE_QUALITY_CEILING[quality];
  return Math.max(0.1, ceiling * 0.6);
}

// ── ObservationBuilder ─────────────────────────────────────────────────────────

export class ObservationBuilder {
  /**
   * Builds an Observation from a validated (non-quarantined) Signal.
   *
   * Returns null if the signal fails validation:
   *   - Missing taxonomy category
   *   - Signal is quarantined (should have been filtered before this stage)
   *
   * The confidence ceiling is enforced: the resulting Observation's confidence
   * can never exceed SOURCE_QUALITY_CEILING[sourceQuality], regardless of any
   * content-derived confidence estimate (Schema D.3 Ceiling Rule).
   */
  build(signal: Signal): Observation | null {
    // Gate: quarantined signals must not reach Stage 2
    if (signal.isQuarantined) {
      return null;
    }

    // Gate: must have a taxonomy category
    if (!signal.taxonomyCategory) {
      return null;
    }

    const taxonomyCategory = signal.taxonomyCategory;
    const sourceQuality = classifySourceQuality(signal);
    const ceiling = SOURCE_QUALITY_CEILING[sourceQuality];
    const rawConfidence = initialConfidence(sourceQuality);

    // Ceiling rule: cap confidence
    const confidence = Math.min(rawConfidence, ceiling);

    const stabilityClass = CATEGORY_STABILITY[taxonomyCategory] ?? 'medium_term';
    // ADR-003 (Subject-Centric Intelligence): a Workspace-subject learning is
    // owned, by table-write convention, under the 'workspace_intelligence'
    // domain regardless of which taxonomy category it's classified into —
    // this mirrors the domain tag `context/observationToWorkspaceLearning.ts`
    // (the module this generalizes) always applied to workspace-scoped
    // learnings, and keeps `WorkspaceIntelligenceDomain.getWorkspaceLearnings()`'s
    // optional `domain` filter meaningful for a Workspace's own data. A
    // User-subject signal keeps the content-derived CATEGORY_DOMAIN mapping,
    // unchanged from before this ADR.
    const domain: DomainType =
      signal.subjectType === 'workspace'
        ? 'workspace_intelligence'
        : CATEGORY_DOMAIN[taxonomyCategory] ?? 'user_intelligence';

    // Infer disposition from signal content
    const disposition = inferDisposition(signal);

    const subject: SubjectRef =
      signal.subjectType === 'workspace' && signal.workspaceId
        ? { subjectType: 'workspace', subjectId: signal.workspaceId }
        : { subjectType: 'user', subjectId: signal.userId ?? '' };

    const observation: Observation = {
      signalId: signal.id,
      userId: subject.subjectType === 'user' ? subject.subjectId : '',
      subject,
      subjectType: subject.subjectType,
      workspaceId: subject.subjectType === 'workspace' ? subject.subjectId : null,
      projectId: signal.projectId,
      taxonomyCategory,
      stabilityClass,
      domain,
      sourceQuality,
      confidence,
      disposition,
      content: {
        ...signal.rawContent,
        signalSourceType: signal.sourceType,
      },
      // Evidence/Identity Bridge (ADR-005): pass through the structured
      // provenance record when the producing extractor supplied one
      // (`EvidenceExtractor` sets `rawContent.provenance`; existing
      // feedback/observation extractors don't, and HypothesisEngine falls
      // back to a synthesized record in that case — see Observation.evidence's
      // doc comment).
      evidence: isEvidenceRecord(signal.rawContent['provenance'])
        ? signal.rawContent['provenance']
        : undefined,
      contextFlags: signal.contextFlags,
      createdAt: new Date(),
    };

    return observation;
  }

  /**
   * Applies the confidence ceiling to a raw confidence value.
   * Exported for testing and for use by the HypothesisEngine when
   * merging observation confidence into hypothesis confidence.
   */
  applyCeiling(rawConfidence: number, quality: SourceQuality): number {
    return Math.min(rawConfidence, SOURCE_QUALITY_CEILING[quality]);
  }

  /**
   * Returns the stability class for a given taxonomy category.
   */
  stabilityClassFor(category: TaxonomyCategory): StabilityClass {
    return CATEGORY_STABILITY[category] ?? 'medium_term';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * `signal.rawContent` is an untyped `Record<string, unknown>` bag (shared
 * shape across every Signal producer), so a `provenance` key placed there
 * by `EvidenceExtractor` needs a runtime check before being trusted as an
 * `EvidenceRecord` — a narrow structural check, not full schema validation,
 * matching this file's existing defensive-optional-chaining conventions.
 */
function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['sourceKind'] === 'string' &&
    typeof v['sourceId'] === 'string' &&
    typeof v['taxonomyCategory'] === 'string' &&
    Array.isArray(v['supportingItems'])
  );
}

function inferDisposition(signal: Signal): Observation['disposition'] {
  const eventType = signal.rawContent['eventType'] as string | undefined;

  // Rejection and explicit negative feedback are contradicting signals
  if (eventType === 'rejected') {
    return 'contradicting';
  }

  // Deployment and acceptance corroborate the current model
  if (eventType === 'deployed' || eventType === 'accepted') {
    return 'corroborating';
  }

  // Edit diffs: presence of vocabulary changes or section removals signals
  // partial contradiction; overall accepted-then-edited = partially corroborating.
  // Sprint 2 decision: treat 'edited' as 'corroborating' with lower weight
  // (confidence handled via source quality ceiling); full delta-learning
  // targeting specific changes is a Sprint 3+ enhancement.
  if (eventType === 'edited') {
    return 'corroborating';
  }

  // ADR-003 (Subject-Centric Intelligence): a Workspace-subject signal
  // carries no eventType at all — `SignalExtractor.extractFromObservation`
  // packages the observed governance score instead. A meaningfully high
  // score corroborates whatever pattern led to it; a governance-repaired
  // artifact (score reflects the *repaired* output, not the original
  // generation) or a low score contradicts it. This mirrors the
  // accepted/rejected reasoning above, applied to the one signal quality a
  // Workspace observation actually reports.
  if (signal.subjectType === 'workspace') {
    const wasRepaired = signal.rawContent['wasRepaired'] === true;
    const normalizedScore = signal.rawContent['normalizedScore'];
    if (wasRepaired) return 'contradicting';
    if (typeof normalizedScore === 'number') {
      return normalizedScore >= 0.5 ? 'corroborating' : 'contradicting';
    }
    return 'new';
  }

  // New hypothesis for anything else
  return 'new';
}
