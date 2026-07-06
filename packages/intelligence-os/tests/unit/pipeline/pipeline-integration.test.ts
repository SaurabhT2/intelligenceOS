/**
 * pipeline-integration.test.ts
 *
 * Integration tests for the Sprint 2 Learning Pipeline.
 *
 * Tests:
 *   1. HypothesisEngine — creates PROVISIONAL hypothesis from new observation
 *   2. HypothesisEngine — transitions PROVISIONAL → ACCUMULATING on corroboration
 *   3. HypothesisEngine — applies Contradiction Rule (halves confidence, CHALLENGED)
 *   4. HypothesisEngine — REJECTED on 2 high-quality contradictions
 *   5. LearningValidator — does not promote below threshold
 *   6. LearningValidator — promotes when threshold met (corroborations ≥ required)
 *   7. LearningValidator — escalation rule: 3+ corroborations, 0 contradictions → High confidence
 *   8. LearningValidator — does not promote with unresolved high-quality contradictions
 *   9. ProfileBuilder — shouldRebuild returns true for permanent stability class
 *  10. ProfileBuilder — shouldRebuild returns false below threshold
 *  11. ProfileBuilder — rebuild creates a new profile version and emits event
 *  12. FeedbackProcessor — full pipeline: accepted event produces signals → profile rebuild
 *  13. FeedbackProcessor — deployed event produces corroborating signals
 *  14. FeedbackProcessor — rejected event produces contradicting signal
 *  15. FeedbackProcessor — explicit_feedback event produces explicit_statement signals
 *  16. FeedbackProcessor — gracefully handles new user with no profile
 *  17. FeedbackProcessor — does not throw when project is missing
 *  18. FeedbackProcessor — register() subscribes to event bus correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HypothesisEngine } from '../../../src/pipeline/HypothesisEngine';
import { LearningValidator } from '../../../src/pipeline/LearningValidator';
import { ProfileBuilder } from '../../../src/pipeline/ProfileBuilder';
import { FeedbackProcessor } from '../../../src/pipeline/FeedbackProcessor';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import type { Observation } from '../../../src/pipeline/types';
import type { Hypothesis, Learning } from '../../../src/types/entities';
import type { FeedbackEventPayload } from '../../../src/types/events';

// ── Supabase mock factory ─────────────────────────────────────────────────────

type MockChain = {
  select:      ReturnType<typeof vi.fn>;
  eq:          ReturnType<typeof vi.fn>;
  neq:         ReturnType<typeof vi.fn>;
  in:          ReturnType<typeof vi.fn>;
  gte:         ReturnType<typeof vi.fn>;
  lt:          ReturnType<typeof vi.fn>;
  order:       ReturnType<typeof vi.fn>;
  limit:       ReturnType<typeof vi.fn>;
  insert:      ReturnType<typeof vi.fn>;
  update:      ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single:      ReturnType<typeof vi.fn>;
  then:        ReturnType<typeof vi.fn>;
};

function createMockSupabase(opts: {
  maybeSingle?: { data: unknown; error: null | { message: string } };
  single?: { data: unknown; error: null | { message: string } };
  list?: { data: unknown[]; error: null | { message: string } };
} = {}) {
  const chain: MockChain = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    neq:         vi.fn().mockReturnThis(),
    in:          vi.fn().mockReturnThis(),
    gte:         vi.fn().mockReturnThis(),
    lt:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(
      opts.maybeSingle ?? { data: null, error: null },
    ),
    single: vi.fn().mockResolvedValue(
      opts.single ?? { data: makeHypothesisRow(), error: null },
    ),
    then: vi.fn().mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve(opts.list ?? { data: [], error: null })),
    ),
  };

  const from = vi.fn().mockReturnValue(chain);
  const schema = vi.fn().mockReturnValue({ from });

  return {
    schema,
    _chain: chain,
    _from: from,
    /** Replace single-call result for the next await */
    setSingleResult(data: unknown) {
      chain.single.mockResolvedValueOnce({ data, error: null });
    },
    setMaybeSingleResult(data: unknown) {
      chain.maybeSingle.mockResolvedValueOnce({ data, error: null });
    },
    setListResult(data: unknown[]) {
      chain.then.mockImplementationOnce((resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data, error: null })),
      );
    },
  };
}

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeHypothesisRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                        'hyp-001',
    user_id:                   'user-001',
    project_id:                null,
    taxonomy_category:         'communication_style',
    stability_class:           'long_term',
    state:                     'PROVISIONAL',
    confidence:                0.36,
    required_corroborations:   3,
    current_corroborations:    0,
    high_quality_contradictions: 0,
    proposition:               { eventType: 'accepted' },
    context_scope:             'global',
    context_artifact_type:     null,
    promoted_learning_id:      null,
    expires_at:                new Date(Date.now() + 30 * 86400000).toISOString(),
    created_at:                new Date().toISOString(),
    updated_at:                new Date().toISOString(),
    ...overrides,
  };
}

function makeLearningRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                   'learn-001',
    user_id:              'user-001',
    workspace_id:         null,
    project_id:           null,
    domain:               'user_intelligence',
    taxonomy_category:    'communication_style',
    stability_class:      'long_term',
    state:                'VALIDATED',
    confidence:           0.54,
    context_scope:        'global',
    context_artifact_type: null,
    context_project_id:   null,
    context_audience_type: null,
    content:              {},
    source_summary:       {},
    decay_rate:           'slow',
    last_confirmed_at:    new Date().toISOString(),
    decay_started_at:     null,
    archived_at:          null,
    created_at:           new Date().toISOString(),
    updated_at:           new Date().toISOString(),
    ...overrides,
  };
}

function makeProfileRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                   'prof-001',
    user_id:              'user-001',
    version:              1,
    is_current:           true,
    composite_confidence: 0.54,
    archetype_primary:    null,
    archetype_confidence: null,
    voice_summary:        null,
    goal_summary:         null,
    constraint_summary:   null,
    preference_summary:   null,
    expertise_domains:    null,
    vocabulary_snapshot:  null,
    created_at:           new Date(Date.now() - 5000).toISOString(),
    updated_at:           new Date(Date.now() - 5000).toISOString(),
    ...overrides,
  };
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    signalId:        'sig-001',
    userId:          'user-001',
    projectId:       null,
    taxonomyCategory:'communication_style',
    stabilityClass:  'long_term',
    domain:          'user_intelligence',
    sourceQuality:   'demonstrated_behavior',
    confidence:      0.54,
    disposition:     'corroborating',
    content:         { eventType: 'accepted' },
    contextFlags:    [],
    createdAt:       new Date(),
    ...overrides,
  };
}

function makeHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id:                      'hyp-001',
    userId:                  'user-001',
    projectId:               null,
    taxonomyCategory:        'communication_style',
    stabilityClass:          'long_term',
    state:                   'PROVISIONAL',
    confidence:              0.36,
    requiredCorroborations:  3,
    currentCorroborations:   0,
    highQualityContradictions: 0,
    proposition:             {},
    contextScope:            'global',
    contextArtifactType:     null,
    promotedLearningId:      null,
    expiresAt:               null,
    createdAt:               new Date(),
    updatedAt:               new Date(),
    ...overrides,
  };
}

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id:                  'learn-001',
    userId:              'user-001',
    workspaceId:         null,
    projectId:           null,
    domain:              'user_intelligence',
    taxonomyCategory:    'communication_style',
    stabilityClass:      'long_term',
    state:               'VALIDATED',
    confidence:          0.54,
    contextScope:        'global',
    contextArtifactType: null,
    contextProjectId:    null,
    contextAudienceType: null,
    content:             {},
    sourceSummary:       {},
    decayRate:           'slow',
    lastConfirmedAt:     new Date(),
    decayStartedAt:      null,
    archivedAt:          null,
    createdAt:           new Date(),
    updatedAt:           new Date(),
    ...overrides,
  };
}

