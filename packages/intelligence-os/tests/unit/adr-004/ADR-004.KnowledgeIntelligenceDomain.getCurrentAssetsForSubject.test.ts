/**
 * ADR-004.KnowledgeIntelligenceDomain.getCurrentAssetsForSubject.test.ts
 *
 * ADR-004 (Cognitive Consolidation) §2.1 — the Subject-generic Knowledge
 * read `ProfileBuilder.rebuildForSubject()` uses. Tests delegation to the
 * real `getAssets()` (no duplicated query logic) with the correct filter
 * mapping for each Subject type.
 */

import { describe, it, expect, vi } from 'vitest';
import { KnowledgeIntelligenceDomain } from '../../../src/domains/KnowledgeIntelligenceDomain';
import { userSubject, workspaceSubject } from '../../../src/types/subject';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('KnowledgeIntelligenceDomain.getCurrentAssetsForSubject()', () => {
  it('delegates to getAssets() with ownerType/userId/isCurrent for a User subject', async () => {
    const domain = new KnowledgeIntelligenceDomain({} as unknown as SupabaseClient);
    const spy = vi.spyOn(domain, 'getAssets').mockResolvedValue([]);

    await domain.getCurrentAssetsForSubject(userSubject('u1'));

    expect(spy).toHaveBeenCalledWith({
      ownerType: 'user',
      userId: 'u1',
      workspaceId: undefined,
      isCurrent: true,
    });
  });

  it('delegates to getAssets() with ownerType/workspaceId/isCurrent for a Workspace subject', async () => {
    const domain = new KnowledgeIntelligenceDomain({} as unknown as SupabaseClient);
    const spy = vi.spyOn(domain, 'getAssets').mockResolvedValue([]);

    await domain.getCurrentAssetsForSubject(workspaceSubject('ws-1'));

    expect(spy).toHaveBeenCalledWith({
      ownerType: 'workspace',
      userId: undefined,
      workspaceId: 'ws-1',
      isCurrent: true,
    });
  });

  it('returns whatever getAssets() resolves to, unmodified', async () => {
    const domain = new KnowledgeIntelligenceDomain({} as unknown as SupabaseClient);
    const fakeAssets = [{ id: 'a1' }] as never;
    vi.spyOn(domain, 'getAssets').mockResolvedValue(fakeAssets);

    const result = await domain.getCurrentAssetsForSubject(userSubject('u1'));

    expect(result).toBe(fakeAssets);
  });
});
