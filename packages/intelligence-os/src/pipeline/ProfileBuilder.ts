/**
 * ProfileBuilder.ts
 *
 * Stage 6 of the Learning Pipeline.
 *
 * Responsibilities (per Sprint 2 spec and Contracts B.2 Learning → Profile):
 *   • Assemble Intelligence Profile from all active Learnings
 *   • Version new profiles (increment version, mark previous non-current)
 *   • Compute composite confidence score (weighted by Taxonomy impact hierarchy)
 *   • Decide whether a rebuild is required
 *   • Emit intelligence.profile.updated event on rebuild
 *
 * Rebuild triggers (Contracts B.2 Learning → Intelligence Profile):
 *   • > 3 high-confidence Learnings added since last rebuild
 *   • Any permanent stability-class Learning changes
 *   • Profile not validated against new Learnings in > 60 days
 *
 * Persistence: reads/writes intelligence.profiles and reads
 * intelligence.learnings via UserIntelligenceDomain — this class holds no
 * SupabaseClient of its own.
 *
 * Completion Mission note (Gap Analysis G-2, resolved this session): prior
 * to this session, this class held its own `SupabaseClient` and wrote to
 * `intelligence.profiles` directly, bypassing `UserIntelligenceDomain`,
 * which is the documented sole owner of that table. All persistence now
 * routes through the domain (`upsertProfile()` + `markPreviousProfilesNonCurrent()`
 * for the write, `getCurrentProfile()` / `getAllActiveLearnings()` /
 * `countLearningsSince()` for the reads); the composite-confidence and
 * domain-summary computation logic is unchanged.
 *
 * Source: BrandOS Logical Intelligence Schema D.1 Stage 6, B.2.
 * Source: BrandOS Intelligence Contracts B.2 (Learning → Intelligence Profile).
 * Source: BrandOS Learning Taxonomy Section G (Intelligence Value Hierarchy).
 */

import type { IntelligenceProfile, Learning, TaxonomyCategory } from '../types/entities';
import type { UserIntelligenceDomain } from '../domains/UserIntelligenceDomain';
import type { IntelligenceEventBus } from '../events/IntelligenceEventBus';
import { userSubject, type SubjectRef } from '../types/subject';

// ── Taxonomy impact weights (Section G — Intelligence Value Hierarchy) ─────────
// Categories rated ★★★★★ in artifact quality OR personalization get weight 1.0;
// ★★★★ → 0.8; ★★★ → 0.6; ★★ → 0.4; ★ → 0.2.
// Used for composite confidence scoring.

const TAXONOMY_WEIGHT: Partial<Record<TaxonomyCategory, number>> = {
  communication_style:            1.0,  // #1 — Critical impact across all dimensions
  writing_style:                  1.0,
  goals_and_objectives:           1.0,  // #2 — Highest strategic impact
  professional_identity:          0.8,  // #3
  expertise_domains:              0.8,  // #4
  knowledge_assets:               0.8,  // #5
  stakeholder_map:                0.8,  // #6
  strategic_thinking_patterns:    0.8,  // #7
  decision_making_style:          0.6,  // #8
  operating_principles:           0.6,  // #9
  audience_intelligence:          0.8,  // #10
  intellectual_frameworks:        0.6,  // #11
  success_metrics:                0.6,  // #12
  constraints_and_boundaries:     0.6,  // #13
  tool_and_technology_preferences:0.4,  // #14
  competitive_intelligence:       0.6,  // #15
  temporal_patterns:              0.4,  // #16
  cultural_and_linguistic_context:0.6,  // #17
  emotional_register:             0.4,  // #18
  learning_and_curiosity_patterns:0.4,  // #19
  collaboration_and_leadership_style:0.4, // #20
  model_preferences:              0.4,
  skills_inventory:               0.6,
  domain_specific_vocabulary:     0.6,
  personal_brand_signal:          0.6,
};

const DEFAULT_WEIGHT = 0.4;

// ── Rebuild threshold ─────────────────────────────────────────────────────────
// Contracts B.2: rebuild when > 3 high-confidence Learnings added.
const HIGH_CONFIDENCE_THRESHOLD = 0.65;
const NEW_LEARNINGS_REBUILD_THRESHOLD = 3;
// 60-day staleness threshold in milliseconds
const STALENESS_MS = 60 * 24 * 60 * 60 * 1000;

// ── RebuildDecision ───────────────────────────────────────────────────────────

export interface RebuildDecision {
  shouldRebuild: boolean;
  reason: string;
  newLearningsCount: number;
}

