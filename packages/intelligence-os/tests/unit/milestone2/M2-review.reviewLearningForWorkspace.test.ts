/**
 * M2-review.reviewLearningForWorkspace.test.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 *
 * Covers UserIntelligenceDomain.reviewLearningForWorkspace() — the
 * workspace-scoped counterpart to the pre-existing (E1-1) reviewLearning().
 * Mirrors tests/unit/epic1/E1-1.reviewLearning.test.ts's mocking style,
 * since this method reuses the same fetch-then-transition logic (now
 * extracted into fetchLearningForReview / transitionLearningState) with
 * workspace_id instead of user_id as the ownership check.
 */

import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import { EntityNotFoundError, ValidationError } from '../../../src/errors';

function makeDb(opts: {
  fetchRow?: Record<string, unknown> | null;
  fetchError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
  });

  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: opts.fetchRow ?? null,
        error: opts.fetchError ?? null,
      }),
    }),
  });

  const from = vi.fn().mockReturnValue({ select, update });
  const schema = vi.fn().mockReturnValue({ from });

  return { schema } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

const LEARNING_ROW = {
  id: 'lrn-001',
  user_id: 'user-001',
  workspace_id: 'ws-001',
  state: 'FLAGGED',
};

describe('Milestone 2: UserIntelligenceDomain.reviewLearningForWorkspace()', () => {
  it('transitions FLAGGED → ACTIVE when approved=true, scoped by workspaceId', async () => {
    const db = makeDb({ fetchRow: LEARNING_ROW });
    const domain = new UserIntelligenceDomain(db);

    const result = await domain.reviewLearningForWorkspace('ws-001', 'lrn-001', true, 'reviewer-alice');

    expect(result.newState).toBe('ACTIVE');
    expect(result.previousState).toBe('FLAGGED');
  });

  it('transitions FLAGGED → ARCHIVED when approved=false', async () => {
    const db = makeDb({ fetchRow: LEARNING_ROW });
    const domain = new UserIntelligenceDomain(db);

    const result = await domain.reviewLearningForWorkspace('ws-001', 'lrn-001', false, 'reviewer-alice');

    expect(result.newState).toBe('ARCHIVED');
  });

  it('throws EntityNotFoundError when entryId not found', async () => {
    const db = makeDb({ fetchRow: null });
    const domain = new UserIntelligenceDomain(db);

    await expect(
      domain.reviewLearningForWorkspace('ws-001', 'does-not-exist', true, 'reviewer-alice'),
    ).rejects.toThrow(EntityNotFoundError);
  });

  it('throws ValidationError when the learning belongs to a different workspace', async () => {
    const db = makeDb({ fetchRow: { ...LEARNING_ROW, workspace_id: 'ws-999' } });
    const domain = new UserIntelligenceDomain(db);

    await expect(
      domain.reviewLearningForWorkspace('ws-001', 'lrn-001', true, 'reviewer-alice'),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when the learning has no workspace_id at all (purely user-scoped learning)', async () => {
    const db = makeDb({ fetchRow: { ...LEARNING_ROW, workspace_id: null } });
    const domain = new UserIntelligenceDomain(db);

    await expect(
      domain.reviewLearningForWorkspace('ws-001', 'lrn-001', true, 'reviewer-alice'),
    ).rejects.toThrow(ValidationError);
  });

  it('does not regress the pre-existing user-scoped reviewLearning() after the shared-logic refactor', async () => {
    const db = makeDb({ fetchRow: LEARNING_ROW });
    const domain = new UserIntelligenceDomain(db);

    const result = await domain.reviewLearning('user-001', 'lrn-001', true, 'reviewer-alice');
    expect(result.newState).toBe('ACTIVE');

    const db2 = makeDb({ fetchRow: { ...LEARNING_ROW, user_id: 'user-999' } });
    const domain2 = new UserIntelligenceDomain(db2);
    await expect(
      domain2.reviewLearning('user-001', 'lrn-001', true, 'reviewer-alice'),
    ).rejects.toThrow(ValidationError);
  });
});
