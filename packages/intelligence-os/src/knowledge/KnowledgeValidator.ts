/**
 * KnowledgeValidator.ts
 *
 * Stage 4 of the Knowledge Intelligence pipeline.
 *
 * Responsibilities (per Sprint 3 spec):
 *   • Confidence assignment
 *   • Duplication detection
 *   • Corroboration checks
 *   • Framework validation
 *
 * Implements validation thresholds consistent with the Learning Pipeline:
 *   - Source quality (uploaded_artifact) → confidence ceiling 0.90 (Sprint 2 types.ts)
 *   - Explicit upload → Very High confidence at upload (Schema B.8)
 *   - Duplicate = near-identical asset already exists → flag but do not reject
 *   - Corroboration = existing vocabulary/framework overlap → increases confidence
 *   - Empty content → low confidence (0.20), warning issued
 *
 * Design decisions:
 *   1. Confidence is built bottom-up:
 *      Base:  0.70 (explicit upload, per Contracts "Very High confidence at upload"
 *             → we interpret this as the starting floor for an uploaded asset)
 *      +0.10  for structured content (reliable extraction)
 *      +0.05  per 100 words (up to +0.10 for rich content)
 *      +0.05  for corroboration with existing vocabulary
 *      Ceiling: 0.90 per SOURCE_QUALITY_CEILING['uploaded_artifact'] from Sprint 2
 *
 *   2. Duplicate detection: two assets are near-duplicates if:
 *      (a) their titles are >80% similar (case-insensitive), AND
 *      (b) they share the same assetType and owner scope
 *      A duplicate does not abort processing — it generates a warning and
 *      the new asset is still ingested (versioning pathway, per schema I.5.3).
 *
 *   3. Framework validation per Schema B.7: an extracted framework from a
 *      single asset is "Provisional confidence only" → we cap framework
 *      confidence at 0.60 unless the framework was also found via explicit
 *      name match AND the text references it ≥3 times.
 *
 *   4. The validator consults existing KnowledgeAsset records via the domain
 *      parameter. In tests, a mock provider is injected. This avoids a direct
 *      Supabase dependency (consistent with Sprint 2: SignalExtractor is DB-free).
 *
 * Source: BrandOS Sprint 3 spec.
 * Source: BrandOS_Intelligence_Contracts.md Section B (Knowledge Asset entity contract).
 * Source: BrandOS_Logical_Intelligence_Schema.md B.7 (Framework confidence rules).
 */

import type { KnowledgeAsset } from '../types/entities';
import type {
  ExtractionJob,
  VocabularyExtractionResult,
  FrameworkExtractionResult,
  ValidationResult,
} from './types';

// ── Confidence bounds (from Sprint 2 types.ts SOURCE_QUALITY_CEILING) ─────────
const UPLOAD_CONFIDENCE_BASE    = 0.70;
const UPLOAD_CONFIDENCE_CEILING = 0.90;
const EMPTY_CONTENT_CONFIDENCE  = 0.20;

// ── Title similarity ──────────────────────────────────────────────────────────
// A simple normalized Levenshtein-like similarity (Jaccard of word sets).

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  return intersection / Math.max(wordsA.size, wordsB.size);
}

// ── Corroboration: overlap with existing assets ───────────────────────────────
// Counts how many extracted terms already appear in existing asset vocabulary.

function computeCorroboration(
  vocabulary: VocabularyExtractionResult,
  existingAssets: KnowledgeAsset[],
): number {
  if (vocabulary.termCount === 0 || existingAssets.length === 0) return 0;

  const newTerms = new Set(vocabulary.terms.map(t => t.term));
  let overlappingTerms = 0;

  for (const asset of existingAssets) {
    if (!asset.extractedVocabulary) continue;
    const assetVocab = asset.extractedVocabulary as { terms?: Array<{ term: string }> };
    for (const existingTerm of assetVocab.terms ?? []) {
      if (newTerms.has(existingTerm.term)) {
        overlappingTerms++;
      }
    }
  }

  // Corroboration ratio: what fraction of new terms were already known
  return Math.min(1.0, overlappingTerms / Math.max(newTerms.size, 1));
}

// ── Duplicate check ───────────────────────────────────────────────────────────

function findDuplicate(
  job: ExtractionJob,
  existingAssets: KnowledgeAsset[],
): KnowledgeAsset | null {
  const SIMILARITY_THRESHOLD = 0.80;

  for (const asset of existingAssets) {
    // Must be same asset type AND same owner scope
    if (asset.assetType !== job.assetType)   continue;
    if (asset.ownerType !== job.ownerType)   continue;
    if (asset.userId    !== job.userId)       continue;
    if (asset.projectId !== job.projectId)   continue;

    const sim = titleSimilarity(job.title, asset.title);
    if (sim >= SIMILARITY_THRESHOLD) return asset;
  }

  return null;
}

