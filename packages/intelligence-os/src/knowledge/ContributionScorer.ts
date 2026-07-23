/**
 * ContributionScorer.ts
 *
 * Stage 6 of the Knowledge Intelligence pipeline (added alongside
 * KnowledgeValidator's Stage 5 — see KnowledgeProcessor.ts).
 *
 * Cognitive Platform Evolution Program — Knowledge Lifecycle Completion,
 * Objective 2 (reframed). The task brief's original Objective 2 asked for
 * confidence/opinion formation from a single document, which ADR-005
 * deliberately forbids (see docs/vision.md §4 and
 * KnowledgeAssetEvidenceAdapter.ts's header). The architecture review of
 * 2026-07-23 (see docs/handoffs/) resolved this by separating two
 * questions that the original brief conflated:
 *
 *   1. "How much trusted identity/opinion did this produce?"
 *      → unchanged. Still gated by ADR-005's corroboration requirement,
 *        still computed by EvidenceExtractor/HypothesisEngine, never by
 *        this file.
 *   2. "How much did this ingestion expand the workspace's raw knowledge
 *      surface?" → this file. A real, explainable, non-fake number,
 *      computed from data KnowledgeValidator/Vocabulary/Framework/
 *      PatternExtractor already produced — no new extraction, no new
 *      DB reads, no interaction with the evidence/trust pipeline at all.
 *
 * Source: KnowledgeValidator.ts (corroborationScore/isDuplicate — this
 * file's only external inputs besides the three extractors' own counts).
 */

import type {
  VocabularyExtractionResult,
  FrameworkExtractionResult,
  PatternExtractionResult,
  ValidationResult,
  ContributionSummary,
} from './types';

// ── Weights ──────────────────────────────────────────────────────────────────
// Volume (how much was extracted) and novelty (how much of it was new) are
// both real signals, deliberately weighted so a large duplicate contributes
// less than a small novel document — the task brief's own stated bar
// ("a duplicate document should contribute very little; a novel document
// should contribute much more").

/** Ceiling on the volume component before novelty is applied — a maximally rich extraction alone caps at this many of the 100 points. */
const VOLUME_WEIGHT = 55;
/** Ceiling on the novelty component. */
const NOVELTY_WEIGHT = 45;

/** Diminishing-returns scale for term count — matches VOCAB_RICH_TERM_SCALE-style caps used elsewhere in this pipeline (see VocabularyExtractor.ts) rather than a raw linear count, so one enormous document doesn't dominate the volume component. */
const TERM_COUNT_SATURATION = 80;
const FRAMEWORK_COUNT_SATURATION = 3;
const PATTERN_COUNT_SATURATION = 4;

/** A near-duplicate (KnowledgeValidator.isDuplicate) is capped hard, regardless of volume — matches the "duplicate contributes very little" requirement even if the duplicate happens to be long. */
const DUPLICATE_SCORE_CAP = 12;

export function computeContribution(
  vocabulary: VocabularyExtractionResult,
  frameworks: FrameworkExtractionResult,
  patterns: PatternExtractionResult,
  validation: ValidationResult,
): ContributionSummary {
  const reasons: string[] = [];

  // ── Volume component ────────────────────────────────────────────────────
  const termFraction = Math.min(1, vocabulary.termCount / TERM_COUNT_SATURATION);
  const frameworkFraction = Math.min(1, frameworks.frameworkCount / FRAMEWORK_COUNT_SATURATION);
  const patternFraction = Math.min(1, patterns.patternCount / PATTERN_COUNT_SATURATION);
  // Vocabulary is the dominant volume signal (every document has it);
  // frameworks/patterns are bonuses on top, not required for a full score.
  const volumeFraction = Math.min(1, termFraction * 0.7 + frameworkFraction * 0.2 + patternFraction * 0.1);
  const volumePoints = volumeFraction * VOLUME_WEIGHT;

  if (vocabulary.termCount === 0) {
    reasons.push('No vocabulary was extracted — thin or unparsable content contributes little regardless of novelty.');
  } else {
    reasons.push(`Extracted ${vocabulary.termCount} term(s), ${frameworks.frameworkCount} framework(s), ${patterns.patternCount} pattern(s).`);
  }

  // ── Novelty component ───────────────────────────────────────────────────
  // corroborationScore is "how much of this already existed" (0 = all new,
  // 1 = fully overlapping) — see KnowledgeValidator.computeCorroboration.
  // noveltyRatio inverts it to "how much of this is new to the workspace".
  const noveltyRatio = vocabulary.termCount === 0 ? 0 : 1 - validation.corroborationScore;
  const noveltyPoints = noveltyRatio * NOVELTY_WEIGHT;

  if (validation.corroborationScore > 0) {
    reasons.push(`${Math.round(validation.corroborationScore * 100)}% of its vocabulary overlapped with knowledge the workspace already had; ${Math.round(noveltyRatio * 100)}% was new.`);
  } else if (vocabulary.termCount > 0) {
    reasons.push('Entirely new vocabulary — no overlap with existing knowledge assets.');
  }

  let score = Math.round(volumePoints + noveltyPoints);

  // ── Duplicate cap ────────────────────────────────────────────────────────
  if (validation.isDuplicate) {
    score = Math.min(score, DUPLICATE_SCORE_CAP);
    reasons.push(`Matched an existing asset as a near-duplicate (id: ${validation.duplicateAssetId}) — contribution capped at ${DUPLICATE_SCORE_CAP} regardless of volume.`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    isDuplicate: validation.isDuplicate,
    duplicateAssetId: validation.duplicateAssetId,
    noveltyRatio: Math.round(noveltyRatio * 100) / 100,
    corroborationScore: validation.corroborationScore,
    termCount: vocabulary.termCount,
    frameworkCount: frameworks.frameworkCount,
    patternCount: patterns.patternCount,
    reasons,
  };
}
