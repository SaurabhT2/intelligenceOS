/**
 * KnowledgeAssetEvidenceAdapter.ts
 *
 * Evidence/Identity Bridge (ADR-005) — the ONLY Knowledge-specific file in
 * the bridge. Converts a KnowledgeAsset's already-computed extraction
 * results (FrameworkExtractionResult, VocabularyExtractionResult) into the
 * source-agnostic `EvidenceSourceInput` envelope `pipeline/EvidenceExtractor.ts`
 * consumes. A future connector/web-import/repository/conversation producer
 * gets its own adapter file with this same shape — `EvidenceExtractor`
 * itself never changes.
 *
 * ── Scope: which categories become evidence, and why ───────────────────────
 * Two deliberate boundaries, both preserving existing ADRs:
 *
 * 1. Positioning is excluded. ADR-004 §0.1 established "positioning is
 *    Experience-only at launch; no Knowledge items" for
 *    `ProfileBuilder.positioning` — this adapter honors that boundary by
 *    never emitting a `competitive_intelligence` candidate.
 *
 * 2. Only identity-relevant categories become evidence here, not every
 *    category VocabularyExtractor's mapToTaxonomy can produce. Vocabulary
 *    already reaches the Profile directly and immediately via the existing
 *    descriptive path (`ProfileBuilder.vocabularyItemsFromKnowledge` →
 *    `vocabularySnapshot`) on every single document, by design (a
 *    workspace's vocabulary snapshot is meant to reflect what's in its
 *    current documents right now). Routing the *same* terms through the
 *    evidentiary path for every taxonomy category they might map to would
 *    double-count one document's content as two independent kinds of
 *    proof and would blur the line the architecture review explicitly
 *    asked to keep sharp: descriptive (knowledgeSummary/vocabularySnapshot)
 *    vs. evidentiary (Evidence → Hypothesis → Learning → Identity). So only
 *    `professional_identity`, `intellectual_frameworks`, and
 *    `strategic_thinking_patterns` — the taxonomy categories
 *    `identitySynthesis.deriveIdentityContribution` actually reads (plus
 *    `personal_brand_signal`, included for forward-compatibility even
 *    though no current extractor emits it) — are ever turned into evidence
 *    from a knowledge asset. `expertise_domains`/`domain_specific_vocabulary`
 *    and the rest remain descriptive-only, exactly as they are today.
 *
 * Source: ADR-005 (Knowledge → Evidence → Hypothesis → Learning → Identity Bridge).
 */

import type { SubjectRef } from '../types/subject';
import type { TaxonomyCategory } from '../types/entities';
import type { FrameworkExtractionResult, VocabularyExtractionResult } from './types';
import type { EvidenceSourceInput, EvidenceCandidate } from '../pipeline/EvidenceExtractor';

// ── Identity-relevant categories a Knowledge asset may contribute evidence to ──
// See module doc, boundary 2.

const IDENTITY_RELEVANT_CATEGORIES: ReadonlySet<TaxonomyCategory> = new Set([
  'professional_identity',
  'intellectual_frameworks',
  'strategic_thinking_patterns',
  'personal_brand_signal',
]);

// A framework detection below this confidence isn't evidence yet — mirrors
// identitySynthesis.ts's own MIN_IDENTITY_CONFIDENCE floor, applied here at
// the point evidence is generated rather than only at the point identity is
// read, so a low-confidence extraction never even reaches a Hypothesis.
const FRAMEWORK_MIN_CONFIDENCE = 0.5;

// FrameworkExtractionResult.frameworks[].category values that additionally
// count as strategic-thinking evidence — reuses the exact categorization
// ProfileBuilder.reasoningSummary already applies (categoryFilter:
// ['analytical', 'evaluative']) for the descriptive "reasoning" summary, so
// the evidentiary path classifies the same frameworks the same way.
const REASONING_FRAMEWORK_CATEGORIES = new Set(['analytical', 'evaluative']);

// A single document repeating vocabulary in an identity-relevant category
// only becomes evidence once it recurs — a lone keyword match is noise.
// (EvidenceExtractor's own gate would also catch this via
// MIN_SUPPORTING_ITEMS, but checking here too means an under-strength
// vocabulary group never even becomes a candidate worth logging.)
const MIN_VOCAB_ITEMS_PER_CATEGORY = 2;

