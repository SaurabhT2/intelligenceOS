/**
 * M2-domain.getContext.test.ts
 *
 * ADR-003 (Subject-Centric Intelligence) §2.3/§2.4 — direct unit coverage
 * of `WorkspaceIntelligenceDomain.getContext()`'s real read logic (as
 * opposed to `M2-context.ContextBuilder.test.ts`, which exercises
 * `ContextBuilder` against a fully mocked `WorkspaceIntelligenceDomain`
 * and never runs this parsing code). Added during the Completion Mission
 * session alongside the `identityConfiguration` read this method gained,
 * closing audit finding D-3.
 */

import { describe, it, expect, vi } from 'vitest';
import { WorkspaceIntelligenceDomain } from '../../../src/domains/WorkspaceIntelligenceDomain';
import type { SupabaseClient } from '@supabase/supabase-js';

function makeSupabaseMock(rows: Record<string, unknown>[]) {
  const query = Promise.resolve({ data: rows, error: null });
  const chain = Object.assign(query, { eq: vi.fn(() => chain) });
  const fromChain = { select: vi.fn(() => chain) };
  const client = { schema: vi.fn(() => ({ from: vi.fn(() => fromChain) })) };
  return client as unknown as SupabaseClient;
}

function makeAssetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-1',
    asset_type: 'reference',
    title: 'Explicit workspace configuration',
    extracted_frameworks: null,
    confidence: 1.0,
    ...overrides,
  };
}

describe('WorkspaceIntelligenceDomain.getContext()', () => {
  it('returns null complianceConstraints/voiceConfiguration/identityConfiguration when no workspace knowledge assets exist', async () => {
    const domain = new WorkspaceIntelligenceDomain(makeSupabaseMock([]));

    const context = await domain.getContext('ws-1');

    expect(context).toEqual({
      workspaceId: 'ws-1',
      complianceConstraints: [],
      voiceConfiguration: null,
      identityConfiguration: null,
    });
  });

  it('D-3 closure: reads identityConfiguration from extracted_frameworks the same way it already reads voiceConfiguration', async () => {
    const domain = new WorkspaceIntelligenceDomain(
      makeSupabaseMock([
        makeAssetRow({
          extracted_frameworks: {
            voiceConfiguration: { tone: 'playful' },
            identityConfiguration: { brandName: 'Acme', namedFrameworks: ['JTBD'] },
          },
        }),
      ]),
    );

    const context = await domain.getContext('ws-1');

    expect(context.voiceConfiguration).toEqual({ tone: 'playful' });
    expect(context.identityConfiguration).toEqual({ brandName: 'Acme', namedFrameworks: ['JTBD'] });
  });

  it('picks the highest-confidence identityConfiguration when more than one workspace asset declares one', async () => {
    const domain = new WorkspaceIntelligenceDomain(
      makeSupabaseMock([
        makeAssetRow({ id: 'a', confidence: 0.6, extracted_frameworks: { identityConfiguration: { brandName: 'Low' } } }),
        makeAssetRow({ id: 'b', confidence: 0.95, extracted_frameworks: { identityConfiguration: { brandName: 'High' } } }),
      ]),
    );

    const context = await domain.getContext('ws-1');

    expect(context.identityConfiguration).toEqual({ brandName: 'High' });
  });

  it('ignores ordinary document-extracted frameworks (no complianceConstraints/voiceConfiguration/identityConfiguration keys) — a known, documented remaining gap (audit D-5), not something this test asserts is fixed', async () => {
    const domain = new WorkspaceIntelligenceDomain(
      makeSupabaseMock([
        makeAssetRow({ extracted_frameworks: { frameworks: [{ name: 'Some Framework' }], frameworkCount: 1 } }),
      ]),
    );

    const context = await domain.getContext('ws-1');

    expect(context.voiceConfiguration).toBeNull();
    expect(context.identityConfiguration).toBeNull();
    expect(context.complianceConstraints).toEqual([]);
  });
});
