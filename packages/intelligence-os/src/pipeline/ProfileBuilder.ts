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
 *   • ADR-004 (Cognitive Consolidation): a new/changed `isCurrent`
 *     `KnowledgeAsset` for the Subject, subject to a debounce window —
 *     see `shouldRebuildForSubjectFromKnowledge()`.
 *
 * Persistence: reads/writes intelligence.profiles and reads
 * intelligence.learnings via UserIntelligenceDomain, and (ADR-004) reads
 * intelligence.knowledge_assets via KnowledgeIntelligenceDomain — this
 * class holds no SupabaseClient of its own.
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
 * ADR-004 (Cognitive Consolidation) note: this class is the "Unified
 * Intelligence Profile" generalization point — there is exactly one
 * rebuild executor (`rebuildForSubject()`), now invoked from two trigger
 * paths (an Experience/Learning trigger, unchanged, and a new Knowledge
 * trigger). It does not matter to `rebuildForSubject()` which trigger
 * fired it — it always reads both Learnings and current Knowledge and
 * produces one consistent profile. See ADR-004 §3.2.
 *
 * Source: BrandOS Logical Intelligence Schema D.1 Stage 6, B.2.
 * Source: BrandOS Intelligence Contracts B.2 (Learning → Intelligence Profile).
 * Source: BrandOS Learning Taxonomy Section G (Intelligence Value Hierarchy).
 */

import type { IntelligenceProfile, Learning, TaxonomyCategory, KnowledgeAsset, SynthesizedCollection, SynthesizedItem } from '../types/entities';
import type { UserIntelligenceDomain } from '../domains/UserIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../domains/KnowledgeIntelligenceDomain';
import type { IntelligenceEventBus } from '../events/IntelligenceEventBus';
import type { ExtractedFramework, FrameworkExtractionResult, VocabularyExtractionResult } from '../knowledge/types';
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

// ── ADR-004 (Cognitive Consolidation) constants ─────────────────────────────

/**
 * Confidence ceiling for Knowledge items sourced from general document
 * extraction (`SignalSourceType: 'uploaded_artifact'`) — deliberately below
 * the 1.0 ceiling `explicit_statement`-tier Knowledge (e.g. an admin's
 * `identityConfiguration`/`voiceConfiguration` declaration, ADR-003 §2.4)
 * can reach. Extracted text is not the same epistemic tier as a human
 * declaration. See ADR-004 §5.
 */
const KNOWLEDGE_EXTRACTION_CONFIDENCE_CEILING = 0.75;

/**
 * Minimum interval between two Knowledge-triggered rebuilds for the same
 * Subject. Without this, a workspace bulk-uploading many documents in quick
 * succession would fire `intelligence.signal.extracted` many times in a
 * short window, each independently satisfying the Knowledge rebuild trigger
 * and causing a rebuild storm. See ADR-004 §15 (Risks).
 */
const KNOWLEDGE_REBUILD_DEBOUNCE_MS = 5 * 60 * 1000;

// ── RebuildDecision ───────────────────────────────────────────────────────────

export interface RebuildDecision {
  shouldRebuild: boolean;
  reason: string;
  newLearningsCount: number;
}

// ── ProfileBuilder ────────────────────────────────────────────────────────────

