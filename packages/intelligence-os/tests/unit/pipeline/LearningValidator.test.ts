/**
 * LearningValidator.test.ts
 *
 * Dedicated unit tests for LearningValidator, Stage 4–5 of the Learning
 * Pipeline (ARCHITECTURE.md §9). Closes part of the test-coverage gap
 * `IMPLEMENTATION_STATUS.md`/`ROADMAP.md` flag: `LearningValidator.evaluate()`
 * previously had only indirect coverage via
 * `tests/unit/pipeline/pipeline-integration.test.ts` (`.maybeConfirm()`
 * already has its own dedicated file, `UserCorrection.test.ts`, and is not
 * duplicated here). This file focuses on `evaluate()`'s promotion gate:
 * state-eligibility, the contradiction block, the corroboration threshold,
 * the escalation rule, and the Subject-aware `domain`/`userId`/`workspaceId`
 * assignment on the created Learning (ADR-003).
 */

import { describe, it, expect, vi } from 'vitest';
import { LearningValidator } from '../../../src/pipeline/LearningValidator';
import type { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { Hypothesis, Learning } from '../../../src/types/entities';

function makeHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: 'hyp-1',
    userId: 'user-1',
    workspaceId: null,
    subjectType: 'user',
    projectId: null,
    taxonomyCategory: 'communication_style',
    stabilityClass: 'long_term',
    state: 'ACCUMULATING',
    confidence: 0.5,
    requiredCorroborations: 3,
    currentCorroborations: 0,
    highQualityContradictions: 0,
    proposition: { statement: 'writes concisely' },
    contextScope: 'global',
    contextArtifactType: null,
    promotedLearningId: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDomain(overrides: Record<string, unknown> = {}) {
  return {
    insertLearning: vi.fn().mockImplementation(async (input: Partial<Learning>) => ({
      id: 'learn-1',
      sourceSummary: {},
      lastConfirmedAt: new Date(),
      decayStartedAt: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...input,
    }) as Learning),
    getLatestValidatedLearning: vi.fn().mockResolvedValue(null),
    confirmLearning: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UserIntelligenceDomain;
}

describe('LearningValidator — state eligibility', () => {
  it('refuses to promote a PROVISIONAL hypothesis regardless of corroboration count', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    const result = await validator.evaluate(
      makeHypothesis({ state: 'PROVISIONAL', currentCorroborations: 10, requiredCorroborations: 3 }),
    );

    expect(result.promoted).toBe(false);
    expect(result.learning).toBeNull();
    expect(result.reason).toContain('PROVISIONAL');
    expect(domain.insertLearning).not.toHaveBeenCalled();
  });

  it('refuses to promote a DISCARDED hypothesis', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    const result = await validator.evaluate(
      makeHypothesis({ state: 'DISCARDED', currentCorroborations: 10, requiredCorroborations: 3 }),
    );

    expect(result.promoted).toBe(false);
  });

  it('refuses to promote a REJECTED hypothesis even with high corroboration', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    const result = await validator.evaluate(
      makeHypothesis({ state: 'REJECTED', currentCorroborations: 10, requiredCorroborations: 3 }),
    );

    expect(result.promoted).toBe(false);
  });

  it('allows evaluation to proceed for a CHALLENGED hypothesis whose contradictions have cleared', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    const result = await validator.evaluate(
      makeHypothesis({
        state: 'CHALLENGED',
        highQualityContradictions: 0,
        currentCorroborations: 3,
        requiredCorroborations: 3,
      }),
    );

    expect(result.promoted).toBe(true);
  });
});

describe('LearningValidator — contradiction block', () => {
  it('blocks promotion while any unresolved high-quality contradiction exists, even above threshold', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    const result = await validator.evaluate(
      makeHypothesis({
        state: 'ACCUMULATING',
        currentCorroborations: 5,
        requiredCorroborations: 3,
        highQualityContradictions: 1,
      }),
    );

    expect(result.promoted).toBe(false);
    expect(result.reason).toContain('contradiction');
  });
});

