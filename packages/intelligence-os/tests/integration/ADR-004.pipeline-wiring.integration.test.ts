/**
 * ADR-004.pipeline-wiring.integration.test.ts
 *
 * ADR-004 (Cognitive Consolidation) §3.2, §13 — end-to-end wiring test:
 * `ingestKnowledgeAsset()` → extraction → `intelligence.signal.extracted`
 * → `FeedbackProcessor.processKnowledgeExtraction()` →
 * `ProfileBuilder.rebuildForSubject()` → `UserIntelligenceDomain.upsertProfile()`.
 *
 * Verifies the full chain actually connects through `IntelligenceOS`'s real
 * construction-time wiring (not a hand-assembled subset of classes) — the
 * one thing the focused unit tests elsewhere in `tests/unit/adr-004/`
 * cannot verify on their own. Uses the same coarse, uniform Supabase mock
 * `tests/integration/intelligence-os.test.ts` already establishes for this
 * class of "does the wiring actually connect" test — data-level
 * correctness (dedup, tie-break, confidence ceilings) is covered
 * exhaustively by the unit tests instead.
 */

import { describe, it, expect, vi } from 'vitest';
import { IntelligenceOS } from '../../src/IntelligenceOS';
import { InProcessEventBus } from '../../src/events/IntelligenceEventBus';

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
  return { schema: schemaMock, _chain: chain, _from: fromMock };
}

describe('ADR-004 end-to-end: knowledge upload triggers a profile rebuild', () => {
  it('ingestKnowledgeAsset() eventually causes UserIntelligenceDomain.upsertProfile() to be called', async () => {
    const supabase = createMockSupabase();
    const bus = new InProcessEventBus();
    const intelligenceOS = new IntelligenceOS({
      supabase: supabase as unknown as import('@supabase/supabase-js').SupabaseClient,
      eventBus: bus,
    });

    let upsertProfileCalled = false;
    let extractionEventSeen = false;
    let rebuildAttempted = false;

    bus.on('intelligence.signal.extracted', async (payload) => {
      const p = payload as { entityType?: string };
      if (p.entityType === 'knowledge_asset') extractionEventSeen = true;
    });
    bus.on('intelligence.profile.updated', async () => {
      rebuildAttempted = true;
    });

    // Detect the upsert specifically on the profiles table by watching
    // every from() call's table argument.
    supabase._from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        supabase._chain.upsert.mockImplementation(() => {
          upsertProfileCalled = true;
          return supabase._chain;
        });
      }
      return supabase._chain;
    });

    await intelligenceOS.ingestKnowledgeAsset({
      ownerType: 'workspace',
      workspaceId: 'ws-1',
      userId: null,
      projectId: null,
      assetType: 'reference',
      title: 'Strategy doc',
    } as never, 'Some raw content about Jobs to be Done.');

    // The chain above is entirely event-driven (KnowledgeProcessor.process()
    // emits intelligence.signal.extracted asynchronously after extraction;
    // FeedbackProcessor's handler is itself async). Flush the microtask
    // queue so both handlers complete before asserting.
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(extractionEventSeen).toBe(true);
    expect(rebuildAttempted).toBe(true);
    expect(upsertProfileCalled).toBe(true);
  });
});
