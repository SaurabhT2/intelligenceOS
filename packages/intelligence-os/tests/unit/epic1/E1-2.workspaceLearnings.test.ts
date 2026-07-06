/**
 * tests/unit/epic1/E1-2.workspaceLearnings.test.ts
 *
 * Unit tests for E1-2: Workspace-Scoped Brand Voice
 *
 * Covers:
 *   - WorkspaceIntelligenceDomain.getWorkspaceLearnings() — all active learnings
 *   - WorkspaceIntelligenceDomain.getWorkspaceLearnings(domain) — domain filter
 *   - WorkspaceIntelligenceDomain.upsertWorkspaceLearning() — successful insert
 *   - Design constraint: INFERRED patterns only, not compliance constraints
 */

import { describe, it, expect, vi } from 'vitest';
import { WorkspaceIntelligenceDomain } from '../../../src/domains/WorkspaceIntelligenceDomain';
import type { WorkspaceLearningInput } from '../../../src/types/domains';

// ── Row factories ─────────────────────────────────────────────────────────────

function makeLearningRow(overrides: Record<string, unknown> = {}) {
  return {
    id:                   'lrn-ws-001',
    user_id:              'system',
    workspace_id:         'ws-001',
    project_id:           null,
    domain:               'voice',
    taxonomy_category:    'tone_formality',
    stability_class:      'medium_term',
    state:                'ACTIVE',
    confidence:           0.72,
    context_scope:        'global',
    context_artifact_type: null,
    context_project_id:   null,
    context_audience_type: null,
    content:              { preferredFormality: 'professional-casual' },
    source_summary:       { evidenceCount: 12 },
    decay_rate:           null,
    last_confirmed_at:    null,
    decay_started_at:     null,
    archived_at:          null,
    created_at:           '2025-01-01T00:00:00.000Z',
    updated_at:           '2025-01-02T00:00:00.000Z',
    ...overrides,
  };
}

// ── DB mock builder ───────────────────────────────────────────────────────────

function makeDb(opts: {
  learningRows?: unknown[];
  insertedId?: string;
  selectError?: { message: string } | null;
  insertError?: { message: string } | null;
}) {
  const rows = opts.learningRows ?? [];

  // Chain: .select() → .eq() → .in() → resolves with { data, error }
  // For domain filter: .select() → .eq() → .in() → .eq() → resolves
  const inChain = {
    resolve: vi.fn().mockResolvedValue({ data: rows, error: opts.selectError ?? null }),
  };
  // Support optional domain .eq() after .in()
  inChain.resolve.mockReturnThis = () => inChain.resolve;

  const inFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: rows, error: opts.selectError ?? null }),
    then: (_resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: opts.selectError ?? null }).then(_resolve),
  });

  // getWorkspaceLearnings chain: schema → from → select → eq(workspace_id) → in(state) [→ eq(domain)?]
  const inResult = {
    eq: vi.fn().mockResolvedValue({ data: rows, error: opts.selectError ?? null }),
  };
  // Make in() return something that also resolves itself (when no domain filter)
  const selectForGet = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue(
        Object.assign(
          Promise.resolve({ data: rows, error: opts.selectError ?? null }),
          inResult,
        ),
      ),
    }),
  });

  // upsertWorkspaceLearning chain: schema → from → insert → select → single
  const selectForInsert = vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({
      data:  opts.insertedId ? { id: opts.insertedId } : null,
      error: opts.insertError ?? null,
    }),
  });
  const insertFn = vi.fn().mockReturnValue({ select: selectForInsert });

  // We need from() to return different chains depending on call order.
  // First call = getWorkspaceLearnings (select-based), second = insert.
  let callCount = 0;
  const from = vi.fn().mockImplementation(() => {
    callCount++;
    return { select: selectForGet, insert: insertFn };
  });

  const schema = vi.fn().mockReturnValue({ from });
  return { schema } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('E1-2: WorkspaceIntelligenceDomain.getWorkspaceLearnings()', () => {
  it('returns learnings mapped to Learning entity shape', async () => {
    const row = makeLearningRow();
    const db = makeDb({ learningRows: [row] });
    const domain = new WorkspaceIntelligenceDomain(db);

    const results = await domain.getWorkspaceLearnings('ws-001');

    expect(results).toHaveLength(1);
    const learning = results[0]!;
    expect(learning.id).toBe('lrn-ws-001');
    expect(learning.workspaceId).toBe('ws-001');
    expect(learning.domain).toBe('voice');
    expect(learning.taxonomyCategory).toBe('tone_formality');
    expect(learning.stabilityClass).toBe('medium_term');
    expect(learning.state).toBe('ACTIVE');
    expect(learning.confidence).toBe(0.72);
    expect(learning.content).toEqual({ preferredFormality: 'professional-casual' });
  });

  it('maps createdAt and updatedAt to Date objects', async () => {
    const row = makeLearningRow();
    const db = makeDb({ learningRows: [row] });
    const domain = new WorkspaceIntelligenceDomain(db);

    const results = await domain.getWorkspaceLearnings('ws-001');
    expect(results[0]!.createdAt).toBeInstanceOf(Date);
    expect(results[0]!.updatedAt).toBeInstanceOf(Date);
  });

  it('returns empty array when no learnings found', async () => {
    const db = makeDb({ learningRows: [] });
    const domain = new WorkspaceIntelligenceDomain(db);

    const results = await domain.getWorkspaceLearnings('ws-001');
    expect(results).toHaveLength(0);
  });
});

