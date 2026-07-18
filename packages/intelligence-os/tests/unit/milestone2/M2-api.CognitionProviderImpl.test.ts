/**
 * M2-api.CognitionProviderImpl.test.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 */

import { describe, it, expect, vi } from 'vitest';
import { CognitionProviderImpl } from '../../../src/api/CognitionProviderImpl';
import { createDegradedCognitionContext } from '@platform/cognition-contract';
import type { WorkspaceIntelligenceDomain } from '../../../src/domains/WorkspaceIntelligenceDomain';
import type { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { HealthChecker } from '../../../src/api/HealthChecker';
import type { FeedbackProcessor } from '../../../src/pipeline/FeedbackProcessor';
import type { Learning } from '../../../src/types/entities';

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'lrn-1', userId: 'user-1', workspaceId: 'ws-1', subjectType: 'workspace', projectId: null,
    domain: 'artifact_intelligence', taxonomyCategory: 'writing_style',
    stabilityClass: 'medium_term', state: 'ACTIVE', confidence: 0.9,
    contextScope: 'global', contextArtifactType: null, contextProjectId: null,
    contextAudienceType: null, content: { tone: 'bold' }, sourceSummary: {},
    decayRate: 'standard', lastConfirmedAt: null, decayStartedAt: null,
    archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeDeps(overrides: {
  learnings?: Learning[];
  getWorkspaceLearnings?: ReturnType<typeof vi.fn>;
  reviewLearningForWorkspace?: ReturnType<typeof vi.fn>;
  healthResult?: { healthy: boolean; degradedReason?: string };
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  processObservation?: ReturnType<typeof vi.fn>;
} = {}) {
  const workspace = {
    getWorkspaceLearnings:
      overrides.getWorkspaceLearnings ?? vi.fn().mockResolvedValue(overrides.learnings ?? []),
    getContext: vi.fn().mockResolvedValue({ workspaceId: 'ws-1', complianceConstraints: [], voiceConfiguration: null }),
  } as unknown as WorkspaceIntelligenceDomain;

  const user = {
    reviewLearningForWorkspace:
      overrides.reviewLearningForWorkspace ??
      vi.fn().mockResolvedValue({ newState: 'ACTIVE', previousState: 'FLAGGED' }),
    // ADR-004 (Cognitive Consolidation) — ContextBuilder's new dependency;
    // defaults to "no profile yet", matching every pre-ADR-004 test's
    // expectations (knowledge/reasoning/positioning all null).
    getCurrentProfileForSubject: vi.fn().mockResolvedValue(null),
  } as unknown as UserIntelligenceDomain;

  const health = {
    check: vi.fn().mockResolvedValue(overrides.healthResult ?? { healthy: true }),
  } as unknown as HealthChecker;

  const feedbackProcessor = {
    processObservation:
      overrides.processObservation ??
      vi.fn().mockResolvedValue({
        userId: 'ws-1',
        subject: { subjectType: 'workspace', subjectId: 'ws-1' },
        signalsProcessed: 1,
        observationsCreated: 1,
        hypothesesUpdated: 1,
        learningsCreated: 0,
        profileRebuilt: false,
        errors: [],
      }),
  } as unknown as FeedbackProcessor;

  const logger = overrides.logger ?? { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  return { workspace, user, health, feedbackProcessor, logger };
}

describe('CognitionProviderImpl.resolveCognitionContext()', () => {
  it('returns a resolved context on success', async () => {
    const deps = makeDeps({ learnings: [makeLearning()] });
    const provider = new CognitionProviderImpl(deps);

    const context = await provider.resolveCognitionContext({ workspaceId: 'ws-1' });

    expect(context.workspaceId).toBe('ws-1');
    expect(context.confidence).toBe('high');
  });

  it('falls back to createDegradedCognitionContext (never throws) when the fetch fails', async () => {
    const deps = makeDeps({
      getWorkspaceLearnings: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const provider = new CognitionProviderImpl(deps);

    const context = await provider.resolveCognitionContext({ workspaceId: 'ws-2' });

    const expected = createDegradedCognitionContext('ws-2');
    expect({ ...context, resolvedAt: undefined }).toEqual({ ...expected, resolvedAt: undefined });
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe('CognitionProviderImpl.observe()', () => {
  it('never throws, and logs the observation for observability', async () => {
    const deps = makeDeps();
    const provider = new CognitionProviderImpl(deps);

    await expect(
      provider.observe({ workspaceId: 'ws-1', requestId: 'req-1', outputText: 'hello', score: 0.7 }),
    ).resolves.toBeUndefined();

    expect(deps.logger.info).toHaveBeenCalled();
  });

  it('ADR-003: delegates to FeedbackProcessor.processObservation() (the Learning Pipeline), not a direct workspace-learning write', async () => {
    const deps = makeDeps();
    const provider = new CognitionProviderImpl(deps);
    const input = { workspaceId: 'ws-1', requestId: 'req-1', outputText: 'hello', score: 0.7 };

    await provider.observe(input);

    expect(deps.feedbackProcessor.processObservation).toHaveBeenCalledWith(input);
  });

  it('never throws even when the pipeline run itself rejects', async () => {
    const deps = makeDeps({
      processObservation: vi.fn().mockRejectedValue(new Error('pipeline unavailable')),
    });
    const provider = new CognitionProviderImpl(deps);

    await expect(
      provider.observe({ workspaceId: 'ws-1', requestId: 'req-1', outputText: 'hello', score: 0.7 }),
    ).resolves.toBeUndefined();

    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe('CognitionProviderImpl.review()', () => {
  it('delegates to UserIntelligenceDomain.reviewLearningForWorkspace with the decision fields', async () => {
    const deps = makeDeps();
    const provider = new CognitionProviderImpl(deps);

    await provider.review({ workspaceId: 'ws-1', entryId: 'lrn-1', approved: true, reviewedBy: 'alice' });

    expect(deps.user.reviewLearningForWorkspace).toHaveBeenCalledWith('ws-1', 'lrn-1', true, 'alice');
  });

  it('propagates errors rather than swallowing them', async () => {
    const deps = makeDeps({
      reviewLearningForWorkspace: vi.fn().mockRejectedValue(new Error('not found')),
    });
    const provider = new CognitionProviderImpl(deps);

    await expect(
      provider.review({ workspaceId: 'ws-1', entryId: 'missing', approved: true, reviewedBy: 'alice' }),
    ).rejects.toThrow('not found');
  });
});

describe('CognitionProviderImpl.summarizeCognition()', () => {
  it('returns null fields for a workspace with no learnings', async () => {
    const deps = makeDeps({ learnings: [] });
    const provider = new CognitionProviderImpl(deps);

    const summary = await provider.summarizeCognition('ws-1');

    expect(summary).toEqual({
      preferredTone: null, audience: null, industry: null, positioning: null, keywords: null,
    });
  });

  it('projects tone/audience/industry from workspace learnings', async () => {
    const deps = makeDeps({
      learnings: [makeLearning({ content: { tone: 'bold', audienceType: 'executives', domain: 'fintech' } })],
    });
    const provider = new CognitionProviderImpl(deps);

    const summary = await provider.summarizeCognition('ws-1');

    expect(summary.preferredTone).toBe('bold');
    expect(summary.audience).toBe('executives');
    expect(summary.industry).toBe('fintech');
  });
});

describe('CognitionProviderImpl.checkHealth()', () => {
  it('delegates to HealthChecker', async () => {
    const deps = makeDeps({ healthResult: { healthy: false, degradedReason: 'timeout' } });
    const provider = new CognitionProviderImpl(deps);

    const health = await provider.checkHealth();

    expect(health).toEqual({ healthy: false, degradedReason: 'timeout' });
  });
});