export class ProfileBuilder {
  /**
   * G-7 (Architecture Verification Report, P1) — trailing-edge scheduler for
   * the Knowledge-triggered rebuild debounce. Keyed by Subject
   * (`${subjectType}:${subjectId}`) so a burst of uploads across different
   * subjects never shares a timer. `InProcessEventBus` is synchronous/
   * in-process and there is no persistent job queue yet (Sprint 4 per the
   * codebase's own roadmap comments), so this is a `setTimeout`-based
   * deferred call, not a durable job — a process restart mid-burst loses
   * the pending trailing rebuild. Acceptable for now; Sprint 4's queue is
   * the tracked follow-up for durable scheduling (see this method's own
   * docblock below and `shouldRebuildForSubjectFromKnowledge`'s).
   */
  private readonly pendingKnowledgeRebuilds = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly userDomain: UserIntelligenceDomain,
    private readonly bus: IntelligenceEventBus,
    /** ADR-004 (Cognitive Consolidation) — the Knowledge-side read this class gained. */
    private readonly knowledgeDomain: KnowledgeIntelligenceDomain,
  ) {}

  private subjectKey(subject: SubjectRef): string {
    return `${subject.subjectType}:${subject.subjectId}`;
  }

  /**
   * G-7 — schedules (or resets, if one is already pending for this Subject)
   * a trailing-edge rebuild timer for `KNOWLEDGE_REBUILD_DEBOUNCE_MS` past
   * *this* call — i.e. past the *last* upload in the burst, not the first.
   * Each subsequent debounced upload in the same burst pushes the timer
   * back out, so the deferred rebuild only fires once the burst has gone
   * fully quiet for a whole debounce window. When it fires, it rebuilds
   * unconditionally — bypassing `shouldRebuildForSubjectFromKnowledge()`'s
   * own leading-edge check, since firing this timer *is* the deferred
   * rebuild that check deliberately deferred.
   *
   * Never throws — a failed deferred rebuild is logged and swallowed,
   * matching `FeedbackProcessor.processKnowledgeExtraction()`'s existing
   * best-effort convention for this same trigger path.
   */
  private scheduleTrailingKnowledgeRebuild(subject: SubjectRef): void {
    const key = this.subjectKey(subject);
    const existing = this.pendingKnowledgeRebuilds.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.pendingKnowledgeRebuilds.delete(key);
      this.rebuildForSubject(subject, ['knowledge']).catch((err) => {
        console.error(
          `[ProfileBuilder] G-7 deferred Knowledge-triggered rebuild failed for subject ${key}:`,
          err,
        );
      });
    }, KNOWLEDGE_REBUILD_DEBOUNCE_MS);

    // A pending trailing rebuild should never keep a process/test runner
    // alive on its own — matches how a real job-queue worker wouldn't
    // block process exit either.
    if (typeof timer.unref === 'function') timer.unref();

    this.pendingKnowledgeRebuilds.set(key, timer);
  }

  /**
   * Cancels any pending trailing Knowledge rebuild for this Subject. Called
   * from `rebuildForSubject()` so that ANY rebuild — whichever trigger
   * caused it — cancels a redundant deferred rebuild still pending for the
   * same Subject; the profile is now current, so there is nothing left for
   * the deferred timer to do.
   */
  private cancelPendingKnowledgeRebuild(subject: SubjectRef): void {
    const key = this.subjectKey(subject);
    const existing = this.pendingKnowledgeRebuilds.get(key);
    if (existing) {
      clearTimeout(existing);
      this.pendingKnowledgeRebuilds.delete(key);
    }
  }

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
   * ADR-004 (Cognitive Consolidation) §12.2 — evaluates whether a profile
   * rebuild is needed in response to a new/changed `isCurrent`
   * `KnowledgeAsset` for the given Subject. A distinct method from
   * `shouldRebuildForSubject()` because the triggering condition is
   * genuinely different (a KnowledgeAsset, not a Learning) — mirrors,
   * rather than collapses into, that method's one-trigger-check-per-kind
   * convention.
   *
   * Debounced (§15 Risks / KNOWLEDGE_REBUILD_DEBOUNCE_MS): declines to
   * trigger a second Knowledge-caused rebuild within the debounce window of
   * the last rebuild, so a burst of uploads doesn't cause a rebuild storm.
   * The `RebuildDecision` returned here always has `newLearningsCount: 0`
   * — it is not counting Learnings, and `FeedbackProcessor` does not read
   * that field for this trigger path (it exists on `RebuildDecision`
   * because both trigger-check methods share one return type — see
   * `RebuildDecision`'s doc comment).
   */
  async shouldRebuildForSubjectFromKnowledge(
    subject: SubjectRef,
    changedKnowledgeAssetId: string,
  ): Promise<RebuildDecision> {
    const currentProfile = await this.userDomain.getCurrentProfileForSubject(subject);

    if (!currentProfile) {
      return {
        shouldRebuild: true,
        reason: 'No profile exists — initial build required (triggered by knowledge asset ' + changedKnowledgeAssetId + ')',
        newLearningsCount: 0,
      };
    }

    const msSinceLastUpdate = Date.now() - currentProfile.updatedAt.getTime();
    if (msSinceLastUpdate < KNOWLEDGE_REBUILD_DEBOUNCE_MS) {
      // G-7 (Architecture Verification Report, P1) — the leading-edge
      // debounce above is unchanged (isolated uploads still behave exactly
      // as before), but a debounced upload is no longer a dead end: it
      // schedules (or resets) a trailing-edge timer so a burst of uploads
      // eventually converges to one rebuild reflecting the whole burst,
      // instead of silently reflecting only whichever upload happened to
      // fall outside the debounce window.
      this.scheduleTrailingKnowledgeRebuild(subject);

      return {
        shouldRebuild: false,
        reason: `Debounced — last rebuild was ${Math.round(msSinceLastUpdate / 1000)}s ago, below the ${KNOWLEDGE_REBUILD_DEBOUNCE_MS / 1000}s debounce window; a deferred rebuild is scheduled once this burst ends (G-7)`,
        newLearningsCount: 0,
      };
    }

    return {
      shouldRebuild: true,
      reason: `New or changed current knowledge asset ${changedKnowledgeAssetId}`,
      newLearningsCount: 0,
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
    // G-7 — this rebuild (whatever triggered it) makes the profile current
    // again, so any deferred trailing rebuild still pending for this
    // Subject would now be redundant.
    this.cancelPendingKnowledgeRebuild(subject);

    const learnings = await this.userDomain.getAllActiveLearningsForSubject(subject);
    // ADR-004 (Cognitive Consolidation) §3.2 — the one new read this method
    // gained. Not gated behind which trigger caused this call; every
    // rebuild reads both inputs, regardless of why it was invoked (§3.2's
    // central point).
    const knowledgeAssets = await this.knowledgeDomain.getCurrentAssetsForSubject(subject);
    const currentProfile = await this.userDomain.getCurrentProfileForSubject(subject);

    const nextVersion = (currentProfile?.version ?? 0) + 1;
    const compositeConfidence = computeCompositeConfidence(learnings);
    const summaries = buildDomainSummaries(learnings, knowledgeAssets);

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
      knowledgeSummary:     summaries.knowledge,
      reasoningSummary:     summaries.reasoning,
      positioningSummary:   summaries.positioning,
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
 * Groups Learnings (and, as of ADR-004, current KnowledgeAssets) into
 * domain summary buckets for profile snapshot fields. `voice`/`goals`/
 * `constraints`/`preferences`/`expertise` are unchanged — plain
 * highest-confidence-per-category `Record`s, Learning-only, combined via
 * the override rule (ADR-004 §7.2). `vocabulary`/`knowledge`/`reasoning`
 * are `SynthesizedCollection`s combined via the union-with-provenance rule
 * (ADR-004 §7.1) across both Learnings and KnowledgeAssets. `positioning`
 * is a `SynthesizedCollection` sourced from Learnings only — no
 * Knowledge-side extractor produces competitive/market framing today
 * (ADR-004 §0.1, §5); this is a deliberate, documented scope decision, not
 * an oversight.
 */
function buildDomainSummaries(learnings: Learning[], knowledgeAssets: KnowledgeAsset[] = []): {
  voice: Record<string, unknown> | null;
  goals: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  expertise: Record<string, unknown> | null;
  vocabulary: Record<string, unknown> | null;
  knowledge: SynthesizedCollection<{ name: string; description: string }> | null;
  reasoning: SynthesizedCollection<{ statement: string }> | null;
  positioning: SynthesizedCollection<{ statement: string }> | null;
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

  function learningsIn(categories: TaxonomyCategory[]): Learning[] {
    return categories.flatMap(cat => byCategory.get(cat) ?? []);
  }

  // ── ADR-004 (Cognitive Consolidation) §5, §7.1 — union-with-provenance fields ──

  const vocabularyLearnings = learningsIn(['domain_specific_vocabulary', 'cultural_and_linguistic_context']);
  const vocabularyKnowledgeItems = vocabularyItemsFromKnowledge(knowledgeAssets);
  const vocabularyExperienceItems = experienceItemsFromLearnings(
    vocabularyLearnings,
    l => ({ name: String(l.content['term'] ?? l.content['phrase'] ?? JSON.stringify(l.content)), description: '' }),
  );
  const vocabulary = toLegacyVocabularyRecord(
    buildSynthesizedCollection(
      vocabularyKnowledgeItems,
      vocabularyExperienceItems,
      v => v.name,
      vocabularyLearnings.some(l => l.state === 'FLAGGED'),
    ),
  );

  const knowledgeLearnings = learningsIn(['intellectual_frameworks', 'knowledge_assets']);
  // Completion Mission (RCA finding — knowledge summary generation): this
  // used to read ONLY `extractedFrameworks` (named methodologies), so a
  // successfully-ingested, high-confidence document with rich vocabulary
  // but no explicit named framework produced an empty `knowledgeSummary`
  // regardless — surfacing as an unqualified `knowledge:NO` in the
  // compiled prompt, indistinguishable from "nothing was ingested at
  // all." `vocabularyItemsFromKnowledge()` (already used for the separate
  // `vocabulary` domain summary above) is reused here — not duplicated —
  // so any real extracted term/phrase content is also visible to
  // `knowledgeSummary`. `buildSynthesizedCollection()`'s existing dedup
  // (keyed by `v => v.name`) below means a term that also appears as part
  // of a named framework isn't double-counted.
  const knowledgeKnowledgeItems = [
    ...frameworkItemsFromKnowledge(knowledgeAssets, null),
    ...vocabularyItemsFromKnowledge(knowledgeAssets),
  ];
  const knowledgeExperienceItems = experienceItemsFromLearnings(
    knowledgeLearnings,
    l => ({ name: nameFromLearningContent(l), description: descriptionFromLearningContent(l) }),
  );
  const knowledge = buildSynthesizedCollection(
    knowledgeKnowledgeItems,
    knowledgeExperienceItems,
    v => v.name,
    knowledgeLearnings.some(l => l.state === 'FLAGGED'),
  );

  const reasoningLearnings = learningsIn(['strategic_thinking_patterns', 'decision_making_style', 'operating_principles']);
  const reasoningKnowledgeItems = frameworkItemsFromKnowledge(knowledgeAssets, ['analytical', 'evaluative'])
    .map((item): SynthesizedItem<{ statement: string }> => ({ ...item, value: { statement: `${item.value.name}: ${item.value.description}` } }));
  const reasoningExperienceItems = experienceItemsFromLearnings(
    reasoningLearnings,
    l => ({ statement: nameFromLearningContent(l) }),
  );
  const reasoning = buildSynthesizedCollection(
    reasoningKnowledgeItems,
    reasoningExperienceItems,
    v => v.statement,
    reasoningLearnings.some(l => l.state === 'FLAGGED'),
  );

  // ADR-004 §0.1 — positioning is Experience-only at launch; no Knowledge items.
  const positioningLearnings = learningsIn(['competitive_intelligence']);
  const positioningExperienceItems = experienceItemsFromLearnings(
    positioningLearnings,
    l => ({ statement: nameFromLearningContent(l) }),
  );
  const positioning = buildSynthesizedCollection(
    [],
    positioningExperienceItems,
    v => v.statement,
    positioningLearnings.some(l => l.state === 'FLAGGED'),
  );

  return {
    voice: summarise(['communication_style', 'writing_style', 'emotional_register']),
    goals: summarise(['goals_and_objectives', 'success_metrics']),
    constraints: summarise(['constraints_and_boundaries', 'operating_principles']),
    preferences: summarise([
      'tool_and_technology_preferences', 'model_preferences',
      'temporal_patterns', 'collaboration_and_leadership_style',
    ]),
    expertise: summarise(['expertise_domains', 'skills_inventory', 'domain_specific_vocabulary']),
    vocabulary,
    knowledge,
    reasoning,
    positioning,
  };
}

// ── ADR-004 (Cognitive Consolidation) §7 — synthesis helpers ───────────────────

/** Exact-match, case-insensitive, whitespace-trimmed normalization — ADR-004 §7.1 step 2. Deliberately conservative; no fuzzy/embedding matching, per this platform's heuristic-only Implementation Philosophy. */
function normalizeSynthesisValue(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * ADR-004 §7.1 — the union-with-provenance combination rule. Deduplicates
 * by normalized value; on a tie, keeps the higher-confidence item, then the
 * more recently observed item, then prefers the Knowledge-sourced item
 * (§7.1 step 3's exact tie-break order).
 */
function buildSynthesizedCollection<T>(
  knowledgeItems: SynthesizedItem<T>[],
  experienceItems: SynthesizedItem<T>[],
  primaryText: (v: T) => string,
  hasConflict: boolean,
): SynthesizedCollection<T> | null {
  const all = [...knowledgeItems, ...experienceItems];
  if (all.length === 0) return null;

  const byValue = new Map<string, SynthesizedItem<T>>();
  for (const item of all) {
    const key = normalizeSynthesisValue(primaryText(item.value));
    const existing = byValue.get(key);
    if (!existing) {
      byValue.set(key, item);
      continue;
    }
    if (item.confidence > existing.confidence) {
      byValue.set(key, item);
    } else if (item.confidence === existing.confidence) {
      if (item.sourceObservedAt > existing.sourceObservedAt) {
        byValue.set(key, item);
      } else if (item.sourceObservedAt === existing.sourceObservedAt) {
        if (item.sourceKind === 'knowledge' && existing.sourceKind !== 'knowledge') {
          byValue.set(key, item);
        }
      }
    }
  }

  const items = Array.from(byValue.values());
  const confidence = items.reduce((max, i) => Math.max(max, i.confidence), 0);
  return { items, confidence, hasConflict };
}

/** Best-effort human-readable name from a Learning's opaque `content` blob — same defensive-optional-chaining convention `WorkspaceIntelligenceDomain.getContext()` already uses for opaque JSONB. */
function nameFromLearningContent(l: Learning): string {
  const c = l.content as Record<string, unknown>;
  return String(c['name'] ?? c['title'] ?? c['statement'] ?? c['framework'] ?? JSON.stringify(c));
}

function descriptionFromLearningContent(l: Learning): string {
  const c = l.content as Record<string, unknown>;
  return String(c['description'] ?? '');
}

function experienceItemsFromLearnings<T>(learnings: Learning[], toValue: (l: Learning) => T): SynthesizedItem<T>[] {
  return learnings.map(l => ({
    value: toValue(l),
    confidence: l.confidence,
    sourceKind: 'experience' as const,
    sourceId: l.id,
    sourceObservedAt: l.createdAt.toISOString(),
  }));
}

/** ADR-004 §5 — reads `KnowledgeAsset.extractedVocabulary.terms[]`/`.phrases[]`, the corrected `vocabularySnapshot` input. */
function vocabularyItemsFromKnowledge(assets: KnowledgeAsset[]): SynthesizedItem<{ name: string; description: string }>[] {
  const items: SynthesizedItem<{ name: string; description: string }>[] = [];
  for (const asset of assets) {
    const vocab = asset.extractedVocabulary as VocabularyExtractionResult | null;
    if (!vocab) continue;
    for (const term of vocab.terms ?? []) {
      items.push({
        value: { name: term.term, description: '' },
        confidence: Math.min(KNOWLEDGE_EXTRACTION_CONFIDENCE_CEILING, asset.confidence),
        sourceKind: 'knowledge',
        sourceId: asset.id,
        sourceObservedAt: asset.createdAt.toISOString(),
      });
    }
    for (const phrase of vocab.phrases ?? []) {
      items.push({
        value: { name: phrase.phrase, description: '' },
        confidence: Math.min(KNOWLEDGE_EXTRACTION_CONFIDENCE_CEILING, asset.confidence),
        sourceKind: 'knowledge',
        sourceId: asset.id,
        sourceObservedAt: asset.createdAt.toISOString(),
      });
    }
  }
  return items;
}

/**
 * ADR-004 §5 — reads `KnowledgeAsset.extractedFrameworks.frameworks[]`.
 * `categoryFilter`, when given, restricts to those `ExtractedFramework`
 * categories (used for `reasoningSummary`, which reads only
 * 'analytical'/'evaluative'-categorized frameworks — `knowledgeSummary`
 * passes `null` to read every category).
 */
function frameworkItemsFromKnowledge(
  assets: KnowledgeAsset[],
  categoryFilter: ExtractedFramework['category'][] | null,
): SynthesizedItem<{ name: string; description: string }>[] {
  const items: SynthesizedItem<{ name: string; description: string }>[] = [];
  for (const asset of assets) {
    const fw = asset.extractedFrameworks as FrameworkExtractionResult | null;
    if (!fw) continue;
    for (const framework of fw.frameworks ?? []) {
      if (categoryFilter && !categoryFilter.includes(framework.category)) continue;
      items.push({
        value: { name: framework.name, description: framework.description },
        confidence: Math.min(KNOWLEDGE_EXTRACTION_CONFIDENCE_CEILING, framework.confidence),
        sourceKind: 'knowledge',
        sourceId: asset.id,
        sourceObservedAt: asset.createdAt.toISOString(),
      });
    }
  }
  return items;
}

/**
 * `vocabularySnapshot` predates ADR-004 and is typed as a plain
 * `Record<string, unknown> | null` on `IntelligenceProfile` (ADR-004 §4.1
 * — deliberately not migrated to `SynthesizedCollection<T>`'s shape, to
 * avoid a breaking type change on an existing, already-consumed field).
 * This adapts the new union-with-provenance computation back into that
 * legacy shape: `{ [normalizedTerm]: { confidence, name } }`, preserving
 * the "does this field have any content at all" null-vs-populated
 * semantics `summarise()` above already establishes for the other legacy
 * fields.
 */
function toLegacyVocabularyRecord(collection: SynthesizedCollection<{ name: string; description: string }> | null): Record<string, unknown> | null {
  if (!collection || collection.items.length === 0) return null;
  const result: Record<string, unknown> = {};
  for (const item of collection.items) {
    result[normalizeSynthesisValue(item.value.name)] = { confidence: item.confidence, name: item.value.name, sourceKind: item.sourceKind };
  }
  return result;
}
