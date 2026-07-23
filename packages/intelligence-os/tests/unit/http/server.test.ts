/**
 * server.test.ts
 *
 * Milestone 3, Phase 3 (Testing). `src/api/http/server.ts` — the entire HTTP
 * surface BrandOS's `HttpCognitionProvider` talks to — had no tests of its
 * own before this milestone. These tests start a real server on an
 * ephemeral port and drive it with real HTTP requests (via `fetch`), so
 * they verify the actual wire behaviour: route paths, auth enforcement,
 * status codes, and error-shape mapping, matching what Phase 0's
 * compatibility audit found BrandOS's client expects.
 *
 * The `CognitionProviderImpl` dependency is mocked here — this file is
 * about the HTTP transport, not cognition logic (already covered by
 * M2-api.CognitionProviderImpl.test.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createCognitionHttpServer, type KnowledgeIngestPort } from '../../../src/api/http/server';
import type { CognitionProviderImpl } from '../../../src/api/CognitionProviderImpl';
import { EntityNotFoundError, ValidationError } from '../../../src/errors';
import type { CognitionContext, CognitionHealth } from '@platform/cognition-contract';

const API_KEY = 'test-server-key';

const SAMPLE_CONTEXT: CognitionContext = {
  contractVersion: '1.0.0',
  workspaceId: 'ws-1',
  resolvedAt: '2026-06-01T00:00:00.000Z',
  confidence: 'high',
  voice: {
    tone: 'confident',
    cadence: 'short',
    audienceType: 'b2b',
    executiveLevel: true,
    domain: 'fintech',
    bannedPhrases: ['synergy'],
  },
  identity: null,
  visualIdentity: null,
  knowledge: null,
  reasoning: null,
  positioning: null,
  provenance: { signalCount: 7, lastConsolidatedAt: '2026-05-30T00:00:00.000Z' },
};

function makeMockProvider(overrides: Partial<Record<keyof CognitionProviderImpl, ReturnType<typeof vi.fn>>> = {}) {
  return {
    resolveCognitionContext: vi.fn().mockResolvedValue(SAMPLE_CONTEXT),
    observe: vi.fn().mockResolvedValue(undefined),
    review: vi.fn().mockResolvedValue(undefined),
    summarizeCognition: vi.fn().mockResolvedValue({
      preferredTone: 'confident',
      audience: 'b2b',
      industry: 'fintech',
      positioning: null,
      keywords: null,
    }),
    checkHealth: vi.fn().mockResolvedValue({ healthy: true } satisfies CognitionHealth),
    ...overrides,
  } as unknown as CognitionProviderImpl;
}

describe('createCognitionHttpServer', () => {
  let server: Server;
  let baseUrl: string;
  let provider: ReturnType<typeof makeMockProvider>;
  let serverLogger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  function start(p: ReturnType<typeof makeMockProvider>, knowledge?: KnowledgeIngestPort): Promise<void> {
    provider = p;
    serverLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    server = createCognitionHttpServer(
      provider,
      { apiKey: API_KEY, logger: serverLogger },
      knowledge,
    );
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  }

  function stop(): Promise<void> {
    return new Promise((resolve) => server.close(() => resolve()));
  }

  describe('authentication', () => {
    beforeAll(() => start(makeMockProvider()));
    afterAll(() => stop());

    it('rejects requests with no Authorization header', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/health`);
      expect(res.status).toBe(401);
    });

    it('rejects requests with the wrong bearer token', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/health`, {
        headers: { Authorization: 'Bearer wrong-key' },
      });
      expect(res.status).toBe(401);
    });

    it('accepts requests with the correct bearer token', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/health`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /v1/cognition/resolve', () => {
    beforeAll(() => start(makeMockProvider()));
    afterAll(() => stop());

    it('resolves and returns the CognitionContext exactly as produced by the provider', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'ws-1', taskType: 'blog' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(SAMPLE_CONTEXT);
      expect(provider.resolveCognitionContext).toHaveBeenCalledWith({ workspaceId: 'ws-1', taskType: 'blog' });
    });

    it('returns 400 when workspaceId is missing — matches client sending malformed input, not a server fault', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'blog' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/cognition/observe and /v1/cognition/review', () => {
    beforeAll(() => start(makeMockProvider()));
    afterAll(() => stop());

    it('observe returns 204 No Content on success', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/observe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'ws-1', requestId: 'req-1', outputText: 'hi', score: 0.8 }),
      });
      expect(res.status).toBe(204);
    });

    it('review returns 204 No Content on success', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'ws-1', entryId: 'entry-1', approved: true, reviewedBy: 'user-1' }),
      });
      expect(res.status).toBe(204);
    });
  });

  describe('GET /v1/cognition/summary', () => {
    beforeAll(() => start(makeMockProvider()));
    afterAll(() => stop());

    it('returns 400 when the workspaceId query param is missing', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/summary`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(400);
    });

    it('returns the summary for a given workspaceId', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/summary?workspaceId=ws-1`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(200);
      expect(provider.summarizeCognition).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('GET /v1/cognition/health', () => {
    it('returns 200 with the health body when healthy', async () => {
      await start(makeMockProvider({ checkHealth: vi.fn().mockResolvedValue({ healthy: true }) }));
      const res = await fetch(`${baseUrl}/v1/cognition/health`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ healthy: true });
      await stop();
    });

    it('returns 503 with the real degradedReason when unhealthy (not swallowed)', async () => {
      await start(
        makeMockProvider({
          checkHealth: vi.fn().mockResolvedValue({ healthy: false, degradedReason: 'db unreachable' }),
        })
      );
      const res = await fetch(`${baseUrl}/v1/cognition/health`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ healthy: false, degradedReason: 'db unreachable' });
      await stop();
    });
  });

  describe('error mapping', () => {
    it('maps EntityNotFoundError to 404', async () => {
      await start(
        makeMockProvider({
          review: vi.fn().mockRejectedValue(new EntityNotFoundError('Learning', 'missing-id')),
        })
      );
      const res = await fetch(`${baseUrl}/v1/cognition/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'ws-1', entryId: 'missing-id', approved: true, reviewedBy: 'u1' }),
      });
      expect(res.status).toBe(404);
      await stop();
    });

    it('maps ValidationError to 400 with the field name', async () => {
      await start(
        makeMockProvider({
          review: vi.fn().mockRejectedValue(new ValidationError('entryId is invalid', 'entryId')),
        })
      );
      const res = await fetch(`${baseUrl}/v1/cognition/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'ws-1', entryId: 'bad', approved: true, reviewedBy: 'u1' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { field?: string };
      expect(body.field).toBe('entryId');
      await stop();
    });

    it('maps unexpected errors to 500 without leaking internals', async () => {
      await start(
        makeMockProvider({
          summarizeCognition: vi.fn().mockRejectedValue(new Error('unexpected db driver crash')),
        })
      );
      const res = await fetch(`${baseUrl}/v1/cognition/summary?workspaceId=ws-1`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('internal error');
      await stop();
    });
  });

  describe('POST /v1/knowledge/ingest (G-21, Architecture Verification Report P0)', () => {
    afterAll(() => stop());

    it('returns 501 when the server was not configured with a KnowledgeIngestPort', async () => {
      await start(makeMockProvider());
      const res = await fetch(`${baseUrl}/v1/knowledge/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: { ownerType: 'user', userId: 'u-1', assetType: 'playbook', title: 'Doc' } }),
      });
      expect(res.status).toBe(501);
    });

    it('returns 400 when asset is missing, without calling ingestKnowledgeAsset', async () => {
      const ingestKnowledgeAsset = vi.fn().mockResolvedValue('asset-1');
      await start(makeMockProvider(), { ingestKnowledgeAsset });
      const res = await fetch(`${baseUrl}/v1/knowledge/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawContent: 'some content' }),
      });
      expect(res.status).toBe(400);
      expect(ingestKnowledgeAsset).not.toHaveBeenCalled();
    });

    it('ingests the asset and returns the persisted assetId, 201', async () => {
      const ingestKnowledgeAsset = vi.fn().mockResolvedValue('asset-known-1');
      await start(makeMockProvider(), { ingestKnowledgeAsset });
      const body = {
        asset: { ownerType: 'workspace', workspaceId: 'ws-1', assetType: 'reference', title: 'Doc' },
        rawContent: 'some real content',
      };
      const res = await fetch(`${baseUrl}/v1/knowledge/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(201);
      // contribution is additive — null when the supplied KnowledgeIngestPort
      // (like this one) doesn't implement getKnowledgeAssetContribution.
      expect(await res.json()).toEqual({ assetId: 'asset-known-1', contribution: null });
      expect(ingestKnowledgeAsset).toHaveBeenCalledWith(body.asset, body.rawContent, undefined);
    });

    it('includes contribution in the response when the port implements getKnowledgeAssetContribution', async () => {
      const ingestKnowledgeAsset = vi.fn().mockResolvedValue('asset-known-2');
      const getKnowledgeAssetContribution = vi.fn().mockResolvedValue({ score: 71, isDuplicate: false });
      await start(makeMockProvider(), { ingestKnowledgeAsset, getKnowledgeAssetContribution });
      const body = {
        asset: { ownerType: 'workspace', workspaceId: 'ws-1', assetType: 'reference', title: 'Doc' },
        rawContent: 'some real content',
      };
      const res = await fetch(`${baseUrl}/v1/knowledge/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ assetId: 'asset-known-2', contribution: { score: 71, isDuplicate: false } });
      expect(getKnowledgeAssetContribution).toHaveBeenCalledWith('asset-known-2');
    });

    it('still returns 201 with contribution: null when getKnowledgeAssetContribution throws (non-fatal)', async () => {
      const ingestKnowledgeAsset = vi.fn().mockResolvedValue('asset-known-3');
      const getKnowledgeAssetContribution = vi.fn().mockRejectedValue(new Error('db unavailable'));
      await start(makeMockProvider(), { ingestKnowledgeAsset, getKnowledgeAssetContribution });
      const res = await fetch(`${baseUrl}/v1/knowledge/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: { ownerType: 'workspace', workspaceId: 'ws-1', assetType: 'reference', title: 'Doc' },
          rawContent: 'x',
        }),
      });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ assetId: 'asset-known-3', contribution: null });
    });

    it('produces a request-received and a request-completion log line (G-21 acceptance criterion)', async () => {
      const ingestKnowledgeAsset = vi.fn().mockResolvedValue('asset-known-2');
      await start(makeMockProvider(), { ingestKnowledgeAsset });
      const body = {
        asset: { ownerType: 'workspace', workspaceId: 'ws-1', assetType: 'reference', title: 'Doc' },
        rawContent: 'some real content',
      };
      await fetch(`${baseUrl}/v1/knowledge/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const infoCalls = serverLogger.info.mock.calls as [string, Record<string, unknown>][];
      const received = infoCalls.find(([msg]) => msg.includes('/v1/knowledge/ingest received'));
      const completed = infoCalls.find(([msg]) => msg.includes('/v1/knowledge/ingest complete'));

      expect(received).toBeDefined();
      expect(completed).toBeDefined();
      expect(completed?.[1]).toMatchObject({ status: 201, assetId: 'asset-known-2' });
      expect(typeof completed?.[1]['durationMs']).toBe('number');
    });
  });

  describe('POST /v1/workspace-configuration (ADR-003 §2.4, closes audit finding D-4)', () => {
    afterAll(() => stop());

    it('returns 501 when the server was not configured with ingestWorkspaceConfiguration', async () => {
      await start(makeMockProvider());
      const res = await fetch(`${baseUrl}/v1/workspace-configuration`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'ws-1', voiceConfiguration: { tone: 'playful' } }),
      });
      expect(res.status).toBe(501);
    });

    it('returns 400 when workspaceId is missing', async () => {
      const ingestWorkspaceConfiguration = vi.fn().mockResolvedValue('asset-1');
      await start(makeMockProvider(), { ingestKnowledgeAsset: vi.fn(), ingestWorkspaceConfiguration });
      const res = await fetch(`${baseUrl}/v1/workspace-configuration`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceConfiguration: { tone: 'playful' } }),
      });
      expect(res.status).toBe(400);
      expect(ingestWorkspaceConfiguration).not.toHaveBeenCalled();
    });

    it('ingests the configuration and returns the persisted assetId, 201', async () => {
      const ingestWorkspaceConfiguration = vi.fn().mockResolvedValue('asset-config-1');
      await start(makeMockProvider(), { ingestKnowledgeAsset: vi.fn(), ingestWorkspaceConfiguration });
      const body = { workspaceId: 'ws-1', identityConfiguration: { brandName: 'Acme' } };
      const res = await fetch(`${baseUrl}/v1/workspace-configuration`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ assetId: 'asset-config-1' });
      expect(ingestWorkspaceConfiguration).toHaveBeenCalledWith(body);
    });
  });

  describe('POST /v1/intelligence/feedback (Cognitive Platform Evolution Program, EM-3.1)', () => {
    afterAll(() => stop());

    it('returns 501 when the server was not configured with recordFeedbackEvent', async () => {
      await start(makeMockProvider());
      const res = await fetch(`${baseUrl}/v1/intelligence/feedback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'u-1', artifactId: 'a-1', artifactType: 'post', eventType: 'accepted' }),
      });
      expect(res.status).toBe(501);
    });

    it('returns 400 when userId, artifactId, or eventType is missing', async () => {
      const recordFeedbackEvent = vi.fn().mockResolvedValue(undefined);
      await start(makeMockProvider(), { ingestKnowledgeAsset: vi.fn(), recordFeedbackEvent });
      const res = await fetch(`${baseUrl}/v1/intelligence/feedback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId: 'a-1', eventType: 'accepted' }),
      });
      expect(res.status).toBe(400);
      expect(recordFeedbackEvent).not.toHaveBeenCalled();
    });

    it('records the feedback event and returns 204', async () => {
      const recordFeedbackEvent = vi.fn().mockResolvedValue(undefined);
      await start(makeMockProvider(), { ingestKnowledgeAsset: vi.fn(), recordFeedbackEvent });
      const body = { userId: 'u-1', artifactId: 'a-1', artifactType: 'post', eventType: 'edited' };
      const res = await fetch(`${baseUrl}/v1/intelligence/feedback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(204);
      expect(recordFeedbackEvent).toHaveBeenCalledWith(body);
    });
  });

  describe('POST /v1/intelligence/correction (Cognitive Platform Evolution Program, EM-3.3)', () => {
    afterAll(() => stop());

    it('returns 501 when the server was not configured with recordCorrection', async () => {
      await start(makeMockProvider());
      const res = await fetch(`${baseUrl}/v1/intelligence/correction`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'u-1', correctionType: 'tone', correctedValue: 'more formal' }),
      });
      expect(res.status).toBe(501);
    });

    it('returns 400 when userId or correctionType is missing', async () => {
      const recordCorrection = vi.fn().mockResolvedValue(undefined);
      await start(makeMockProvider(), { ingestKnowledgeAsset: vi.fn(), recordCorrection });
      const res = await fetch(`${baseUrl}/v1/intelligence/correction`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctedValue: 'more formal' }),
      });
      expect(res.status).toBe(400);
      expect(recordCorrection).not.toHaveBeenCalled();
    });

    it('records the correction and returns 204', async () => {
      const recordCorrection = vi.fn().mockResolvedValue(undefined);
      await start(makeMockProvider(), { ingestKnowledgeAsset: vi.fn(), recordCorrection });
      const body = { userId: 'u-1', correctionType: 'vocabulary' as const, correctedValue: 'synergy -> alignment' };
      const res = await fetch(`${baseUrl}/v1/intelligence/correction`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(204);
      expect(recordCorrection).toHaveBeenCalledWith(body);
    });
  });

  describe('unknown routes', () => {
    beforeAll(() => start(makeMockProvider()));
    afterAll(() => stop());

    it('returns 404 for an unrecognized path', async () => {
      const res = await fetch(`${baseUrl}/v1/cognition/does-not-exist`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(404);
    });
  });
});
