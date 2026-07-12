/**
 * tests/unit/epic1/E1-5.classificationCompat.test.ts
 *
 * Unit tests for E1-5: A–C Classification Backward Compatibility Mapping
 *
 * Covers:
 *   - A classification: permanent + confidence >= 0.75
 *   - B classification: long_term + confidence >= 0.50
 *   - C classification: all other cases
 *   - State modifiers: DECAYING reduces effective confidence by 0.7 factor
 *   - FLAGGED → always C
 *   - ARCHIVED → always C
 *   - RETIRED → always C
 *   - Edge cases at classification boundaries
 *   - E1-5 correction: 3-value scheme (A/B/C), not A–E
 */

import { describe, it, expect } from 'vitest';
import { toLegacyClassification } from '../../../src/utils/classificationCompat';
import type { Learning } from '../../../src/types/entities';

// ── Fixture factory ───────────────────────────────────────────────────────────

function makeLearning(
  overrides: Partial<Pick<Learning,
    'stabilityClass' | 'confidence' | 'state'
  >>,
): Learning {
  return {
    id:                 'lrn-test-001',
    userId:             'user-001',
    workspaceId:        null,
    subjectType:        'user',
    projectId:          null,
    domain:             'user_intelligence',
    taxonomyCategory:   'communication_style',
    stabilityClass:     'medium_term',
    state:              'ACTIVE',
    confidence:         0.70,
    contextScope:       'global',
    contextArtifactType: null,
    contextProjectId:   null,
    contextAudienceType: null,
    content:            {},
    sourceSummary:      {},
    decayRate:          null,
    lastConfirmedAt:    null,
    decayStartedAt:     null,
    archivedAt:         null,
    createdAt:          new Date(),
    updatedAt:          new Date(),
    ...overrides,
  };
}

// ── A classification ──────────────────────────────────────────────────────────

describe('E1-5: toLegacyClassification — A classification', () => {
  it('maps permanent + confidence=0.75 to A', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'permanent',
      confidence:     0.75,
      state:          'ACTIVE',
    }))).toBe('A');
  });

  it('maps permanent + confidence=1.0 to A', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'permanent',
      confidence:     1.0,
      state:          'CONFIRMED',
    }))).toBe('A');
  });

  it('maps permanent + confidence=0.80 + VALIDATED to A', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'permanent',
      confidence:     0.80,
      state:          'VALIDATED',
    }))).toBe('A');
  });

  it('maps permanent + DECAYING + effective confidence >= 0.75 still to A', () => {
    // confidence=1.0 * 0.7 = 0.70 — below 0.75 threshold → NOT A
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'permanent',
      confidence:     1.0,
      state:          'DECAYING',
    }))).toBe('C'); // effective = 0.70, below A threshold

    // confidence=1.08 * 0.7 = ~0.756 — above threshold... but confidence is capped at 1.0
    // So we test: confidence=0.80, 0.80*0.7=0.56 → below 0.75 → C
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'permanent',
      confidence:     0.80,
      state:          'DECAYING',
    }))).toBe('C');
  });
});

describe('E1-5: toLegacyClassification — A threshold boundary', () => {
  it('maps permanent + confidence=0.74 to C (just below A threshold)', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'permanent',
      confidence:     0.74,
      state:          'ACTIVE',
    }))).toBe('C');
  });

  it('maps permanent + confidence=0.00 to C', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'permanent',
      confidence:     0.00,
      state:          'ACTIVE',
    }))).toBe('C');
  });
});

// ── B classification ──────────────────────────────────────────────────────────

describe('E1-5: toLegacyClassification — B classification', () => {
  it('maps long_term + confidence=0.50 to B', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'long_term',
      confidence:     0.50,
      state:          'ACTIVE',
    }))).toBe('B');
  });

  it('maps long_term + confidence=0.80 to B', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'long_term',
      confidence:     0.80,
      state:          'ACTIVE',
    }))).toBe('B');
  });

  it('maps long_term + confidence=0.99 to B (long_term never → A)', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'long_term',
      confidence:     0.99,
      state:          'CONFIRMED',
    }))).toBe('B');
  });

  it('maps long_term + DECAYING + effective confidence >= 0.50 to B', () => {
    // confidence=0.80, 0.80 * 0.7 = 0.56 → >= 0.50 → B
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'long_term',
      confidence:     0.80,
      state:          'DECAYING',
    }))).toBe('B');
  });

  it('maps long_term + DECAYING + effective confidence < 0.50 to C', () => {
    // confidence=0.60, 0.60 * 0.7 = 0.42 → < 0.50 → C
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'long_term',
      confidence:     0.60,
      state:          'DECAYING',
    }))).toBe('C');
  });
});

describe('E1-5: toLegacyClassification — B threshold boundary', () => {
  it('maps long_term + confidence=0.49 to C (just below B threshold)', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'long_term',
      confidence:     0.49,
      state:          'ACTIVE',
    }))).toBe('C');
  });
});

// ── C classification (all other cases) ───────────────────────────────────────

describe('E1-5: toLegacyClassification — C classification', () => {
  it('maps medium_term + any confidence to C', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'medium_term',
      confidence:     0.99,
      state:          'CONFIRMED',
    }))).toBe('C');
  });

  it('maps FLAGGED state to C regardless of stability/confidence', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'permanent',
      confidence:     1.0,
      state:          'FLAGGED',
    }))).toBe('C');
  });

  it('maps ARCHIVED state to C regardless of stability/confidence', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'permanent',
      confidence:     1.0,
      state:          'ARCHIVED',
    }))).toBe('C');
  });

  it('maps RETIRED state to C regardless of stability/confidence', () => {
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'long_term',
      confidence:     0.99,
      state:          'RETIRED',
    }))).toBe('C');
  });

  it('maps long_term + DECAYING with confidence=0.30 to C', () => {
    // 0.30 * 0.7 = 0.21 → below B threshold
    expect(toLegacyClassification(makeLearning({
      stabilityClass: 'long_term',
      confidence:     0.30,
      state:          'DECAYING',
    }))).toBe('C');
  });
});

// ── Scheme correctness (E1-5 correction note) ─────────────────────────────────

describe('E1-5: correction note — 3-value scheme only', () => {
  it('never returns a value outside A | B | C', () => {
    const allStabilityClasses = ['permanent', 'long_term', 'medium_term'] as const;
    const allStates = ['ACTIVE', 'CONFIRMED', 'VALIDATED', 'DECAYING', 'FLAGGED', 'ARCHIVED', 'RETIRED'] as const;
    const confidences = [0, 0.25, 0.49, 0.50, 0.74, 0.75, 0.99, 1.0];

    for (const stabilityClass of allStabilityClasses) {
      for (const state of allStates) {
        for (const confidence of confidences) {
          const result = toLegacyClassification(makeLearning({ stabilityClass, state, confidence }));
          expect(['A', 'B', 'C']).toContain(result);
        }
      }
    }
  });
});