describe('LearningValidator — corroboration threshold and escalation', () => {
  it('does not promote strictly below the required corroboration count', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    const result = await validator.evaluate(
      makeHypothesis({ state: 'ACCUMULATING', currentCorroborations: 2, requiredCorroborations: 3 }),
    );

    expect(result.promoted).toBe(false);
    expect(result.reason).toContain('threshold not met');
  });

  it('promotes exactly at the required corroboration count, without the escalation boost, when below the escalation floor of 3', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    const result = await validator.evaluate(
      makeHypothesis({ state: 'ACCUMULATING', currentCorroborations: 2, requiredCorroborations: 2, confidence: 0.5 }),
    );

    expect(result.promoted).toBe(true);
    expect(result.learning!.confidence).toBe(0.5); // no escalation boost — threshold met normally, escalation needs ≥3
  });

  it('applies the escalation rule (≥3 corroborations, 0 contradictions) even below the stability class threshold', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    // requiredCorroborations of 5 (e.g. a hypothetical higher bar) not yet met,
    // but 3 corroborations with 0 contradictions still escalates per Schema D.4.
    const result = await validator.evaluate(
      makeHypothesis({
        state: 'ACCUMULATING',
        currentCorroborations: 3,
        requiredCorroborations: 5,
        highQualityContradictions: 0,
        confidence: 0.4,
      }),
    );

    expect(result.promoted).toBe(true);
    expect(result.reason).toContain('Escalation');
  });

  it('escalation raises confidence to at least the escalation floor (0.85) but never lowers it', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    const result = await validator.evaluate(
      makeHypothesis({
        state: 'ACCUMULATING',
        currentCorroborations: 4,
        requiredCorroborations: 10,
        highQualityContradictions: 0,
        confidence: 0.95, // already above the escalation floor
      }),
    );

    expect(result.promoted).toBe(true);
    expect(result.learning!.confidence).toBe(0.95);
  });
});

describe('LearningValidator — Learning creation (ADR-003 subject awareness)', () => {
  it('creates a Learning owned by the same User subject as the Hypothesis', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    await validator.evaluate(
      makeHypothesis({ state: 'ACCUMULATING', currentCorroborations: 3, requiredCorroborations: 3, userId: 'user-9' }),
    );

    expect(domain.insertLearning).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-9', workspaceId: null, subjectType: 'user' }),
    );
  });

  it('creates a Learning owned by the same Workspace subject as the Hypothesis, tagged workspace_intelligence', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    await validator.evaluate(
      makeHypothesis({
        state: 'ACCUMULATING',
        currentCorroborations: 3,
        requiredCorroborations: 3,
        userId: null,
        workspaceId: 'ws-1',
        subjectType: 'workspace',
      }),
    );

    expect(domain.insertLearning).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, workspaceId: 'ws-1', subjectType: 'workspace', domain: 'workspace_intelligence' }),
    );
  });

  it('routes relationship-adjacent taxonomy categories to the relationship_intelligence domain for a User subject', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    await validator.evaluate(
      makeHypothesis({
        state: 'ACCUMULATING',
        currentCorroborations: 3,
        requiredCorroborations: 3,
        taxonomyCategory: 'stakeholder_map',
      }),
    );

    expect(domain.insertLearning).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'relationship_intelligence' }),
    );
  });

  it('assigns decay_rate "none" for a permanent stability class', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    await validator.evaluate(
      makeHypothesis({
        state: 'ACCUMULATING',
        stabilityClass: 'permanent',
        currentCorroborations: 2,
        requiredCorroborations: 2,
      }),
    );

    expect(domain.insertLearning).toHaveBeenCalledWith(
      expect.objectContaining({ decayRate: 'none' }),
    );
  });

  it('carries the triggering observation into sourceSummary when provided', async () => {
    const domain = makeDomain();
    const validator = new LearningValidator(domain);

    await validator.evaluate(
      makeHypothesis({ state: 'ACCUMULATING', currentCorroborations: 3, requiredCorroborations: 3 }),
      {
        signalId: 'sig-42',
        userId: 'user-1',
        subject: { subjectType: 'user', subjectId: 'user-1' },
        subjectType: 'user',
        workspaceId: null,
        projectId: null,
        taxonomyCategory: 'communication_style',
        stabilityClass: 'long_term',
        domain: 'user_intelligence',
        sourceQuality: 'explicit_statement',
        confidence: 1.0,
        disposition: 'corroborating',
        content: {},
        contextFlags: [],
        createdAt: new Date(),
      },
    );

    expect(domain.insertLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSummary: expect.objectContaining({ triggeringSignalId: 'sig-42', sourceQuality: 'explicit_statement' }),
      }),
    );
  });
});

describe('LearningValidator — maybeConfirm (explicit-correction fast path)', () => {
  it('returns false when there is no existing VALIDATED learning to confirm', async () => {
    const domain = makeDomain({ getLatestValidatedLearning: vi.fn().mockResolvedValue(null) });
    const validator = new LearningValidator(domain);

    const confirmed = await validator.maybeConfirm('user-1', 'communication_style');

    expect(confirmed).toBe(false);
    expect(domain.confirmLearning).not.toHaveBeenCalled();
  });

  it('confirms an existing learning with a bounded confidence boost, capped at 1.0', async () => {
    const existing = { id: 'learn-5', confidence: 0.95 } as Learning;
    const domain = makeDomain({ getLatestValidatedLearning: vi.fn().mockResolvedValue(existing) });
    const validator = new LearningValidator(domain);

    const confirmed = await validator.maybeConfirm('user-1', 'communication_style');

    expect(confirmed).toBe(true);
    expect(domain.confirmLearning).toHaveBeenCalledWith('learn-5', 1.0); // 0.95 + 0.1 capped at 1.0
  });
});
