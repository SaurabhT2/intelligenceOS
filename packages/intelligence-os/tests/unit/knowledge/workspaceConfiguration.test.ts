/**
 * workspaceConfiguration.test.ts
 *
 * ADR-003 (Subject-Centric Intelligence) §2.4 — tests for
 * `KnowledgeIntelligenceDomain.upsertWorkspaceConfiguration()`, the narrow
 * explicit-ingestion path for admin-declared workspace voice/compliance
 * configuration (see `types/domains.ts`'s `WorkspaceConfigurationInput` and
 * `context/ContextBuilder.ts` for how the result is consumed).
 */

import { describe, it, expect, vi } from 'vitest';
import { KnowledgeIntelligenceDomain } from '../../../src/domains/KnowledgeIntelligenceDomain';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A minimal, purpose-built Supabase mock: `.eq()` chains resolve as a
 * thenable list query (`getAssets()`'s path); `.upsert().select().single()`
 * resolves to a single persisted row (`persistExtracted()`'s path).
 */
function makeSupabaseMock(existingAssets: Record<string, unknown>[], persistedRow: Record<string, unknown>) {
  const listPromise = Promise.resolve({ data: existingAssets, error: null });
  const listChain = Object.assign(listPromise, {
    eq: vi.fn(() => listChain),
  });

  const singleChain = {
    single: vi.fn().mockResolvedValue({ data: persistedRow, error: null }),
  };

  const upsertReturn = {
    select: vi.fn(() => singleChain),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertMock = vi.fn((_row: any, _opts?: unknown) => upsertReturn);

  const fromChain = {
    select: vi.fn(() => listChain),
    upsert: upsertMock,
  };

  const client = {
    schema: vi.fn(() => ({ from: vi.fn(() => fromChain) })),
  };

  return { client: client as unknown as SupabaseClient, upsertChain: upsertMock };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-config-1',
    owner_type: 'workspace',
    user_id: null,
    project_id: null,
    workspace_id: 'ws-1',
    asset_type: 'reference',
    title: 'Explicit workspace configuration',
    source_file_ref: null,
    extracted_vocabulary: null,
    extracted_patterns: null,
    extracted_frameworks: { voiceConfiguration: { tone: 'playful' } },
    extracted_visual_features: null,
    confidence: 1.0,
    version: 1,
    is_current: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('KnowledgeIntelligenceDomain.upsertWorkspaceConfiguration() (ADR-003 §2.4)', () => {
  it('persists voice configuration and compliance constraints as a workspace KnowledgeAsset', async () => {
    const persistedRow = makeRow();
    const { client, upsertChain } = makeSupabaseMock([], persistedRow);
    const domain = new KnowledgeIntelligenceDomain(client);

    const id = await domain.upsertWorkspaceConfiguration({
      workspaceId: 'ws-1',
      voiceConfiguration: { tone: 'playful', bannedPhrases: ['synergy'] },
      complianceConstraints: [{ rule: 'no-superlatives' }],
    });

    expect(id).toBe('asset-config-1');
    const [payload] = upsertChain.mock.calls[0]!;
    expect(payload.owner_type).toBe('workspace');
    expect(payload.asset_type).toBe('reference');
    expect(payload.workspace_id).toBe('ws-1');
    expect(payload.confidence).toBe(1.0);
    expect(payload.extracted_frameworks.voiceConfiguration).toEqual({ tone: 'playful', bannedPhrases: ['synergy'] });
    expect(payload.extracted_frameworks.complianceConstraints).toEqual([{ rule: 'no-superlatives' }]);
  });

  it('reuses the existing current configuration asset id and increments its version, rather than creating a new row', async () => {
    const existing = makeRow({ id: 'existing-config-id', version: 3 });
    const persistedRow = makeRow({ id: 'existing-config-id', version: 4 });
    const { client, upsertChain } = makeSupabaseMock([existing], persistedRow);
    const domain = new KnowledgeIntelligenceDomain(client);

    const id = await domain.upsertWorkspaceConfiguration({
      workspaceId: 'ws-1',
      voiceConfiguration: { tone: 'formal' },
    });

    expect(id).toBe('existing-config-id');
    const [payload] = upsertChain.mock.calls[0]!;
    expect(payload.id).toBe('existing-config-id');
    expect(payload.version).toBe(4);
  });

  it('does not include complianceConstraints in the payload when none are given', async () => {
    const persistedRow = makeRow();
    const { client, upsertChain } = makeSupabaseMock([], persistedRow);
    const domain = new KnowledgeIntelligenceDomain(client);

    await domain.upsertWorkspaceConfiguration({ workspaceId: 'ws-1', voiceConfiguration: { tone: 'playful' } });

    const [payload] = upsertChain.mock.calls[0]!;
    expect(payload.extracted_frameworks.complianceConstraints).toBeUndefined();
  });

  it('D-3 closure: persists explicit identity configuration alongside voice configuration', async () => {
    const persistedRow = makeRow();
    const { client, upsertChain } = makeSupabaseMock([], persistedRow);
    const domain = new KnowledgeIntelligenceDomain(client);

    await domain.upsertWorkspaceConfiguration({
      workspaceId: 'ws-1',
      identityConfiguration: { brandName: 'Acme', preferredLength: 'short' },
    });

    const [payload] = upsertChain.mock.calls[0]!;
    expect(payload.extracted_frameworks.identityConfiguration).toEqual({
      brandName: 'Acme',
      preferredLength: 'short',
    });
  });

  it('does not include identityConfiguration in the payload when none is given', async () => {
    const persistedRow = makeRow();
    const { client, upsertChain } = makeSupabaseMock([], persistedRow);
    const domain = new KnowledgeIntelligenceDomain(client);

    await domain.upsertWorkspaceConfiguration({ workspaceId: 'ws-1', voiceConfiguration: { tone: 'playful' } });

    const [payload] = upsertChain.mock.calls[0]!;
    expect(payload.extracted_frameworks.identityConfiguration).toBeUndefined();
  });
});
