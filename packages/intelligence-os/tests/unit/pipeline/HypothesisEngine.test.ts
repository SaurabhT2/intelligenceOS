/**
 * HypothesisEngine.test.ts
 *
 * Dedicated unit tests for HypothesisEngine, the state-machine stage of the
 * Learning Pipeline (ARCHITECTURE.md §9). This closes part of the
 * test-coverage gap `IMPLEMENTATION_STATUS.md`/`ROADMAP.md` flag —
 * previously this class had only indirect coverage via
 * `tests/unit/pipeline/pipeline-integration.test.ts`. That integration file
 * is left unchanged; this file adds focused, class-level coverage of the
 * pure state-transition logic (corroboration/contradiction math, expiry
 * computation, stability-class-driven thresholds) and the Subject-generic
 * (ADR-003) discard path, using lightweight domain mocks rather than the
 * full Supabase-chain mock the integration file uses.
 */

import { describe, it, expect, vi } from 'vitest';
import { HypothesisEngine } from '../../../src/pipeline/HypothesisEngine';
import { userSubject, workspaceSubject } from '../../../src/types/subject';
import type { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { Hypothesis } from '../../../src/types/entities';
import type { Observation } from '../../../src/pipeline/types';

function makeHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: 'hyp-1',
    userId: 'user-1',
    workspaceId: null,
    subjectType: 'user',
    projectId: null,
    taxonomyCategory: 'communication_style',
    stabilityClass: 'long_term',
    state: 'PROVISIONAL',
    confidence: 0.36,
    requiredCorroborations: 3,
    currentCorroborations: 0,
    highQualityContradictions: 0,
    proposition: {},
    contextScope: 'global',
    contextArtifactType: null,
    promotedLearningId: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    signalId: 'sig-1',
    userId: 'user-1',
    subject: userSubject('user-1'),
    subjectType: 'user',
    workspaceId: null,
    projectId: null,
    taxonomyCategory: 'communication_style',
    stabilityClass: 'long_term',
    domain: 'user_intelligence',
    sourceQuality: 'demonstrated_behavior',
    confidence: 0.54,
    disposition: 'corroborating',
    content: {},
    contextFlags: [],
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDomain(overrides: Record<string, unknown> = {}) {
  return {
    findOpenHypothesisForSubject: vi.fn().mockResolvedValue(null),
    createHypothesisForSubject: vi.fn().mockImplementation(async (payload: Record<string, unknown>) =>
      makeHypothesis({
        currentCorroborations: payload['current_corroborations'] as number,
        requiredCorroborations: payload['required_corroborations'] as number,
        state: payload['state'] as Hypothesis['state'],
      }),
    ),
    updateHypothesis: vi.fn().mockImplementation(async (_id: string, updates: Record<string, unknown>) =>
      makeHypothesis({ ...updates } as Partial<Hypothesis>),
    ),
    markHypothesisPromoted: vi.fn().mockResolvedValue(undefined),
    discardExpiredHypotheses: vi.fn().mockResolvedValue(2),
    discardExpiredHypothesesForSubject: vi.fn().mockResolvedValue(3),
    ...overrides,
  } as unknown as UserIntelligenceDomain;
}

describe('HypothesisEngine — creation path', () => {
  it('creates a new PROVISIONAL hypothesis with the stability-class corroboration threshold', async () => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ stabilityClass: 'permanent' }));

    expect(domain.createHypothesisForSubject).toHaveBeenCalledWith(
      expect.objectContaining({ required_corroborations: 2, state: 'PROVISIONAL' }),
    );
  });

  it.each([
    ['permanent', 2],
    ['long_term', 3],
    ['medium_term', 2],
  ] as const)('sets required_corroborations for stability class %s to %d', async (stabilityClass, expected) => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ stabilityClass }));

    expect(domain.createHypothesisForSubject).toHaveBeenCalledWith(
      expect.objectContaining({ required_corroborations: expected }),
    );
  });

  it('sets expires_at to null for a permanent-class hypothesis (never expires)', async () => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ stabilityClass: 'permanent' }));

    expect(domain.createHypothesisForSubject).toHaveBeenCalledWith(
      expect.objectContaining({ expires_at: null }),
    );
  });

  it('sets expires_at ~30 days out for a non-permanent-class hypothesis', async () => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ stabilityClass: 'long_term' }));

    const call = (domain.createHypothesisForSubject as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    const expiresAt = new Date(call['expires_at'] as string).getTime();
    const expected = Date.now() + 30 * 86400000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(5000);
  });

  it('routes a workspace-subject observation through the same creation path (ADR-003)', async () => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ subject: workspaceSubject('ws-1'), subjectType: 'workspace' }));

    expect(domain.createHypothesisForSubject).toHaveBeenCalledWith(
      expect.objectContaining({ subject_type: 'workspace', workspace_id: 'ws-1', user_id: null }),
    );
  });

  it('scopes context_scope to "project" when the observation carries a projectId', async () => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ projectId: 'proj-1' }));

    expect(domain.createHypothesisForSubject).toHaveBeenCalledWith(
      expect.objectContaining({ context_scope: 'project', project_id: 'proj-1' }),
    );
  });
});