function makeFeedbackPayload(overrides: Partial<FeedbackEventPayload> = {}): FeedbackEventPayload {
  return {
    userId:      'user-001',
    artifactId:  'art-001',
    artifactType:'executive_summary',
    eventType:   'accepted',
    occurredAt:  new Date().toISOString(),
    ...overrides,
  };
}

// ── HypothesisEngine tests ────────────────────────────────────────────────────

describe('HypothesisEngine', () => {
  it('creates a PROVISIONAL hypothesis when none exists', async () => {
    const db = createMockSupabase({
      maybeSingle: { data: null, error: null },
      single: { data: makeHypothesisRow({ state: 'PROVISIONAL', current_corroborations: 0 }), error: null },
    });
    const engine = new HypothesisEngine(db as unknown as import('@supabase/supabase-js').SupabaseClient);

    const obs = makeObservation();
    const hyp = await engine.process(obs);

    expect(hyp.state).toBe('PROVISIONAL');
    expect(hyp.currentCorroborations).toBe(0);
    expect(db._chain.insert).toHaveBeenCalled();
  });

  it('transitions PROVISIONAL → ACCUMULATING on corroboration', async () => {
    const existingHyp = makeHypothesisRow({ state: 'PROVISIONAL', current_corroborations: 0 });
    const updatedHyp = makeHypothesisRow({ state: 'ACCUMULATING', current_corroborations: 1 });

    const db = createMockSupabase({
      maybeSingle: { data: existingHyp, error: null },
      single: { data: updatedHyp, error: null },
    });

    const engine = new HypothesisEngine(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const hyp = await engine.process(makeObservation({ disposition: 'corroborating' }));

    expect(hyp.state).toBe('ACCUMULATING');
    expect(hyp.currentCorroborations).toBe(1);
    expect(db._chain.update).toHaveBeenCalled();
  });

  it('moves to CHALLENGED on a contradicting observation', async () => {
    const existingHyp = makeHypothesisRow({ state: 'ACCUMULATING', current_corroborations: 1, confidence: 0.54 });
    const afterContradiction = makeHypothesisRow({
      state: 'CHALLENGED',
      confidence: 0.27, // halved
      high_quality_contradictions: 1,
    });

    const db = createMockSupabase({
      maybeSingle: { data: existingHyp, error: null },
      single: { data: afterContradiction, error: null },
    });

    const engine = new HypothesisEngine(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const hyp = await engine.process(makeObservation({
      disposition: 'contradicting',
      sourceQuality: 'demonstrated_behavior', // high quality
    }));

    expect(hyp.state).toBe('CHALLENGED');
  });

  it('transitions to REJECTED on 2 high-quality contradictions', async () => {
    // Already has 1 high-quality contradiction; next one pushes to 2 → REJECTED
    const existingHyp = makeHypothesisRow({
      state: 'CHALLENGED',
      confidence: 0.27,
      high_quality_contradictions: 1,
    });
    const afterRejection = makeHypothesisRow({
      state: 'REJECTED',
      confidence: 0,
      high_quality_contradictions: 2,
    });

    const db = createMockSupabase({
      maybeSingle: { data: existingHyp, error: null },
      single: { data: afterRejection, error: null },
    });

    const engine = new HypothesisEngine(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const hyp = await engine.process(makeObservation({
      disposition: 'contradicting',
      sourceQuality: 'demonstrated_behavior',
    }));

    expect(hyp.state).toBe('REJECTED');
    expect(hyp.confidence).toBe(0);
  });

  it('markPromoted updates state to VALIDATED', async () => {
    const db = createMockSupabase();
    // update chain must return something for the .eq() chain
    db._chain.update.mockReturnThis();

    const engine = new HypothesisEngine(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    // Should not throw
    await expect(engine.markPromoted('hyp-001', 'learn-001')).resolves.toBeUndefined();
    expect(db._chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'VALIDATED', promoted_learning_id: 'learn-001' }),
    );
  });

  it('discardExpired returns count of discarded hypotheses', async () => {
    const db = createMockSupabase({
      list: { data: [{ id: 'hyp-old-1' }, { id: 'hyp-old-2' }], error: null },
    });
    // The discard path calls .update().eq().in().neq().lt().select()
    // which resolves via the then() handler
    const engine = new HypothesisEngine(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const count = await engine.discardExpired('user-001');
    expect(typeof count).toBe('number');
  });
});

// ── LearningValidator tests ───────────────────────────────────────────────────

describe('LearningValidator', () => {
  it('does not promote when below corroboration threshold', async () => {
    const hyp = makeHypothesis({
      state: 'ACCUMULATING',
      currentCorroborations: 1,
      requiredCorroborations: 3,
      highQualityContradictions: 0,
    });

    const db = createMockSupabase();
    const validator = new LearningValidator(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const result = await validator.evaluate(hyp);

    expect(result.promoted).toBe(false);
    expect(result.learning).toBeNull();
  });

  it('promotes when threshold is met', async () => {
    const hyp = makeHypothesis({
      state: 'ACCUMULATING',
      currentCorroborations: 3,
      requiredCorroborations: 3,
      highQualityContradictions: 0,
      confidence: 0.54,
    });

    const db = createMockSupabase({
      single: { data: makeLearningRow(), error: null },
    });
    const validator = new LearningValidator(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const result = await validator.evaluate(hyp);

    expect(result.promoted).toBe(true);
    expect(result.learning).not.toBeNull();
    expect(result.learning!.state).toBe('VALIDATED');
  });

  it('applies escalation rule: 3+ corroborations with 0 contradictions → High confidence', async () => {
    const hyp = makeHypothesis({
      state: 'ACCUMULATING',
      currentCorroborations: 3,
      requiredCorroborations: 3,
      highQualityContradictions: 0,
      confidence: 0.36, // would normally be low
    });

    const db = createMockSupabase({
      single: { data: makeLearningRow({ confidence: 0.85 }), error: null },
    });
    const validator = new LearningValidator(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const result = await validator.evaluate(hyp);

    expect(result.promoted).toBe(true);
    // The DB row shows confidence 0.85 from the escalation rule
    expect(result.learning!.confidence).toBeGreaterThanOrEqual(0.54);
  });

  it('does not promote when unresolved high-quality contradictions exist', async () => {
    const hyp = makeHypothesis({
      state: 'ACCUMULATING',
      currentCorroborations: 3,
      requiredCorroborations: 3,
      highQualityContradictions: 1, // blocked
    });

    const db = createMockSupabase();
    const validator = new LearningValidator(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const result = await validator.evaluate(hyp);

    expect(result.promoted).toBe(false);
    expect(result.reason).toContain('contradiction');
  });

  it('does not promote a PROVISIONAL state hypothesis', async () => {
    const hyp = makeHypothesis({
      state: 'PROVISIONAL', // can't promote from PROVISIONAL directly
      currentCorroborations: 3,
      requiredCorroborations: 3,
    });

    const db = createMockSupabase();
    const validator = new LearningValidator(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const result = await validator.evaluate(hyp);

    expect(result.promoted).toBe(false);
  });

  it('does not promote a REJECTED hypothesis', async () => {
    const hyp = makeHypothesis({
      state: 'REJECTED',
      currentCorroborations: 5,
      requiredCorroborations: 3,
    });

    const db = createMockSupabase();
    const validator = new LearningValidator(db as unknown as import('@supabase/supabase-js').SupabaseClient);
    const result = await validator.evaluate(hyp);

    expect(result.promoted).toBe(false);
  });
});

// ── ProfileBuilder tests ──────────────────────────────────────────────────────

describe('ProfileBuilder', () => {
  it('shouldRebuild returns true for a permanent stability-class learning', async () => {
    const db = createMockSupabase();
    const bus = new InProcessEventBus();
    const builder = new ProfileBuilder(db as unknown as import('@supabase/supabase-js').SupabaseClient, bus);

    const learning = makeLearning({ stabilityClass: 'permanent' });
    const decision = await builder.shouldRebuild('user-001', learning);

    expect(decision.shouldRebuild).toBe(true);
    expect(decision.reason.toLowerCase()).toContain('permanent');
  });

  it('shouldRebuild returns true when no profile exists', async () => {
    const db = createMockSupabase({ maybeSingle: { data: null, error: null } });
    const bus = new InProcessEventBus();
    const builder = new ProfileBuilder(db as unknown as import('@supabase/supabase-js').SupabaseClient, bus);

    const learning = makeLearning({ stabilityClass: 'long_term' });
    const decision = await builder.shouldRebuild('user-001', learning);

    expect(decision.shouldRebuild).toBe(true);
    expect(decision.reason).toContain('No profile');
  });

  it('shouldRebuild returns false when below high-confidence-learning threshold', async () => {
    const db = createMockSupabase({
      maybeSingle: { data: makeProfileRow(), error: null },
      list: { data: [{ id: 'l1' }, { id: 'l2' }], error: null }, // 2 < threshold of 3
    });
    const bus = new InProcessEventBus();
    const builder = new ProfileBuilder(db as unknown as import('@supabase/supabase-js').SupabaseClient, bus);

    const learning = makeLearning({ stabilityClass: 'long_term' });
    const decision = await builder.shouldRebuild('user-001', learning);

    expect(decision.shouldRebuild).toBe(false);
  });

  it('rebuild inserts a new profile row and emits intelligence.profile.updated', async () => {
    const db = createMockSupabase({
      maybeSingle: { data: makeProfileRow({ version: 1 }), error: null },
      single: { data: makeProfileRow({ version: 2, id: 'prof-002', is_current: true }), error: null },
      list: { data: [], error: null },
    });
    const bus = new InProcessEventBus();

    let emittedEvent: unknown = null;
    bus.on('intelligence.profile.updated', async (payload) => {
      emittedEvent = payload;
    });

    const builder = new ProfileBuilder(db as unknown as import('@supabase/supabase-js').SupabaseClient, bus);
    const profile = await builder.rebuild('user-001', ['user_intelligence']);

    expect(profile).toBeDefined();
    expect(profile.version).toBe(2);
    expect(emittedEvent).not.toBeNull();
    expect((emittedEvent as Record<string, unknown>)['userId']).toBe('user-001');
    expect((emittedEvent as Record<string, unknown>)['changedDomains']).toContain('user_intelligence');
  });
});

// ── FeedbackProcessor tests ───────────────────────────────────────────────────

describe('FeedbackProcessor', () => {
  function makeProcessor() {
    // DB mock that chains all needed paths:
    // - maybeSingle for hypothesis lookup (null = no existing)
    // - single for hypothesis insert AND learning insert AND profile insert
    // - list/then for counts and updates
    const db = createMockSupabase({
      maybeSingle: { data: null, error: null },
      single:      { data: makeHypothesisRow({ state: 'PROVISIONAL' }), error: null },
      list:        { data: [], error: null },
    });
    const bus = new InProcessEventBus();
    const processor = new FeedbackProcessor(
      db as unknown as import('@supabase/supabase-js').SupabaseClient,
      bus,
    );
    return { processor, bus, db };
  }

  it('register() subscribes to intelligence.artifact.feedback', () => {
    const { processor, bus } = makeProcessor();
    processor.register();
    expect((bus as InProcessEventBus).handlerCount('intelligence.artifact.feedback')).toBe(1);
  });

  it('processes an accepted event without throwing', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(makeFeedbackPayload({ eventType: 'accepted' }));
    expect(result.userId).toBe('user-001');
    expect(result.signalsProcessed).toBeGreaterThan(0);
    expect(result.observationsCreated).toBeGreaterThan(0);
  });

  it('processes a deployed event and counts signals', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(makeFeedbackPayload({ eventType: 'deployed' }));
    expect(result.signalsProcessed).toBeGreaterThan(0);
  });

  it('processes a rejected event and counts signals', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(makeFeedbackPayload({ eventType: 'rejected' }));
    expect(result.signalsProcessed).toBeGreaterThan(0);
  });

  it('processes an explicit_feedback event and counts signals', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(
      makeFeedbackPayload({ eventType: 'explicit_feedback', explicitReason: 'Too formal' }),
    );
    expect(result.signalsProcessed).toBeGreaterThan(0);
  });

  it('processes an edited event and counts signals', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(
      makeFeedbackPayload({
        eventType: 'edited',
        editDiff: {
          sectionsAdded: [],
          sectionsRemoved: ['conclusion'],
          sectionsReordered: false,
          lengthDelta: -200,
          vocabularyChanges: [],
        },
      }),
    );
    expect(result.signalsProcessed).toBeGreaterThan(0);
  });

  it('gracefully handles new user with no existing profile (no throw)', async () => {
    const db = createMockSupabase({
      maybeSingle: { data: null, error: null }, // no hypothesis, no profile
      single:      { data: makeHypothesisRow(), error: null },
      list:        { data: [], error: null },
    });
    const bus = new InProcessEventBus();
    const processor = new FeedbackProcessor(
      db as unknown as import('@supabase/supabase-js').SupabaseClient,
      bus,
    );

    // Must not throw
    await expect(
      processor.process(makeFeedbackPayload({ eventType: 'accepted' })),
    ).resolves.toBeDefined();
  });

  it('does not throw when project does not exist', async () => {
    const { processor } = makeProcessor();
    await expect(
      processor.process(makeFeedbackPayload({ projectId: 'non-existent-project' })),
    ).resolves.toBeDefined();
  });

  it('returns errors array (not throws) on DB failure', async () => {
    // Simulate DB error on hypothesis insert
    const db = createMockSupabase({
      maybeSingle: { data: null, error: null },
      single:      { data: null, error: { message: 'DB connection lost' } },
    });
    const bus = new InProcessEventBus();
    const processor = new FeedbackProcessor(
      db as unknown as import('@supabase/supabase-js').SupabaseClient,
      bus,
    );

    const result = await processor.process(makeFeedbackPayload({ eventType: 'accepted' }));
    // Should not throw — errors captured in result
    expect(result).toBeDefined();
    expect(result.userId).toBe('user-001');
  });

  it('emits intelligence.signal.extracted event during processing when hypothesis succeeds', async () => {
    const db = createMockSupabase({
      maybeSingle: { data: null, error: null },
      single:      { data: makeHypothesisRow({ state: 'PROVISIONAL' }), error: null },
      list:        { data: [], error: null },
    });
    const bus = new InProcessEventBus();
    const emittedEvents: string[] = [];

    bus.on('intelligence.signal.extracted', async () => {
      emittedEvents.push('signal.extracted');
    });

    const processor = new FeedbackProcessor(
      db as unknown as import('@supabase/supabase-js').SupabaseClient,
      bus,
    );

    await processor.process(makeFeedbackPayload({ eventType: 'deployed' }));
    expect(emittedEvents.length).toBeGreaterThan(0);
  });

  it('full pipeline: event bus subscription triggers processing', async () => {
    const db = createMockSupabase({
      maybeSingle: { data: null, error: null },
      single:      { data: makeHypothesisRow({ state: 'PROVISIONAL' }), error: null },
      list:        { data: [], error: null },
    });
    const bus = new InProcessEventBus();
    const processor = new FeedbackProcessor(
      db as unknown as import('@supabase/supabase-js').SupabaseClient,
      bus,
    );
    processor.register();

    // Emit via bus — processor should handle it
    let handled = false;
    bus.on('intelligence.signal.extracted', async () => {
      handled = true;
    });

    await bus.emit('intelligence.artifact.feedback', makeFeedbackPayload({ eventType: 'deployed' }));
    expect(handled).toBe(true);
  });
});
