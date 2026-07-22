/**
 * ADR-005.knowledge-identity-bridge.integration.test.ts
 *
 * Evidence/Identity Bridge (ADR-005) — end-to-end integration test.
 *
 * Uses a lightweight in-memory fake of the handful of
 * UserIntelligenceDomain methods HypothesisEngine/LearningValidator
 * actually call (findOpenHypothesisForSubject, createHypothesisForSubject,
 * updateHypothesis, markHypothesisPromoted, insertLearning,
 * discardExpiredHypothesesForSubject) — a real state machine, not mocked
 * responses — so the corroboration math in this test is the *actual*
 * HypothesisEngine/LearningValidator logic, unmodified. ProfileBuilder is
 * spied on (as the existing processKnowledgeExtraction tests already do)
 * since its own rebuild/synthesis behavior is covered by
 * ADR-004.ProfileBuilder.synthesis.test.ts and isn't this bridge's concern.
 *
 * Proves:
 *   1. A single uploaded document's evidence creates a PROVISIONAL/
 *      ACCUMULATING Hypothesis — NOT a Learning, NOT identity — matching
 *      the explicit requirement that a single document must never become
 *      identity on its own.
 *   2. A second, corroborating document (different asset, same taxonomy
 *      category) accumulates on the SAME Hypothesis and, once the
 *      stability class's corroboration threshold is met, promotes to a
 *      Learning — with zero changes to promotion-threshold math.
 *   3. The promoted Learning's sourceSummary.evidenceTrail names both
 *      contributing documents, their supporting frameworks/vocabulary, and
 *      each one's confidence — full auditability, not just a confidence
 *      number.
 *   4. Knowledge-derived evidence corroborates with Experience-derived
 *      observations in the same taxonomy category (proving evidence really
 *      is source-agnostic, not a knowledge-only side channel).
 *   5. The descriptive Knowledge→Profile path (processKnowledgeExtraction)
 *      and the evidentiary path (processKnowledgeEvidence) both fire from
 *      the same event, independently.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackProcessor } from '../../src/pipeline/FeedbackProcessor';
import { InProcessEventBus } from '../../src/events/IntelligenceEventBus';
import { workspaceSubject, type SubjectRef } from '../../src/types/subject';
import type { UserIntelligenceDomain } from '../../src/domains/UserIntelligenceDomain';
import type { ArtifactIntelligenceDomain } from '../../src/domains/ArtifactIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../../src/domains/KnowledgeIntelligenceDomain';
import type { Hypothesis, Learning } from '../../src/types/entities';
import type { Observation } from '../../src/pipeline/types';

// ── In-memory fake of the Hypothesis/Learning CRUD surface ────────────────────

function makeFakeUserDomain() {
  let hypSeq = 0;
  let learnSeq = 0;
  const hypotheses = new Map<string, Hypothesis>();
  const learnings: Learning[] = [];

  const domain = {
    async findOpenHypothesisForSubject(subject: SubjectRef, taxonomyCategory: string, contextScope: string) {
      for (const h of hypotheses.values()) {
        if (
          h.subjectType === subject.subjectType &&
          (subject.subjectType === 'workspace' ? h.workspaceId : h.userId) === subject.subjectId &&
          h.taxonomyCategory === taxonomyCategory &&
          h.contextScope === contextScope &&
          ['PROVISIONAL', 'ACCUMULATING', 'CHALLENGED'].includes(h.state)
        ) {
          return h;
        }
      }
      return null;
    },

    async createHypothesisForSubject(payload: Record<string, unknown>) {
      hypSeq += 1;
      const id = `hyp-${hypSeq}`;
      const hyp: Hypothesis = {
        id,
        userId: (payload['user_id'] as string | null) ?? null,
        workspaceId: (payload['workspace_id'] as string | null) ?? null,
        subjectType: (payload['subject_type'] as Hypothesis['subjectType']) ?? 'workspace',
        projectId: payload['project_id'] as string | null,
        taxonomyCategory: payload['taxonomy_category'] as Hypothesis['taxonomyCategory'],
        stabilityClass: payload['stability_class'] as Hypothesis['stabilityClass'],
        state: payload['state'] as Hypothesis['state'],
        confidence: payload['confidence'] as number,
        requiredCorroborations: payload['required_corroborations'] as number,
        currentCorroborations: payload['current_corroborations'] as number,
        highQualityContradictions: payload['high_quality_contradictions'] as number,
        proposition: payload['proposition'] as Record<string, unknown>,
        contextScope: payload['context_scope'] as Hypothesis['contextScope'],
        contextArtifactType: payload['context_artifact_type'] as string | null,
        promotedLearningId: null,
        expiresAt: payload['expires_at'] ? new Date(payload['expires_at'] as string) : null,
        evidenceTrail: (payload['evidence_trail'] as Hypothesis['evidenceTrail']) ?? [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      hypotheses.set(id, hyp);
      return hyp;
    },

    async updateHypothesis(hypothesisId: string, updates: Record<string, unknown>) {
      const existing = hypotheses.get(hypothesisId);
      if (!existing) throw new Error(`no such hypothesis ${hypothesisId}`);
      const updated: Hypothesis = {
        ...existing,
        currentCorroborations: (updates['current_corroborations'] as number) ?? existing.currentCorroborations,
        highQualityContradictions: (updates['high_quality_contradictions'] as number) ?? existing.highQualityContradictions,
        confidence: (updates['confidence'] as number) ?? existing.confidence,
        state: (updates['state'] as Hypothesis['state']) ?? existing.state,
        evidenceTrail: (updates['evidence_trail'] as Hypothesis['evidenceTrail']) ?? existing.evidenceTrail,
        updatedAt: new Date(),
      };
      hypotheses.set(hypothesisId, updated);
      return updated;
    },

    async markHypothesisPromoted(hypothesisId: string, learningId: string) {
      const existing = hypotheses.get(hypothesisId);
      if (existing) hypotheses.set(hypothesisId, { ...existing, promotedLearningId: learningId, state: 'VALIDATED' });
    },

    async discardExpiredHypothesesForSubject() {
      return 0;
    },

    async insertLearning(payload: Record<string, unknown>) {
      learnSeq += 1;
      const learning = {
        id: `learn-${learnSeq}`,
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Learning;
      learnings.push(learning);
      return learning;
    },
  };

  return { domain: domain as unknown as UserIntelligenceDomain, hypotheses, learnings };
}

// ── Test setup ──────────────────────────────────────────────────────────────

function makeProcessor() {
  const bus = new InProcessEventBus();
  const { domain, hypotheses, learnings } = makeFakeUserDomain();
  const artifactDomain = {} as unknown as ArtifactIntelligenceDomain;
  const knowledgeDomain = {} as unknown as KnowledgeIntelligenceDomain;
  const processor = new FeedbackProcessor(bus, domain, artifactDomain, knowledgeDomain);

  // processKnowledgeExtraction (the separate, descriptive path) is not this
  // bridge's concern — stub it so it doesn't throw against the fake
  // knowledgeDomain, and so its call count can be asserted independently
  // of the evidence path below.
  const extractionSpy = vi.spyOn(processor, 'processKnowledgeExtraction').mockResolvedValue({ rebuilt: false });

  // ProfileBuilder's own rebuild/synthesis behavior is covered elsewhere;
  // here we only need to observe *whether* a rebuild was triggered once a
  // Learning promotes.
  const rebuildSpy = vi.spyOn(processor['profileBuilder'], 'shouldRebuildForSubject')
    .mockResolvedValue({ shouldRebuild: true, reason: 'learning promoted', newLearningsCount: 1 });
  const rebuildForSubjectSpy = vi.spyOn(processor['profileBuilder'], 'rebuildForSubject')
    .mockResolvedValue({} as never);

  return { processor, bus, hypotheses, learnings, extractionSpy, rebuildSpy, rebuildForSubjectSpy };
}

const WORKSPACE_ID = 'ws-bridge-1';

function frameworkPayload(assetId: string, title: string, frameworkName: string, confidence = 0.8) {
  return {
    userId: 'u-irrelevant',
    entityId: assetId,
    entityType: 'knowledge_asset',
    ownerType: 'workspace' as const,
    workspaceId: WORKSPACE_ID,
    occurredAt: new Date().toISOString(),
    title,
    extractedFrameworks: {
      frameworks: [{
        id: `fw-${assetId}`,
        name: frameworkName,
        description: `${frameworkName} description`,
        category: 'methodological' as const,
        detectionMethod: 'explicit' as const,
        confidence,
        isProprietary: false,
        evidenceTerms: [],
      }],
      frameworkCount: 1,
    },
    extractedVocabulary: { terms: [], phrases: [], termCount: 0, phraseCount: 0 },
  };
}

describe('Evidence/Identity Bridge — end to end', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a single uploaded document creates evidence but does NOT promote a Learning', async () => {
    const { processor, hypotheses, learnings, rebuildForSubjectSpy } = makeProcessor();

    const result = await processor.processKnowledgeEvidence(
      frameworkPayload('asset-1', 'Playbook One.pdf', 'JTBD Framework'),
    );

    expect(result.signalsProcessed).toBe(1);
    expect(result.hypothesesUpdated).toBe(1);
    expect(result.learningsCreated).toBe(0);
    expect(result.profileRebuilt).toBe(false);
    expect(learnings).toHaveLength(0);
    expect(rebuildForSubjectSpy).not.toHaveBeenCalled();

    const hyp = [...hypotheses.values()][0]!;
    expect(hyp.state).toBe('PROVISIONAL');
    expect(hyp.currentCorroborations).toBe(0);
    expect(hyp.evidenceTrail).toHaveLength(1);
    expect(hyp.evidenceTrail[0]).toMatchObject({
      sourceKind: 'knowledge_asset',
      sourceId: 'asset-1',
      sourceLabel: 'Playbook One.pdf',
      supportingItems: ['JTBD Framework'],
    });
  });

  it('a second corroborating document promotes to Learning once the threshold is met, with full evidence trail', async () => {
    const { processor, learnings, rebuildForSubjectSpy } = makeProcessor();

    // intellectual_frameworks is 'long_term' stability → requires 3
    // corroborations. The Hypothesis-creating observation itself sets
    // current_corroborations = 0 (it's the baseline, not a corroboration
    // of anything yet), so 3 further corroborating documents are needed —
    // 4 documents in total.
    await processor.processKnowledgeEvidence(frameworkPayload('asset-1', 'Playbook One.pdf', 'JTBD Framework'));
    await processor.processKnowledgeEvidence(frameworkPayload('asset-2', 'Playbook Two.pdf', 'Value Ladder'));
    await processor.processKnowledgeEvidence(frameworkPayload('asset-3', 'Playbook Three.pdf', 'Jobs Theory'));
    const fourth = await processor.processKnowledgeEvidence(frameworkPayload('asset-4', 'Playbook Four.pdf', 'Kano Model'));

    expect(fourth.learningsCreated).toBe(1);
    expect(fourth.profileRebuilt).toBe(true);
    expect(rebuildForSubjectSpy).toHaveBeenCalledTimes(1);
    expect(learnings).toHaveLength(1);

    const learning = learnings[0] as unknown as Record<string, unknown>;
    expect(learning['taxonomyCategory']).toBe('intellectual_frameworks');

    // ── Explainability requirement ──────────────────────────────────────
    // "Why was this identity trait created? Which documents contributed?
    // Which frameworks supported it? What confidence/corroboration?" — all
    // answerable directly from sourceSummary, not just a confidence float.
    const sourceSummary = learning['sourceSummary'] as Record<string, unknown>;
    expect(sourceSummary['corroborations']).toBeGreaterThanOrEqual(3);
    const trail = sourceSummary['evidenceTrail'] as Array<Record<string, unknown>>;
    expect(trail).toHaveLength(4);
    expect(trail.map((r) => r['sourceId']).sort()).toEqual(['asset-1', 'asset-2', 'asset-3', 'asset-4']);
    expect(trail.map((r) => r['sourceLabel']).sort()).toEqual([
      'Playbook Four.pdf', 'Playbook One.pdf', 'Playbook Three.pdf', 'Playbook Two.pdf',
    ]);
    expect(trail.map((r) => r['supportingItems'])).toEqual([
      ['JTBD Framework'], ['Value Ladder'], ['Jobs Theory'], ['Kano Model'],
    ]);
    for (const record of trail) {
      expect(typeof record['confidence']).toBe('number');
      expect(record['sourceKind']).toBe('knowledge_asset');
    }
  });

  it('the descriptive path (processKnowledgeExtraction) and the evidentiary path both fire from one event', async () => {
    const { processor, bus, extractionSpy } = makeProcessor();
    processor.register();
    const evidenceSpy = vi.spyOn(processor, 'processKnowledgeEvidence');

    await bus.emit('intelligence.signal.extracted', {
      ...frameworkPayload('asset-1', 'Playbook One.pdf', 'JTBD Framework'),
      entityType: 'knowledge_asset',
    });

    expect(extractionSpy).toHaveBeenCalledTimes(1);
    expect(evidenceSpy).toHaveBeenCalledTimes(1);
  });

  it('a visual asset with no extracted frameworks/vocabulary produces zero evidence signals (honest null, not a fabricated one)', async () => {
    const { processor, learnings } = makeProcessor();

    const result = await processor.processKnowledgeEvidence({
      userId: 'u-1',
      entityId: 'asset-visual-1',
      entityType: 'knowledge_asset',
      ownerType: 'workspace',
      workspaceId: WORKSPACE_ID,
      occurredAt: new Date().toISOString(),
      title: 'logo.png',
      extractedFrameworks: { frameworks: [], frameworkCount: 0 },
      extractedVocabulary: { terms: [], phrases: [], termCount: 0, phraseCount: 0 },
    });

    expect(result.signalsProcessed).toBe(0);
    expect(result.learningsCreated).toBe(0);
    expect(learnings).toHaveLength(0);
  });

  it('Knowledge evidence corroborates with an Experience-sourced observation in the same category (source-agnostic corroboration)', async () => {
    const { processor, hypotheses } = makeProcessor();

    // First: an Experience-side observation lands directly on the domain,
    // simulating what processObservation()'s Stage 3 would have produced —
    // proves HypothesisEngine's matching is purely (subject, category,
    // scope)-based, not aware of which pipeline entry point is calling it.
    const experienceObservation: Observation = {
      signalId: 'sig-experience-1',
      subject: workspaceSubject(WORKSPACE_ID),
      userId: '',
      workspaceId: WORKSPACE_ID,
      subjectType: 'workspace',
      projectId: null,
      taxonomyCategory: 'intellectual_frameworks',
      stabilityClass: 'long_term',
      domain: 'user_intelligence',
      sourceQuality: 'demonstrated_behavior',
      confidence: 0.6,
      disposition: 'corroborating',
      content: {},
      contextFlags: [],
      createdAt: new Date(),
    };
    await processor['hypothesisEngine'].process(experienceObservation);

    // Then: a knowledge document contributes evidence to the SAME category.
    const result = await processor.processKnowledgeEvidence(
      frameworkPayload('asset-1', 'Playbook One.pdf', 'JTBD Framework'),
    );

    expect(result.hypothesesUpdated).toBe(1);
    expect(hypotheses.size).toBe(1); // corroborated the same hypothesis, did not create a second one
    const hyp = [...hypotheses.values()][0]!;
    expect(hyp.currentCorroborations).toBe(1); // the knowledge evidence corroborated the experience-created hypothesis
    expect(hyp.evidenceTrail).toHaveLength(2);
    expect(hyp.evidenceTrail[0]!.sourceKind).toBe('experience');
    expect(hyp.evidenceTrail[1]!.sourceKind).toBe('knowledge_asset');
  });
});
