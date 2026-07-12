/**
 * UserCorrection.test.ts
 *
 * Completion Mission (post-Epic-2 session) — dedicated coverage for the
 * `intelligence.user.correction` capability, connected this session.
 *
 * Prior to this session, `LearningValidator.maybeConfirm()` and the
 * `UserCorrectionPayload` event contract both existed and were fully typed
 * (Contracts B.2: "corrections bypass quarantine and apply immediately"),
 * but nothing on the event bus ever called `maybeConfirm()` — it was a
 * dormant capability with a documented purpose and zero callers. This
 * session wired `FeedbackProcessor.register()` to subscribe to
 * `intelligence.user.correction` and route it through a new
 * `processCorrection()` method. These tests cover that new wiring plus the
 * `UserIntelligenceDomain` methods it depends on
 * (`getLatestValidatedLearning()` / `confirmLearning()`).
 *
 * See also: pipeline-integration.test.ts (LearningValidator's other
 * methods, HypothesisEngine, ProfileBuilder, FeedbackProcessor.process()).
 */

import { describe, it, expect, vi } from 'vitest';
import { FeedbackProcessor } from '../../../src/pipeline/FeedbackProcessor';
import { LearningValidator } from '../../../src/pipeline/LearningValidator';
import { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import { ArtifactIntelligenceDomain } from '../../../src/domains/ArtifactIntelligenceDomain';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import type { UserCorrectionPayload } from '../../../src/types/events';

// ── Minimal Supabase mock (mirrors pipeline-integration.test.ts's pattern,
//    scoped down to just what this file needs: maybeSingle for the
//    getLatestValidatedLearning() read, and a thenable for the
//    confirmLearning() update) ──────────────────────────────────────────────

function makeLearningRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                    'learn-001',
    user_id:               'user-001',
    workspace_id:          null,
    project_id:            null,
    domain:                'user_intelligence',
    taxonomy_category:     'communication_style',
    stability_class:       'long_term',
    state:                 'VALIDATED',
    confidence:            0.6,
    context_scope:         'global',
    context_artifact_type: null,
    context_project_id:    null,
    context_audience_type: null,
    content:               {},
    source_summary:        {},
    decay_rate:            'slow',
    last_confirmed_at:     new Date().toISOString(),
    decay_started_at:      null,
    archived_at:           null,
    created_at:            new Date().toISOString(),
    updated_at:            new Date().toISOString(),
    ...overrides,
  };
}

function makeMockSupabase(opts: {
  maybeSingle?: { data: unknown; error: null | { message: string } };
} = {}) {
  const updateCalls: Array<{ payload: unknown }> = [];

  const chain = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    update:      vi.fn().mockImplementation((payload: unknown) => {
      updateCalls.push({ payload });
      return chain;
    }),
    maybeSingle: vi.fn().mockResolvedValue(
      opts.maybeSingle ?? { data: null, error: null },
    ),
    then: vi.fn().mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ data: null, error: null })),
    ),
  };

  const from = vi.fn().mockReturnValue(chain);
  const schema = vi.fn().mockReturnValue({ from });

  return {
    schema,
    _chain: chain,
    _updateCalls: updateCalls,
  };
}

// ── LearningValidator.maybeConfirm() ────────────────────────────────────────

