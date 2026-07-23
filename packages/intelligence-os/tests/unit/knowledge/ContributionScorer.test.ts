/**
 * tests/unit/knowledge/ContributionScorer.test.ts
 *
 * Unit tests for ContributionScorer — Objective 2 (reframed), Cognitive
 * Platform Evolution Program — Knowledge Lifecycle Completion. Covers the
 * requirements from the task brief's own worked examples: a novel document
 * scores meaningfully higher than a near-duplicate, an empty/thin
 * extraction scores near zero, and the explanation trail (`reasons`) is
 * non-empty and human-readable — never a bare number with no "why".
 */

import { describe, it, expect } from 'vitest';
import { computeContribution } from '../../../src/knowledge/ContributionScorer';
import type {
  VocabularyExtractionResult,
  FrameworkExtractionResult,
  PatternExtractionResult,
  ValidationResult,
} from '../../../src/knowledge/types';

function vocab(termCount: number): VocabularyExtractionResult {
  return { terms: Array.from({ length: termCount }, (_, i) => ({ term: `t${i}`, taxonomyCategory: 'domain_specific_vocabulary' as const, frequency: 1 })), phrases: [], termCount, phraseCount: 0 };
}
function frameworks(count: number): FrameworkExtractionResult {
  return { frameworks: Array.from({ length: count }, (_, i) => ({ name: `f${i}`, category: 'analytical' as const, confidence: 0.7, detectionMethod: 'explicit' as const })), frameworkCount: count };
}
function patterns(count: number): PatternExtractionResult {
  return { patterns: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, patternType: 'structural' as const, name: `p${i}`, description: '', confidence: 0.6, elements: [], isRecurring: false, artifactTypeHint: null })), patternCount: count };
}
function validation(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return { confidence: 0.8, isDuplicate: false, duplicateAssetId: null, corroborationScore: 0, warnings: [], passed: true, ...overrides };
}

describe('ContributionScorer — computeContribution', () => {
  it('scores a rich, entirely novel document highly', () => {
    const result = computeContribution(vocab(100), frameworks(3), patterns(4), validation({ corroborationScore: 0 }));

    expect(result.score).toBeGreaterThan(85);
    expect(result.noveltyRatio).toBe(1);
    expect(result.isDuplicate).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('scores an empty extraction near zero', () => {
    const result = computeContribution(vocab(0), frameworks(0), patterns(0), validation({ confidence: 0.2, passed: false }));

    expect(result.score).toBe(0);
    expect(result.reasons.some(r => r.includes('No vocabulary'))).toBe(true);
  });

  it('caps a flagged duplicate at the duplicate ceiling regardless of volume', () => {
    const result = computeContribution(
      vocab(120), frameworks(3), patterns(4),
      validation({ isDuplicate: true, duplicateAssetId: 'existing-asset-1', corroborationScore: 0.1 }),
    );

    expect(result.isDuplicate).toBe(true);
    expect(result.score).toBeLessThanOrEqual(12);
    expect(result.reasons.some(r => r.includes('near-duplicate'))).toBe(true);
  });

  it('scores a document that fully overlaps existing vocabulary lower than a novel one of the same size', () => {
    const novel = computeContribution(vocab(50), frameworks(0), patterns(0), validation({ corroborationScore: 0 }));
    const overlapping = computeContribution(vocab(50), frameworks(0), patterns(0), validation({ corroborationScore: 0.9 }));

    expect(overlapping.score).toBeLessThan(novel.score);
    expect(overlapping.noveltyRatio).toBeCloseTo(0.1, 5);
  });

  it('reflects the task brief\'s worked example: strengthening confidence via corroboration still shows as meaningful (not zero) contribution', () => {
    // "Document 2 ... contains overlapping terminology, supporting concepts.
    // The workspace should strengthen confidence." — corroborating content
    // is not the same as a wasted/duplicate upload; it should score above
    // the near-zero duplicate case even though its novelty is partial.
    const corroborating = computeContribution(vocab(40), frameworks(1), patterns(0), validation({ corroborationScore: 0.4 }));
    const duplicate = computeContribution(vocab(40), frameworks(1), patterns(0), validation({ isDuplicate: true, corroborationScore: 0.4 }));

    expect(corroborating.score).toBeGreaterThan(duplicate.score);
    expect(corroborating.score).toBeGreaterThan(0);
  });

  it('never returns a score outside [0, 100]', () => {
    const result = computeContribution(vocab(1000), frameworks(50), patterns(50), validation({ corroborationScore: 0 }));
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('always returns a non-empty, human-readable reasons trail (Objective 5 — explainability)', () => {
    const cases = [
      computeContribution(vocab(0), frameworks(0), patterns(0), validation()),
      computeContribution(vocab(10), frameworks(1), patterns(1), validation({ corroborationScore: 0.5 })),
      computeContribution(vocab(10), frameworks(0), patterns(0), validation({ isDuplicate: true })),
    ];
    for (const result of cases) {
      expect(result.reasons.length).toBeGreaterThan(0);
      for (const reason of result.reasons) {
        expect(typeof reason).toBe('string');
        expect(reason.length).toBeGreaterThan(0);
      }
    }
  });
});