// ── ProfileBuilder ────────────────────────────────────────────────────────────

export class ProfileBuilder {
  constructor(
    private readonly userDomain: UserIntelligenceDomain,
    private readonly bus: IntelligenceEventBus,
  ) {}

  /**
   * Evaluates whether a profile rebuild is needed for the given user,
   * considering the newly created Learning and the current profile state.
   *
   * Returns a RebuildDecision that FeedbackProcessor uses to decide whether
   * to call rebuild().
   */
  /**
   * Evaluates whether a profile rebuild is needed for the given user,
   * considering the newly created Learning and the current profile state.
   *
   * Returns a RebuildDecision that FeedbackProcessor uses to decide whether
   * to call rebuild().
   *
   * Retained under this name/signature for backward compatibility with
   * existing User-subject callers; delegates to `shouldRebuildForSubject`
   * (ADR-003).
   */
  async shouldRebuild(userId: string, newLearning: Learning): Promise<RebuildDecision> {
    return this.shouldRebuildForSubject(userSubject(userId), newLearning);
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) — evaluates whether a profile
   * rebuild is needed for any Subject (User or Workspace), considering the
   * newly created Learning and the current profile state. Identical logic
   * to `shouldRebuild`, generalized to read via the Subject-generic domain
   * methods.
   */
  async shouldRebuildForSubject(subject: SubjectRef, newLearning: Learning): Promise<RebuildDecision> {
    // Permanent-class change always triggers rebuild (Contracts B.2)
    if (newLearning.stabilityClass === 'permanent') {
      return {
        shouldRebuild: true,
        reason: 'Permanent stability-class learning created',
        newLearningsCount: 1,
      };
    }

    // Count high-confidence learnings created since last profile update
    const currentProfile = await this.userDomain.getCurrentProfileForSubject(subject);

    if (!currentProfile) {
      // No profile yet — rebuild to create the first one
      return {
        shouldRebuild: true,
        reason: 'No profile exists — initial build required',
        newLearningsCount: 1,
      };
    }

    // Check staleness (> 60 days since last update)
    const ageMs = Date.now() - currentProfile.updatedAt.getTime();
    if (ageMs > STALENESS_MS) {
      return {
        shouldRebuild: true,
        reason: 'Profile staleness threshold exceeded (> 60 days)',
        newLearningsCount: 1,
      };
    }

    // Count new high-confidence learnings since last rebuild
    const newHighConfidenceLearnings = await this.userDomain.countLearningsSinceForSubject(
      subject,
      currentProfile.updatedAt,
      HIGH_CONFIDENCE_THRESHOLD,
    );

    if (newHighConfidenceLearnings > NEW_LEARNINGS_REBUILD_THRESHOLD) {
      return {
        shouldRebuild: true,
        reason: `${newHighConfidenceLearnings} new high-confidence learnings since last rebuild (threshold: ${NEW_LEARNINGS_REBUILD_THRESHOLD})`,
        newLearningsCount: newHighConfidenceLearnings,
      };
    }

    return {
      shouldRebuild: false,
      reason: `${newHighConfidenceLearnings}/${NEW_LEARNINGS_REBUILD_THRESHOLD} new high-confidence learnings — below threshold`,
      newLearningsCount: newHighConfidenceLearnings,
    };
  }