describe('LearningValidator.maybeConfirm()', () => {
  it('returns false when no VALIDATED learning exists for the category', async () => {
    const db = makeMockSupabase({ maybeSingle: { data: null, error: null } });
    const validator = new LearningValidator(
      new UserIntelligenceDomain(db as unknown as import('@supabase/supabase-js').SupabaseClient),
    );

    const confirmed = await validator.maybeConfirm('user-001', 'communication_style');

    expect(confirmed).toBe(false);
    expect(db._updateCalls).toHaveLength(0);
  });

  it('confirms the matching learning and boosts confidence when one exists', async () => {
    const db = makeMockSupabase({
      maybeSingle: { data: makeLearningRow({ confidence: 0.6 }), error: null },
    });
    const validator = new LearningValidator(
      new UserIntelligenceDomain(db as unknown as import('@supabase/supabase-js').SupabaseClient),
    );

    const confirmed = await validator.maybeConfirm('user-001', 'communication_style');

    expect(confirmed).toBe(true);
    expect(db._updateCalls).toHaveLength(1);
    const payload = db._updateCalls[0]!.payload as Record<string, unknown>;
    expect(payload.state).toBe('CONFIRMED');
    // 0.6 + 0.1 boost = 0.7
    expect(payload.confidence).toBeCloseTo(0.7, 5);
  });

  it('caps the confirmation boost at 1.0', async () => {
    const db = makeMockSupabase({
      maybeSingle: { data: makeLearningRow({ confidence: 0.95 }), error: null },
    });
    const validator = new LearningValidator(
      new UserIntelligenceDomain(db as unknown as import('@supabase/supabase-js').SupabaseClient),
    );

    await validator.maybeConfirm('user-001', 'communication_style');

    const payload = db._updateCalls[0]!.payload as Record<string, unknown>;
    expect(payload.confidence).toBe(1.0);
  });
});

// ── FeedbackProcessor.processCorrection() ───────────────────────────────────

describe('FeedbackProcessor.processCorrection()', () => {
  function makeProcessor(db: ReturnType<typeof makeMockSupabase>) {
    const bus = new InProcessEventBus();
    const supabase = db as unknown as import('@supabase/supabase-js').SupabaseClient;
    return new FeedbackProcessor(
      bus,
      new UserIntelligenceDomain(supabase),
      new ArtifactIntelligenceDomain(supabase),
    );
  }

  it('returns confirmed:false and does not query when taxonomyCategory is missing', async () => {
    const db = makeMockSupabase();
    const processor = makeProcessor(db);

    const payload: UserCorrectionPayload = {
      userId: 'user-001',
      correctionType: 'other',
      taxonomyCategory: null,
      correctedValue: 'some correction',
      occurredAt: new Date().toISOString(),
    };

    const result = await processor.processCorrection(payload);

    expect(result).toEqual({ confirmed: false });
    expect(db._chain.maybeSingle).not.toHaveBeenCalled();
  });

  it('returns confirmed:true when a matching VALIDATED learning exists', async () => {
    const db = makeMockSupabase({
      maybeSingle: { data: makeLearningRow(), error: null },
    });
    const processor = makeProcessor(db);

    const payload: UserCorrectionPayload = {
      userId: 'user-001',
      correctionType: 'tone',
      taxonomyCategory: 'communication_style',
      correctedValue: 'more formal',
      occurredAt: new Date().toISOString(),
    };

    const result = await processor.processCorrection(payload);

    expect(result).toEqual({ confirmed: true });
  });

  it('swallows errors and returns confirmed:false rather than throwing', async () => {
    const db = makeMockSupabase();
    db._chain.maybeSingle.mockRejectedValueOnce(new Error('db unavailable'));
    const processor = makeProcessor(db);

    const payload: UserCorrectionPayload = {
      userId: 'user-001',
      correctionType: 'fact',
      taxonomyCategory: 'goals_and_objectives',
      correctedValue: 'corrected fact',
      occurredAt: new Date().toISOString(),
    };

    await expect(processor.processCorrection(payload)).resolves.toEqual({ confirmed: false });
  });

  it('register() subscribes to intelligence.user.correction on the bus', async () => {
    const db = makeMockSupabase({
      maybeSingle: { data: makeLearningRow(), error: null },
    });
    const bus = new InProcessEventBus();
    const supabase = db as unknown as import('@supabase/supabase-js').SupabaseClient;
    const processor = new FeedbackProcessor(
      bus,
      new UserIntelligenceDomain(supabase),
      new ArtifactIntelligenceDomain(supabase),
    );
    processor.register();

    const spy = vi.spyOn(processor, 'processCorrection');

    await bus.emit('intelligence.user.correction', {
      userId: 'user-001',
      correctionType: 'tone',
      taxonomyCategory: 'communication_style',
      correctedValue: 'more formal',
      occurredAt: new Date().toISOString(),
    });

    // InProcessEventBus handlers are fire-and-forget; give the microtask
    // queue a tick to let the async handler run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(spy).toHaveBeenCalledOnce();
  });
});