// Fixed confidence assigned to a vocabulary-based candidate. Deliberately
// below FRAMEWORK_MIN_CONFIDENCE's typical extracted-framework confidence —
// a document merely *using* identity-relevant terminology repeatedly is
// weaker evidence than an explicitly detected, named framework — but still
// clears MIN_CANDIDATE_CONFIDENCE, so a document with strong recurring
// vocabulary can corroborate over enough documents.
const VOCABULARY_EVIDENCE_CONFIDENCE = 0.6;

export interface KnowledgeAssetEvidenceParams {
  subject: SubjectRef;
  projectId: string | null;
  assetId: string;
  assetTitle: string;
  observedAt: string;
  extractedFrameworks: FrameworkExtractionResult | null;
  extractedVocabulary: VocabularyExtractionResult | null;
}

/**
 * Builds the `EvidenceSourceInput` for one knowledge asset, or `null` if the
 * asset produced no identity-relevant evidence at all (e.g. a visual asset
 * with no extracted frameworks/vocabulary, or a document whose frameworks/
 * vocabulary only touched non-identity categories) — an honest "nothing to
 * contribute" rather than an empty-candidates envelope.
 */
export function buildKnowledgeAssetEvidenceInput(
  params: KnowledgeAssetEvidenceParams,
): EvidenceSourceInput | null {
  const candidates: EvidenceCandidate[] = [
    ...frameworkCandidates(params.extractedFrameworks),
    ...vocabularyCandidates(params.extractedVocabulary),
  ];

  if (candidates.length === 0) return null;

  return {
    sourceKind: 'knowledge_asset',
    sourceId: params.assetId,
    sourceLabel: params.assetTitle,
    subject: params.subject,
    projectId: params.projectId,
    observedAt: params.observedAt,
    candidates,
  };
}

// ── Framework candidates ────────────────────────────────────────────────────

function frameworkCandidates(extraction: FrameworkExtractionResult | null): EvidenceCandidate[] {
  if (!extraction) return [];

  // Group by the identity-relevant category each framework contributes to —
  // a single framework can contribute to both intellectual_frameworks (always)
  // and strategic_thinking_patterns (when analytical/evaluative).
  const byCategory = new Map<TaxonomyCategory, { names: string[]; maxConfidence: number }>();

  for (const framework of extraction.frameworks) {
    if (framework.confidence < FRAMEWORK_MIN_CONFIDENCE) continue;

    const targetCategories: TaxonomyCategory[] = ['intellectual_frameworks'];
    if (REASONING_FRAMEWORK_CATEGORIES.has(framework.category)) {
      targetCategories.push('strategic_thinking_patterns');
    }

    for (const category of targetCategories) {
      const existing = byCategory.get(category) ?? { names: [], maxConfidence: 0 };
      existing.names.push(framework.name);
      existing.maxConfidence = Math.max(existing.maxConfidence, framework.confidence);
      byCategory.set(category, existing);
    }
  }

  const candidates: EvidenceCandidate[] = [];
  for (const [taxonomyCategory, group] of byCategory) {
    candidates.push({
      taxonomyCategory,
      confidence: group.maxConfidence,
      supportingItems: dedupe(group.names),
      identityContent: { namedFrameworks: dedupe(group.names) },
    });
  }
  return candidates;
}

// ── Vocabulary candidates ────────────────────────────────────────────────────

function vocabularyCandidates(extraction: VocabularyExtractionResult | null): EvidenceCandidate[] {
  if (!extraction) return [];

  const byCategory = new Map<TaxonomyCategory, string[]>();

  for (const term of extraction.terms) {
    if (!IDENTITY_RELEVANT_CATEGORIES.has(term.taxonomyCategory)) continue;
    const list = byCategory.get(term.taxonomyCategory) ?? [];
    list.push(term.term);
    byCategory.set(term.taxonomyCategory, list);
  }
  for (const phrase of extraction.phrases) {
    if (!IDENTITY_RELEVANT_CATEGORIES.has(phrase.taxonomyCategory)) continue;
    const list = byCategory.get(phrase.taxonomyCategory) ?? [];
    list.push(phrase.phrase);
    byCategory.set(phrase.taxonomyCategory, list);
  }

  const candidates: EvidenceCandidate[] = [];
  for (const [taxonomyCategory, items] of byCategory) {
    const unique = dedupe(items);
    if (unique.length < MIN_VOCAB_ITEMS_PER_CATEGORY) continue;

    candidates.push({
      taxonomyCategory,
      confidence: VOCABULARY_EVIDENCE_CONFIDENCE,
      supportingItems: unique,
    });
  }
  return candidates;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