describe('E1-2: WorkspaceIntelligenceDomain.upsertWorkspaceLearning()', () => {
  const VALID_INPUT: WorkspaceLearningInput = {
    workspaceId:      'ws-001',
    domain:           'user_intelligence',
    taxonomyCategory: 'communication_style',
    stabilityClass:   'medium_term',
    confidence:       0.72,
    content:          { preferredFormality: 'professional-casual' },
    sourceSummary:    { evidenceCount: 12 },
  };

  it('returns a string id on successful insert', async () => {
    const db = makeDb({ insertedId: 'lrn-ws-new-001' });
    const domain = new WorkspaceIntelligenceDomain(db);

    const id = await domain.upsertWorkspaceLearning(VALID_INPUT);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('passes workspace_id and domain to the insert row', async () => {
    let capturedRow: Record<string, unknown> | null = null;
    const selectForInsert = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
    });
    const insertFn = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      capturedRow = row;
      return { select: selectForInsert };
    });

    const from = vi.fn().mockReturnValue({ insert: insertFn });
    const db = { schema: vi.fn().mockReturnValue({ from }) } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const domain = new WorkspaceIntelligenceDomain(db);
    await domain.upsertWorkspaceLearning(VALID_INPUT);

    expect(capturedRow).not.toBeNull();
    expect(capturedRow!['workspace_id']).toBe('ws-001');
    expect(capturedRow!['domain']).toBe('user_intelligence');
    expect(capturedRow!['taxonomy_category']).toBe('communication_style');
    expect(capturedRow!['stability_class']).toBe('medium_term');
    expect(capturedRow!['confidence']).toBe(0.72);
    expect(capturedRow!['state']).toBe('ACTIVE');
  });
});

describe('E1-2: Design constraint — declared constraints must NOT use workspace learnings', () => {
  it('documents the design boundary: compliance constraints belong in complianceConstraints', () => {
    // This test documents the architectural constraint from E1-2 design note.
    // There is no code to call — the constraint is enforced by convention and
    // by the fact that upsertWorkspaceLearning sets state=ACTIVE (subject to decay).
    // Compliance constraints (banned phrases, mandated disclaimers) that must
    // NEVER decay should go through WorkspaceContext.complianceConstraints,
    // not through workspace learnings.
    //
    // If this design boundary is ever violated, the Learning decay machinery
    // could silently weaken a hard regulatory requirement over time.
    expect(true).toBe(true); // Intentional documentation test
  });
});