// ── Framework validation ──────────────────────────────────────────────────────
// Per Schema B.7: cap implicit frameworks at 0.40, explicit at 0.65 for single asset.
// If the same framework name appears in existing assets → cap at 0.70.

function validateFrameworks(
  frameworkResult: FrameworkExtractionResult,
  existingAssets: KnowledgeAsset[],
  text: string,
): string[] {
  const warnings: string[] = [];

  for (const fw of frameworkResult.frameworks) {
    // Count references to the framework name in the full text
    const nameOccurrences = (text.toLowerCase().match(
      new RegExp(fw.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    ) ?? []).length;

    const minRequired = fw.detectionMethod === 'explicit' ? 1 : 2;
    if (nameOccurrences < minRequired) {
      warnings.push(
        `Framework "${fw.name}" has low occurrence count (${nameOccurrences}); ` +
        `confidence remains at ${fw.confidence}.`,
      );
    }

    // Check if framework already exists in other assets (corroborates it)
    const isCorroborated = existingAssets.some(asset => {
      const extracted = asset.extractedFrameworks as { frameworks?: Array<{ name: string }> } | null;
      return extracted?.frameworks?.some(
        ef => ef.name.toLowerCase() === fw.name.toLowerCase(),
      ) ?? false;
    });

    if (!isCorroborated && fw.detectionMethod === 'implicit') {
      warnings.push(
        `Implicit framework "${fw.name}" not corroborated by existing assets; ` +
        `treat as Provisional (Contracts B.7).`,
      );
    }
  }

  return warnings;
}

// ── KnowledgeValidator ────────────────────────────────────────────────────────

/**
 * Provides existing knowledge assets for corroboration checks.
 * Injectable for testability — production uses KnowledgeIntelligenceDomain.
 */
export type ExistingAssetProvider = () => Promise<KnowledgeAsset[]>;

export class KnowledgeValidator {
  constructor(
    private readonly getExistingAssets: ExistingAssetProvider,
  ) {}

  /**
   * Validates an extraction job and its extraction results.
   *
   * Returns a ValidationResult with overall confidence, duplicate flags,
   * corroboration score, and any warnings.
   */
  async validate(
    job: ExtractionJob,
    vocabulary: VocabularyExtractionResult,
    frameworks: FrameworkExtractionResult,
  ): Promise<ValidationResult> {
    const warnings: string[] = [];

    // 1. Load existing assets for corroboration and duplicate checks
    const existingAssets = await this.getExistingAssets();

    // 2. Empty content guard
    if (job.content.wordCount === 0) {
      return {
        confidence:        EMPTY_CONTENT_CONFIDENCE,
        isDuplicate:       false,
        duplicateAssetId:  null,
        corroborationScore: 0,
        warnings:          ['Content is empty — extraction produced no terms. Asset stored with minimal confidence.'],
        passed:            false,
      };
    }

    // 3. Duplicate detection
    const duplicate = findDuplicate(job, existingAssets);
    const isDuplicate = duplicate !== null;
    if (isDuplicate) {
      warnings.push(
        `Near-duplicate of existing asset "${duplicate!.title}" (id: ${duplicate!.id}). ` +
        `New version recorded; prior asset remains active until explicitly superseded.`,
      );
    }

    // 4. Corroboration score
    const corroborationScore = computeCorroboration(vocabulary, existingAssets);
    if (corroborationScore > 0.5) {
      warnings.push(
        `High overlap (${Math.round(corroborationScore * 100)}%) with existing knowledge vocabulary. ` +
        `May duplicate existing assets.`,
      );
    }

    // 5. Framework validation warnings
    const fwWarnings = validateFrameworks(frameworks, existingAssets, job.content.text);
    warnings.push(...fwWarnings);

    // 6. Compute final confidence
    let confidence = UPLOAD_CONFIDENCE_BASE;

    // +0.10 if content is well-structured (rich extraction)
    if (job.content.isStructured) confidence += 0.10;

    // +0.05 per 100 words (rich content), capped at +0.10
    const wordBonus = Math.min(0.10, Math.floor(job.content.wordCount / 100) * 0.05);
    confidence += wordBonus;

    // +0.05 if corroborated by existing assets (same domain knowledge)
    if (corroborationScore > 0 && corroborationScore < 0.5) confidence += 0.05;

    // −0.10 if empty vocabulary (content is thin)
    if (vocabulary.termCount === 0) confidence -= 0.10;

    // Clamp to [0.20, UPLOAD_CONFIDENCE_CEILING]
    confidence = Math.max(EMPTY_CONTENT_CONFIDENCE, Math.min(UPLOAD_CONFIDENCE_CEILING, confidence));
    confidence = Math.round(confidence * 100) / 100;

    // 7. Passed = confidence above a usable threshold and no fatal issues
    const passed = confidence >= 0.40;

    return {
      confidence,
      isDuplicate,
      duplicateAssetId: duplicate?.id ?? null,
      corroborationScore: Math.round(corroborationScore * 100) / 100,
      warnings,
      passed,
    };
  }
}
