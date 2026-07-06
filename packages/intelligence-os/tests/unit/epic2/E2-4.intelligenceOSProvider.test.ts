/**
 * E2-4.intelligenceOSProvider.test.ts
 *
 * Epic 2 (Platform Publication) — E2-4-T1.
 *
 * IntelligenceOSProvider is a thin delegation adapter: every method should
 * call straight through to the wrapped IntelligenceOS instance with the
 * same arguments, and return exactly what IntelligenceOS returns. These
 * tests verify the delegation contract method-by-method, plus the two
 * construction paths (wrap an existing instance, or build one via
 * fromConfig) and the public surface re-export from index.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { IntelligenceOS } from '../../../src/IntelligenceOS';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import { IntelligenceOSProvider } from '../../../src/compat/IntelligenceOSProvider';
import type { IIntelligenceProvider } from '../../../src/IIntelligenceProvider';
import * as publicSurface from '../../../src/index';
import type { ArtifactRequest, FeedbackEvent } from '@intelligence-os/shared-types';

// ── Minimal Supabase mock (same chain shape as tests/integration/intelligence-os.test.ts) ──

function createMockSupabase() {
  const chain = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    in:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    upsert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single:      vi.fn().mockResolvedValue({ data: { id: 'mock-uuid' }, error: null }),
    then: vi.fn().mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null })),
    ),
  };
  const fromMock = vi.fn().mockReturnValue(chain);
  const schemaMock = vi.fn().mockReturnValue({ from: fromMock });
  return { schema: schemaMock } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

function makeProvider() {
  const supabase = createMockSupabase();
  const intelligenceOS = new IntelligenceOS({ supabase, eventBus: new InProcessEventBus() });
  const provider = new IntelligenceOSProvider(intelligenceOS);
  return { provider, intelligenceOS };
}

describe('IntelligenceOSProvider — construction', () => {
  it('wraps an existing IntelligenceOS instance', () => {
    const { provider, intelligenceOS } = makeProvider();
    expect(provider.underlying).toBe(intelligenceOS);
  });

  it('fromConfig() builds its own IntelligenceOS internally', () => {
    const provider = IntelligenceOSProvider.fromConfig({ supabase: createMockSupabase() });
    expect(provider.underlying).toBeInstanceOf(IntelligenceOS);
  });

  it('is structurally assignable to IIntelligenceProvider', () => {
    const { provider } = makeProvider();
    const asInterface: IIntelligenceProvider = provider;
    expect(asInterface).toBeDefined();
  });

  it('IntelligenceOS itself is also assignable to IIntelligenceProvider (it implements the interface directly)', () => {
    const { intelligenceOS } = makeProvider();
    const asInterface: IIntelligenceProvider = intelligenceOS;
    expect(asInterface).toBeDefined();
  });
});

describe('IntelligenceOSProvider — public surface (index.ts)', () => {
  it('exports IntelligenceOSProvider', () => {
    expect(publicSurface.IntelligenceOSProvider).toBe(IntelligenceOSProvider);
  });
});

describe('IntelligenceOSProvider — delegation', () => {
  const REQUEST: ArtifactRequest = { userId: 'u1', artifactType: 'board_update' };
  const FEEDBACK: FeedbackEvent = {
    userId: 'u1', artifactId: 'art-1', artifactType: 'board_update',
    blueprintId: 'bp-1', eventType: 'edited',
  };

  it('buildBlueprint() delegates with the same request and returns the same result', async () => {
    const { provider, intelligenceOS } = makeProvider();
    const expected = { id: 'bp-x' } as any;
    const spy = vi.spyOn(intelligenceOS, 'buildBlueprint').mockResolvedValue(expected);
    const result = await provider.buildBlueprint(REQUEST);
    expect(spy).toHaveBeenCalledWith(REQUEST);
    expect(result).toBe(expected);
  });

  it('recordFeedbackEvent() delegates with the same event', async () => {
    const { provider, intelligenceOS } = makeProvider();
    const spy = vi.spyOn(intelligenceOS, 'recordFeedbackEvent').mockResolvedValue(undefined);
    await provider.recordFeedbackEvent(FEEDBACK);
    expect(spy).toHaveBeenCalledWith(FEEDBACK);
  });

  it('ingestKnowledgeAsset() delegates with asset and rawContent, defaulting rawContent to \'\'', async () => {
    const { provider, intelligenceOS } = makeProvider();
    const spy = vi.spyOn(intelligenceOS, 'ingestKnowledgeAsset').mockResolvedValue('asset-1');
    const asset = { userId: 'u1', ownerType: 'user', assetType: 'document', title: 'T' } as any;

    const id1 = await provider.ingestKnowledgeAsset(asset, 'raw text');
    expect(spy).toHaveBeenLastCalledWith(asset, 'raw text');
    expect(id1).toBe('asset-1');

    await provider.ingestKnowledgeAsset(asset);
    expect(spy).toHaveBeenLastCalledWith(asset, '');
  });

  it('upsertProject() delegates with the same input and returns the same id', async () => {
    const { provider, intelligenceOS } = makeProvider();
    const spy = vi.spyOn(intelligenceOS, 'upsertProject').mockResolvedValue('proj-1');
    const input = { userId: 'u1', name: 'Project' } as any;
    const id = await provider.upsertProject(input);
    expect(spy).toHaveBeenCalledWith(input);
    expect(id).toBe('proj-1');
  });

  it('reviewLearning() delegates with all four arguments', async () => {
    const { provider, intelligenceOS } = makeProvider();
    const spy = vi.spyOn(intelligenceOS, 'reviewLearning').mockResolvedValue(undefined);
    await provider.reviewLearning('u1', 'learn-1', true, 'reviewer-1');
    expect(spy).toHaveBeenCalledWith('u1', 'learn-1', true, 'reviewer-1');
  });

  it('getBrandSummary() delegates with the same params and returns the same result', async () => {
    const { provider, intelligenceOS } = makeProvider();
    const expected = { compositeConfidence: 0.5 } as any;
    const spy = vi.spyOn(intelligenceOS, 'getBrandSummary').mockResolvedValue(expected);
    const params = { userId: 'u1', workspaceId: 'ws-1' };
    const result = await provider.getBrandSummary(params);
    expect(spy).toHaveBeenCalledWith(params);
    expect(result).toBe(expected);
  });
});
