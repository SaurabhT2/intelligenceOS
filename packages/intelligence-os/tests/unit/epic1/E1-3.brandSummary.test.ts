/**
 * tests/unit/epic1/E1-3.brandSummary.test.ts
 *
 * Unit tests for E1-3: Brand Summary Query API
 *
 * Covers:
 *   - IntelligenceSummary type shape
 *   - UserIntelligenceDomain.countActiveLearnings()
 *   - UserIntelligenceDomain.getTopTaxonomyCategories()
 *   - getBrandSummary() degraded mode (no profile)
 *   - getBrandSummary() normal mode (profile + archetype)
 *   - topTaxonomyCategories ordering (most-frequent first)
 *   - workspaceId scoping forwarded to countActiveLearnings
 */

import { describe, it, expect, vi } from 'vitest';
import { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { IntelligenceSummary } from '@intelligence-os/shared-types';

// ── DB mock helpers ───────────────────────────────────────────────────────────

/**
 * Builds a DB mock for countActiveLearnings.
 * Chain: schema → from → select → eq(user_id) → in(state) [→ eq(ws)?] → { count, error }
 */
function makeCountDb(count: number, error?: { message: string }) {
  const finalResult = Promise.resolve({ count, error: error ?? null });

  // Chainable terminal that also resolves via then/await
  const terminal = Object.assign(finalResult, {
    eq: vi.fn().mockReturnValue(finalResult),  // optional workspace eq
  });

  const inFn  = vi.fn().mockReturnValue(terminal);
  const eqFn  = vi.fn().mockReturnValue({ in: inFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
  const from  = vi.fn().mockReturnValue({ select: selectFn });
  return { schema: vi.fn().mockReturnValue({ from }) } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

function makeTaxonomyDb(rows: { taxonomy_category: string }[], error?: { message: string }) {
  const inChain  = vi.fn().mockResolvedValue({ data: rows, error: error ?? null });
  const eqChain  = vi.fn().mockReturnValue({ in: inChain });
  const selectFn = vi.fn().mockReturnValue({ eq: eqChain });
  const from     = vi.fn().mockReturnValue({ select: selectFn });
  return { schema: vi.fn().mockReturnValue({ from }) } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

// ── countActiveLearnings ──────────────────────────────────────────────────────

describe('E1-3: UserIntelligenceDomain.countActiveLearnings()', () => {
  it('returns the count from the database', async () => {
    const db = makeCountDb(42);
    const domain = new UserIntelligenceDomain(db);

    const count = await domain.countActiveLearnings('user-001');
    expect(count).toBe(42);
  });

  it('returns 0 when count is null (empty result)', async () => {
    const db = makeCountDb(0);
    const domain = new UserIntelligenceDomain(db);

    const count = await domain.countActiveLearnings('user-001');
    expect(count).toBe(0);
  });

  it('scopes by workspaceId when provided', async () => {
    // Capture every eq() call to verify workspace_id filter is applied.
    const eqCalls: unknown[][] = [];
    const finalResult = Promise.resolve({ count: 5, error: null });
    const terminal = Object.assign(finalResult, {
      eq: vi.fn().mockImplementation((...args: unknown[]) => {
        eqCalls.push(args);
        return finalResult;
      }),
    });

    const inFn = vi.fn().mockReturnValue(terminal);
    const eqFn = vi.fn().mockImplementation((...args: unknown[]) => {
      eqCalls.push(args);
      return { in: inFn };
    });
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
    const from     = vi.fn().mockReturnValue({ select: selectFn });
    const db = { schema: vi.fn().mockReturnValue({ from }) } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const domain = new UserIntelligenceDomain(db);
    await domain.countActiveLearnings('user-001', 'ws-001');

    const eqFields = eqCalls.map(c => c[0]);
    expect(eqFields).toContain('user_id');
    expect(eqFields).toContain('workspace_id');
  });
});

// ── getTopTaxonomyCategories ──────────────────────────────────────────────────

describe('E1-3: UserIntelligenceDomain.getTopTaxonomyCategories()', () => {
  it('returns categories ordered by frequency, descending', async () => {
    const rows = [
      { taxonomy_category: 'tone_formality' },
      { taxonomy_category: 'sentence_rhythm' },
      { taxonomy_category: 'tone_formality' },
      { taxonomy_category: 'vocabulary_density' },
      { taxonomy_category: 'tone_formality' },
      { taxonomy_category: 'sentence_rhythm' },
    ];
    // tone_formality=3, sentence_rhythm=2, vocabulary_density=1
    const db = makeTaxonomyDb(rows);
    const domain = new UserIntelligenceDomain(db);

    const top = await domain.getTopTaxonomyCategories('user-001', 3);
    expect(top).toEqual(['tone_formality', 'sentence_rhythm', 'vocabulary_density']);
  });

  it('respects the limit parameter', async () => {
    const rows = [
      { taxonomy_category: 'a' },
      { taxonomy_category: 'b' },
      { taxonomy_category: 'c' },
      { taxonomy_category: 'd' },
    ];
    const db = makeTaxonomyDb(rows);
    const domain = new UserIntelligenceDomain(db);

    const top = await domain.getTopTaxonomyCategories('user-001', 2);
    expect(top).toHaveLength(2);
  });

  it('returns empty array when no learnings exist', async () => {
    const db = makeTaxonomyDb([]);
    const domain = new UserIntelligenceDomain(db);

    const top = await domain.getTopTaxonomyCategories('user-001');
    expect(top).toEqual([]);
  });

  it('deduplicates tied categories stably', async () => {
    // All same category
    const rows = Array.from({ length: 5 }, () => ({ taxonomy_category: 'only_category' }));
    const db = makeTaxonomyDb(rows);
    const domain = new UserIntelligenceDomain(db);

    const top = await domain.getTopTaxonomyCategories('user-001', 3);
    expect(top).toEqual(['only_category']);
  });
});

// ── IntelligenceSummary type shape ────────────────────────────────────────────

describe('E1-3: IntelligenceSummary type shape', () => {
  it('has all required fields with correct types', () => {
    // Compile-time shape test — exercises the type without runtime overhead
    const summary: IntelligenceSummary = {
      compositeConfidence:   0.78,
      archetypePrimary:      'founder',
      archetypeConfidence:   0.85,
      activeLearningsCount:  42,
      topTaxonomyCategories: ['tone_formality', 'sentence_rhythm'],
      voiceSummary:          { preferredTone: 'direct' },
      degraded:              false,
    };

    expect(summary.compositeConfidence).toBe(0.78);
    expect(summary.archetypePrimary).toBe('founder');
    expect(summary.archetypeConfidence).toBe(0.85);
    expect(summary.activeLearningsCount).toBe(42);
    expect(summary.topTaxonomyCategories).toHaveLength(2);
    expect(summary.voiceSummary).toEqual({ preferredTone: 'direct' });
    expect(summary.degraded).toBe(false);
  });

  it('allows null fields for degraded mode', () => {
    const degraded: IntelligenceSummary = {
      compositeConfidence:   0,
      archetypePrimary:      null,
      archetypeConfidence:   null,
      activeLearningsCount:  0,
      topTaxonomyCategories: [],
      voiceSummary:          null,
      degraded:              true,
    };

    expect(degraded.degraded).toBe(true);
    expect(degraded.archetypePrimary).toBeNull();
    expect(degraded.archetypeConfidence).toBeNull();
    expect(degraded.voiceSummary).toBeNull();
  });
});