  /**
   * Builds a new version of the Intelligence Profile from all active Learnings.
   *
   * Steps:
   *   1. Load all active Learnings for the user
   *   2. Compute composite confidence score
   *   3. Build domain summaries
   *   4. Persist new profile version (is_current = true)
   *   5. Mark previous version non-current
   *   6. Emit intelligence.profile.updated event
   *
   * Returns the new profile. Caller (FeedbackProcessor) is responsible for
   * deciding when to call this.
   *
   * Retained under this name/signature for backward compatibility with
   * existing User-subject callers; delegates to `rebuildForSubject`
   * (ADR-003).
   */
  async rebuild(userId: string, changedDomains: string[] = []): Promise<IntelligenceProfile> {
    return this.rebuildForSubject(userSubject(userId), changedDomains);
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) — builds a new version of the
   * Intelligence Profile for any Subject (User or Workspace) from all of
   * that Subject's active Learnings. Identical steps and composite-
   * confidence/domain-summary computation to `rebuild`, generalized to
   * write via the Subject-generic domain methods. A Workspace's
   * synthesized identity reuses `intelligence.profiles` exactly the way a
   * User's does (ADR-003 §2.3 — no separate WorkspaceProfile table).
   */
  async rebuildForSubject(subject: SubjectRef, changedDomains: string[] = []): Promise<IntelligenceProfile> {
    const learnings = await this.userDomain.getAllActiveLearningsForSubject(subject);
    const currentProfile = await this.userDomain.getCurrentProfileForSubject(subject);

    const nextVersion = (currentProfile?.version ?? 0) + 1;
    const compositeConfidence = computeCompositeConfidence(learnings);
    const summaries = buildDomainSummaries(learnings);

    const newProfile: IntelligenceProfile = {
      id:                   crypto.randomUUID(),
      userId:               subject.subjectType === 'user' ? subject.subjectId : null,
      workspaceId:          subject.subjectType === 'workspace' ? subject.subjectId : null,
      subjectType:          subject.subjectType,
      version:              nextVersion,
      isCurrent:            true,
      compositeConfidence,
      archetypePrimary:     currentProfile?.archetypePrimary ?? null,
      archetypeConfidence:  currentProfile?.archetypeConfidence ?? null,
      voiceSummary:         summaries.voice,
      goalSummary:          summaries.goals,
      constraintSummary:    summaries.constraints,
      preferenceSummary:    summaries.preferences,
      expertiseDomains:     summaries.expertise,
      vocabularySnapshot:   summaries.vocabulary,
      createdAt:            new Date(),
      updatedAt:            new Date(),
    };

    // Persist new profile version
    await this.userDomain.upsertProfile(newProfile);

    // Mark previous version non-current
    if (currentProfile) {
      await this.userDomain.markPreviousProfilesNonCurrentForSubject(subject, newProfile.id);
    }

    // Emit profile.updated event
    await this.bus.emit('intelligence.profile.updated', {
      userId: subject.subjectType === 'user' ? subject.subjectId : '',
      workspaceId: subject.subjectType === 'workspace' ? subject.subjectId : undefined,
      subjectType: subject.subjectType,
      profileId: newProfile.id,
      version: nextVersion,
      changedDomains,
      compositeConfidence,
      occurredAt: new Date().toISOString(),
    });

    return newProfile;
  }
}

// ── Pure computation helpers ──────────────────────────────────────────────────

/**
 * Computes a weighted composite confidence from all active learnings.
 * Source: Contracts B.2 "weighted by Taxonomy impact hierarchy (Taxonomy Section G)".
 */
function computeCompositeConfidence(learnings: Learning[]): number {
  if (learnings.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const learning of learnings) {
    const weight = TAXONOMY_WEIGHT[learning.taxonomyCategory] ?? DEFAULT_WEIGHT;
    weightedSum += learning.confidence * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;

  // Round to 4 decimal places to avoid floating-point noise
  return Math.round((weightedSum / totalWeight) * 10000) / 10000;
}

/**
 * Groups Learnings into domain summary buckets for profile snapshot fields.
 * Each summary is a simple { [category]: content } map — a lightweight
 * snapshot that Blueprint Assembly can read without re-querying learnings.
 */
function buildDomainSummaries(learnings: Learning[]): {
  voice: Record<string, unknown> | null;
  goals: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  expertise: Record<string, unknown> | null;
  vocabulary: Record<string, unknown> | null;
} {
  const byCategory = new Map<string, Learning[]>();
  for (const l of learnings) {
    const existing = byCategory.get(l.taxonomyCategory) ?? [];
    existing.push(l);
    byCategory.set(l.taxonomyCategory, existing);
  }

  function summarise(categories: TaxonomyCategory[]): Record<string, unknown> | null {
    const result: Record<string, unknown> = {};
    for (const cat of categories) {
      const ls = byCategory.get(cat);
      if (ls && ls.length > 0) {
        // Take the highest-confidence learning per category for the snapshot
        const best = ls.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
        result[cat] = { confidence: best.confidence, content: best.content };
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  return {
    voice: summarise(['communication_style', 'writing_style', 'emotional_register']),
    goals: summarise(['goals_and_objectives', 'success_metrics']),
    constraints: summarise(['constraints_and_boundaries', 'operating_principles']),
    preferences: summarise([
      'tool_and_technology_preferences', 'model_preferences',
      'temporal_patterns', 'collaboration_and_leadership_style',
    ]),
    expertise: summarise(['expertise_domains', 'skills_inventory', 'domain_specific_vocabulary']),
    vocabulary: summarise(['domain_specific_vocabulary', 'cultural_and_linguistic_context']),
  };
}
