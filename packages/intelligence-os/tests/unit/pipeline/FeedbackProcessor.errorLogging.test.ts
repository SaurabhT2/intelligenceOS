/**
 * FeedbackProcessor.errorLogging.test.ts
 *
 * Regression coverage for the 2026-08-04 production incident
 * (POST /v1/cognition/observe reporting errorCount > 0 with no way to
 * recover what actually failed — see docs/handoffs/ for the incident
 * writeup). Before this fix, `result.errors` was captured but never
 * logged anywhere: every event-bus subscriber in `register()` discarded
 * the return value, and `CognitionProviderImpl.observe()` only logged
 * `result.errors.length`, never the errors themselves.
 *
 * These tests assert the observable contract going forward:
 *   - A stage failure is both captured in the returned result AND passed
 *     to the injected logger, with stage/message/cause intact.
 *   - A clean run never logs anything (no noise on the happy path).
 *   - `processCorrection()`'s previously fully-silent catch now logs too.
 */

import { describe, it, expect, vi } from 'vitest';
import { FeedbackProcessor } from '../../../src/pipeline/FeedbackProcessor';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import type { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { ArtifactIntelligenceDomain } from '../../../src/domains/ArtifactIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../../../src/domains/KnowledgeIntelligenceDomain';

function makeProcessor() {
  const bus = new InProcessEventBus();
  const userDomain = {} as unknown as UserIntelligenceDomain;
  const artifactDomain = {} as unknown as ArtifactIntelligenceDomain;
  const knowledgeDomain = {} as unknown as KnowledgeIntelligenceDomain;
  const logger = { warn: vi.fn() };
  const processor = new FeedbackProcessor(bus, userDomain, artifactDomain, knowledgeDomain, logger);
  return { processor, logger };
}

describe('FeedbackProcessor — stage-error logging (incident 2026-08-04 fix)', () => {
  it('logs stage/message/cause when processObservation() hits a stage failure', async () => {
    const { processor, logger } = makeProcessor();

    // Force Stage 1 (signal extraction) to fail the way a schema mismatch
    // (e.g. a missing DB column surfacing via a downstream stage) would —
    // any thrown error at any stage exercises the same finish() path.
    const dbLikeError = Object.assign(new Error('Failed to fetch profile for workspace ws-1'), {
      code: 'DATABASE_ERROR',
      cause: { code: '42703', message: 'column profiles.workspace_id does not exist' },
    });
    vi.spyOn(processor['signalExtractor'], 'extractFromObservation').mockImplementation(() => {
      throw dbLikeError;
    });

    const result = await processor.processObservation({
      workspaceId: 'ws-1',
      requestId: 'req-1',
      outputText: 'generated artifact text',
      score: 1,
      topic: 'test',
      artifactType: 'carousel',
      wasRepaired: false,
      providerId: 'p1',
      modelId: 'm1',
    } as never);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stage).toBe('signal');

    // The actual assertion this incident was missing: the error is
    // observable outside the return value too.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [message, loggedErrors] = logger.warn.mock.calls[0];
    expect(message).toContain('workspace ws-1');
    expect(loggedErrors).toEqual([
      expect.objectContaining({ stage: 'signal', cause: dbLikeError }),
    ]);
  });

  it('does not log anything on a clean run with zero stage errors', async () => {
    const { processor, logger } = makeProcessor();
    vi.spyOn(processor['signalExtractor'], 'extractFromObservation').mockReturnValue([]);

    const result = await processor.processObservation({
      workspaceId: 'ws-2',
      requestId: 'req-2',
      outputText: 'generated artifact text',
      score: 0,
      topic: 'test',
      artifactType: 'carousel',
      wasRepaired: false,
      providerId: 'p1',
      modelId: 'm1',
    } as never);

    expect(result.errors).toHaveLength(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs (instead of silently swallowing) when processCorrection() fails', async () => {
    const { processor, logger } = makeProcessor();
    vi.spyOn(processor['learningValidator'], 'maybeConfirm').mockRejectedValue(new Error('boom'));

    const result = await processor.processCorrection({
      userId: 'u1',
      correctionType: 'tone',
      taxonomyCategory: 'communication_style',
      correctedValue: 'more formal',
      occurredAt: new Date().toISOString(),
    });

    expect(result).toEqual({ confirmed: false });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('processCorrection failed for user u1');
  });
});
