/**
 * classificationCompat.ts
 *
 * Maps IntelligenceOS Learning fields to the BrandOS A–C classification
 * scheme used during the Epic 3 transition period.
 *
 * @internal — for transition period use only. Not part of the IOS core model.
 *             Do not build new features against this mapping. It will be
 *             removed after Epic 3 Milestone 4 (BrandOS retires the
 *             A–C scheme in favour of IOS native confidence + stability).
 *
 * Source: Engineering Roadmap E1-5.
 *
 * Correction note (per Implementation Guide Appendix finding #1):
 *   The real BrandOS classification type is 'A' | 'B' | 'C' (3 values),
 *   NOT the A–E 5-value scheme originally described in the Roadmap's E1-5
 *   task description. This implementation uses the corrected 3-value scheme.
 *   The mapping thresholds below are designed so every valid Learning input
 *   maps to exactly one of the three values with no gaps.
 *
 * Mapping logic:
 *   A = permanent stability + confidence >= 0.75  (highest authority signal)
 *   B = long_term stability + confidence >= 0.50  (established, high-trust signal)
 *   C = any other case                             (medium_term or lower confidence)
 *
 *   State modifiers:
 *   - VALIDATED/CONFIRMED: no adjustment (full confidence used)
 *   - ACTIVE:              no adjustment
 *   - DECAYING:            confidence treated as confidence * 0.7 (weakened signal)
 *   - FLAGGED:             maps to C regardless of other fields (awaiting review)
 *   - ARCHIVED/RETIRED:    maps to C (effectively inactive)
 */

import type { Learning } from '../types/entities';

/**
 * Maps a Learning to its BrandOS-compatible A–C classification.
 *
 * @internal — transition period use only.
 * @param learning A fully-populated Learning entity from IOS.
 * @returns 'A' | 'B' | 'C'
 */
export function toLegacyClassification(learning: Learning): 'A' | 'B' | 'C' {
  // State-based early exits
  if (
    learning.state === 'FLAGGED' ||
    learning.state === 'ARCHIVED' ||
    learning.state === 'RETIRED'
  ) {
    return 'C';
  }

  // Effective confidence — reduced for DECAYING learnings
  const effectiveConfidence =
    learning.state === 'DECAYING'
      ? learning.confidence * 0.7
      : learning.confidence;

  // A: permanent + high confidence
  if (learning.stabilityClass === 'permanent' && effectiveConfidence >= 0.75) {
    return 'A';
  }

  // B: long_term + moderate-to-high confidence
  if (learning.stabilityClass === 'long_term' && effectiveConfidence >= 0.50) {
    return 'B';
  }

  // C: everything else
  return 'C';
}
