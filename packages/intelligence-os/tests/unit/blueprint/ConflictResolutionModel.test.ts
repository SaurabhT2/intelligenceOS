/**
 * ConflictResolutionModel.test.ts
 */
import { describe, it, expect } from 'vitest';
import { ConflictResolutionModel } from '../../../src/blueprint/ConflictResolutionModel';
import type { DetectedConflict } from '@intelligence-os/shared-types';

function makeConflict(overrides: Partial<DetectedConflict> = {}): DetectedConflict {
  return {
    id:              'conflict-1',
    conflictType:    'REGISTER',
    entityAType:     'user_profile',
    entityAId:       'prof-1',
    entityBType:     'audience',
    entityBId:       'board',
    authorityLevelA: 8, // USER_ESTABLISHED_PATTERN
    authorityLevelB: 5, // AUDIENCE_CALIBRATION
    departure: {
      isSignificant: true,
      description:   'User prefers conversational; board expects formal.',
    },
    ...overrides,
  };
}

describe('ConflictResolutionModel', () => {
  const model = new ConflictResolutionModel();

  // ── Empty input ───────────────────────────────────────────────────────────

  it('returns empty array for empty conflicts input', () => {
    expect(model.resolve([])).toEqual([]);
  });

  // ── COMPLIANCE rule ───────────────────────────────────────────────────────

  describe('COMPLIANCE rule (Immutability Rule)', () => {
    it('workspace wins when conflictType is COMPLIANCE', () => {
      const conflict = makeConflict({
        conflictType: 'COMPLIANCE',
        entityBType:  'workspace',
        entityBId:    'ws-1',
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.rule).toBe('COMPLIANCE');
      expect(resolution!.winner).toBe('workspace');
    });

    it('adds transparency note for significant COMPLIANCE conflict', () => {
      const conflict = makeConflict({ conflictType: 'COMPLIANCE', entityBType: 'workspace', entityBId: 'ws-1' });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.transparency).not.toBeNull();
      expect(resolution!.transparency).toContain('compliance');
    });

    it('workspace wins COMPLIANCE even when user authority level is higher', () => {
      const conflict = makeConflict({
        conflictType:    'COMPLIANCE',
        entityBType:     'workspace',
        entityBId:       'ws-1',
        authorityLevelA: 10, // USER_CORRECTION — highest possible
        authorityLevelB: 7,  // WORKSPACE_COMPLIANCE
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.winner).toBe('workspace');
    });
  });

  // ── WORKSPACE rule ────────────────────────────────────────────────────────

  describe('WORKSPACE rule (non-compliance workspace conflicts)', () => {
    it('workspace wins for workspace entityA with non-COMPLIANCE conflict', () => {
      const conflict = makeConflict({
        conflictType: 'REGISTER',
        entityAType:  'workspace',
        entityAId:    'ws-1',
        entityBType:  'user_profile',
        entityBId:    'prof-1',
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.rule).toBe('WORKSPACE');
      expect(resolution!.winner).toBe('workspace');
    });

    it('workspace wins for workspace entityB with non-COMPLIANCE conflict', () => {
      const conflict = makeConflict({
        conflictType: 'REGISTER',
        entityAType:  'user_profile',
        entityAId:    'prof-1',
        entityBType:  'workspace',
        entityBId:    'ws-1',
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.rule).toBe('WORKSPACE');
      expect(resolution!.winner).toBe('workspace');
    });
  });

  // ── RECIPIENT rule ────────────────────────────────────────────────────────

  describe('RECIPIENT rule (user vs audience register)', () => {
    it('audience wins for REGISTER conflict involving audience', () => {
      const conflict = makeConflict({ conflictType: 'REGISTER', entityBType: 'audience', entityBId: 'board' });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.rule).toBe('RECIPIENT');
      expect(resolution!.winner).toBe('audience');
    });

    it('adds transparency note when departure is significant', () => {
      const conflict = makeConflict({
        conflictType: 'REGISTER',
        entityBType:  'audience',
        entityBId:    'board',
        departure:    { isSignificant: true, description: 'formal vs conversational' },
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.transparency).not.toBeNull();
      expect(resolution!.transparency).toContain('board');
    });

    it('transparency is null when departure is NOT significant', () => {
      const conflict = makeConflict({
        conflictType: 'REGISTER',
        entityBType:  'audience',
        entityBId:    'investor',
        departure:    { isSignificant: false, description: 'minor adjustment' },
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.transparency).toBeNull();
    });

    it('RECIPIENT overrides authority ordering (audience level 5 beats user level 8)', () => {
      const conflict = makeConflict({
        conflictType:    'REGISTER',
        entityBType:     'audience',
        authorityLevelA: 8,
        authorityLevelB: 5,
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.winner).toBe('audience'); // not user despite higher authority
    });
  });

  // ── PROJECT rule ──────────────────────────────────────────────────────────

  describe('PROJECT rule (vocabulary conflicts)', () => {
    it('project wins for VOCABULARY conflict where entityB is project', () => {
      const conflict = makeConflict({
        conflictType: 'VOCABULARY',
        entityBType:  'project',
        entityBId:    'proj-1',
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.rule).toBe('PROJECT');
      expect(resolution!.winner).toBe('project');
    });

    it('adds transparency note for significant vocabulary conflict', () => {
      const conflict = makeConflict({
        conflictType: 'VOCABULARY',
        entityBType:  'project',
        entityBId:    'proj-1',
        departure:    { isSignificant: true, description: 'Conflict on: leverage, synergy, pivot' },
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.transparency).not.toBeNull();
      expect(resolution!.transparency).toContain('vocabulary');
    });
  });

  // ── AUTHORITY rule ────────────────────────────────────────────────────────

  describe('AUTHORITY rule (default: higher level wins)', () => {
    it('entityA wins when authorityLevelA > authorityLevelB', () => {
      const conflict = makeConflict({
        conflictType:    'TONE',
        entityAType:     'user_profile',
        entityBType:     'archetype',
        authorityLevelA: 8,
        authorityLevelB: 4,
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.rule).toBe('AUTHORITY');
      expect(resolution!.winner).toBe('user_profile');
    });

    it('entityB wins when authorityLevelB > authorityLevelA', () => {
      const conflict = makeConflict({
        conflictType:    'TONE',
        entityAType:     'archetype',
        entityBType:     'user_profile',
        authorityLevelA: 4,
        authorityLevelB: 8,
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.rule).toBe('AUTHORITY');
      expect(resolution!.winner).toBe('user_profile');
    });

    it('entityA wins on tie (authorityLevelA === authorityLevelB)', () => {
      const conflict = makeConflict({
        conflictType:    'TONE',
        entityAType:     'user_profile',
        entityBType:     'system_default',
        authorityLevelA: 5,
        authorityLevelB: 5,
      });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.winner).toBe('user_profile');
    });
  });

  // ── Resolution shape ──────────────────────────────────────────────────────

  describe('ConflictResolution shape', () => {
    it('sets conflictId to the detected conflict id', () => {
      const conflict = makeConflict({ id: 'det-conflict-uuid' });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.conflictId).toBe('det-conflict-uuid');
    });

    it('copies departure verbatim from detected conflict', () => {
      const departure = { isSignificant: true, description: 'test departure' };
      const conflict  = makeConflict({ departure });
      const [resolution] = model.resolve([conflict]);
      expect(resolution!.departure).toEqual(departure);
    });

    it('resolves multiple conflicts independently', () => {
      const conflicts: DetectedConflict[] = [
        makeConflict({ id: 'c1', conflictType: 'COMPLIANCE', entityBType: 'workspace', entityBId: 'ws-1' }),
        makeConflict({ id: 'c2', conflictType: 'REGISTER',   entityBType: 'audience',  entityBId: 'board' }),
        makeConflict({ id: 'c3', conflictType: 'VOCABULARY', entityBType: 'project',   entityBId: 'proj-1' }),
      ];
      const resolutions = model.resolve(conflicts);
      expect(resolutions).toHaveLength(3);
      expect(resolutions[0]!.rule).toBe('COMPLIANCE');
      expect(resolutions[1]!.rule).toBe('RECIPIENT');
      expect(resolutions[2]!.rule).toBe('PROJECT');
    });
  });
});