describe('HypothesisEngine — corroboration math', () => {
  it('increments current_corroborations by exactly 1 per corroborating observation', async () => {
    const existing = makeHypothesis({ state: 'ACCUMULATING', currentCorroborations: 1 });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'corroborating' }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ current_corroborations: 2 }),
    );
  });

  it('takes the higher of existing and new observation confidence, never averages', async () => {
    const existing = makeHypothesis({ state: 'ACCUMULATING', confidence: 0.3 });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'corroborating', confidence: 0.9 }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ confidence: 0.9 }),
    );
  });

  it('refreshes expires_at on every corroboration', async () => {
    const existing = makeHypothesis({ state: 'ACCUMULATING', stabilityClass: 'medium_term' });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'corroborating', stabilityClass: 'medium_term' }));

    const call = (domain.updateHypothesis as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    expect(call['expires_at']).not.toBeNull();
  });

  it('advances PROVISIONAL to ACCUMULATING on the first corroboration below threshold', async () => {
    const existing = makeHypothesis({ state: 'PROVISIONAL', currentCorroborations: 0, requiredCorroborations: 3 });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'corroborating' }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ state: 'ACCUMULATING' }),
    );
  });

  it('resolves a CHALLENGED hypothesis back to ACCUMULATING once contradictions clear to zero', async () => {
    // highQualityContradictions is 0 here specifically to exercise the
    // "already resolved" branch of computeCorroborationUpdates.
    const existing = makeHypothesis({
      state: 'CHALLENGED',
      highQualityContradictions: 0,
      currentCorroborations: 1,
      requiredCorroborations: 3,
    });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'corroborating' }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ state: 'ACCUMULATING' }),
    );
  });

  it('keeps a CHALLENGED hypothesis CHALLENGED while a high-quality contradiction remains unresolved', async () => {
    const existing = makeHypothesis({
      state: 'CHALLENGED',
      highQualityContradictions: 1,
      currentCorroborations: 1,
      requiredCorroborations: 3,
    });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'corroborating' }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ state: 'CHALLENGED' }),
    );
  });

  it('treats a "new" disposition on an existing hypothesis as corroborating', async () => {
    const existing = makeHypothesis({ state: 'ACCUMULATING', currentCorroborations: 0 });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'new' }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ current_corroborations: 1 }),
    );
  });
});

describe('HypothesisEngine — contradiction math', () => {
  it('halves confidence exactly on a high-quality contradiction', async () => {
    const existing = makeHypothesis({ state: 'ACCUMULATING', confidence: 0.6, highQualityContradictions: 0 });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'contradicting', sourceQuality: 'demonstrated_behavior' }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ confidence: 0.3, state: 'CHALLENGED' }),
    );
  });

  it('does not count a low-quality (inferred) contradiction toward the high-quality tally', async () => {
    const existing = makeHypothesis({ state: 'ACCUMULATING', highQualityContradictions: 0 });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'contradicting', sourceQuality: 'inferred' }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ high_quality_contradictions: 0, state: 'CHALLENGED' }),
    );
  });

  it('rejects outright (confidence 0) once high-quality contradictions reach 2', async () => {
    const existing = makeHypothesis({ state: 'CHALLENGED', highQualityContradictions: 1 });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'contradicting', sourceQuality: 'explicit_statement' }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ state: 'REJECTED', confidence: 0, high_quality_contradictions: 2 }),
    );
  });

  it('treats uploaded_artifact-sourced contradictions as high-quality (ceiling ≥ 0.65)', async () => {
    const existing = makeHypothesis({ state: 'ACCUMULATING', highQualityContradictions: 0 });
    const domain = makeDomain({ findOpenHypothesisForSubject: vi.fn().mockResolvedValue(existing) });
    const engine = new HypothesisEngine(domain);

    await engine.process(makeObservation({ disposition: 'contradicting', sourceQuality: 'uploaded_artifact' }));

    expect(domain.updateHypothesis).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ high_quality_contradictions: 1 }),
    );
  });
});

describe('HypothesisEngine — promotion helper and expiry', () => {
  it('markPromoted sets state VALIDATED and the promoted_learning_id', async () => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    await engine.markPromoted('hyp-1', 'learn-1');

    expect(domain.markHypothesisPromoted).toHaveBeenCalledWith('hyp-1', 'learn-1');
  });

  it('discardExpired (legacy User-only signature) delegates to discardExpiredHypotheses', async () => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    const count = await engine.discardExpired('user-1');

    expect(domain.discardExpiredHypotheses).toHaveBeenCalledWith('user-1');
    expect(count).toBe(2);
  });

  it('discardExpiredForSubject routes a user subject through the legacy method (ADR-003 back-compat)', async () => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    const count = await engine.discardExpiredForSubject(userSubject('user-1'));

    expect(domain.discardExpiredHypotheses).toHaveBeenCalledWith('user-1');
    expect(count).toBe(2);
  });

  it('discardExpiredForSubject routes a workspace subject through the Subject-generic method', async () => {
    const domain = makeDomain();
    const engine = new HypothesisEngine(domain);

    const count = await engine.discardExpiredForSubject(workspaceSubject('ws-1'));

    expect(domain.discardExpiredHypothesesForSubject).toHaveBeenCalledWith(workspaceSubject('ws-1'));
    expect(count).toBe(3);
  });
});
