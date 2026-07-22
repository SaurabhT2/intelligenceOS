/**
 * KnowledgeAssetEvidenceAdapter.test.ts
 *
 * Evidence/Identity Bridge (ADR-005) — the first (and, at time of writing,
 * only) evidence producer. Covers:
 *   - frameworks map to intellectual_frameworks (+ strategic_thinking_patterns
 *     when analytical/evaluative)
 *   - vocabulary recurrence gate (≥ 2 items per category within one document)
 *   - the FRAMEWORK_MIN_CONFIDENCE floor
 *   - positioning (competitive_intelligence) is never emitted — ADR-004 §0.1
 *   - non-identity vocabulary categories (e.g. domain_specific_vocabulary,
 *     expertise_domains) are never emitted — those stay descriptive-only
 *   - a document with no qualifying content returns null, not an empty envelope
 */

import { describe, it, expect } from 'vitest';
import { buildKnowledgeAssetEvidenceInput } from '../../../src/knowledge/KnowledgeAssetEvidenceAdapter';
import { workspaceSubject } from '../../../src/types/subject';
import type { FrameworkExtractionResult, VocabularyExtractionResult } from '../../../src/knowledge/types';

function baseParams(overrides: Partial<{
  extractedFrameworks: FrameworkExtractionResult | null;
  extractedVocabulary: VocabularyExtractionResult | null;
}> = {}) {
  return {
    subject: workspaceSubject('ws-1'),
    projectId: null,
    assetId: 'asset-1',
    assetTitle: 'Test Document.pdf',
    observedAt: new Date().toISOString(),
    extractedFrameworks: null,
    extractedVocabulary: null,
    ...overrides,
  };
}

function frameworks(items: Array<{ name: string; category: FrameworkExtractionResult['frameworks'][number]['category']; confidence: number }>): FrameworkExtractionResult {
  return {
    frameworks: items.map((f, i) => ({
      id: `fw-${i}`,
      name: f.name,
      description: `${f.name} description`,
      category: f.category,
      detectionMethod: 'explicit' as const,
      confidence: f.confidence,
      isProprietary: false,
      evidenceTerms: [],
    })),
    frameworkCount: items.length,
  };
}

function vocabulary(
  terms: Array<{ term: string; taxonomyCategory: VocabularyExtractionResult['terms'][number]['taxonomyCategory'] }>,
  phrases: Array<{ phrase: string; taxonomyCategory: VocabularyExtractionResult['phrases'][number]['taxonomyCategory'] }> = [],
): VocabularyExtractionResult {
  return {
    terms: terms.map((t) => ({ term: t.term, surfaceForm: t.term, frequency: 1, isAcronym: false, isProprietary: false, taxonomyCategory: t.taxonomyCategory })),
    phrases: phrases.map((p) => ({ phrase: p.phrase, frequency: 1, taxonomyCategory: p.taxonomyCategory })),
    termCount: terms.length,
    phraseCount: phrases.length,
  };
}

describe('buildKnowledgeAssetEvidenceInput — frameworks', () => {
  it('returns null when there is nothing to contribute', () => {
    expect(buildKnowledgeAssetEvidenceInput(baseParams())).toBeNull();
  });

  it('drops frameworks below the confidence floor', () => {
    const input = buildKnowledgeAssetEvidenceInput(baseParams({
      extractedFrameworks: frameworks([{ name: 'Weak Framework', category: 'methodological', confidence: 0.3 }]),
    }));
    expect(input).toBeNull();
  });

  it('maps a methodological framework to intellectual_frameworks only', () => {
    const input = buildKnowledgeAssetEvidenceInput(baseParams({
      extractedFrameworks: frameworks([{ name: 'JTBD', category: 'methodological', confidence: 0.8 }]),
    }));
    expect(input?.candidates).toHaveLength(1);
    expect(input?.candidates[0]!.taxonomyCategory).toBe('intellectual_frameworks');
    expect(input?.candidates[0]!.identityContent).toEqual({ namedFrameworks: ['JTBD'] });
  });

  it('maps an analytical/evaluative framework to BOTH intellectual_frameworks and strategic_thinking_patterns', () => {
    const input = buildKnowledgeAssetEvidenceInput(baseParams({
      extractedFrameworks: frameworks([{ name: 'SWOT', category: 'analytical', confidence: 0.8 }]),
    }));
    const categories = input?.candidates.map((c) => c.taxonomyCategory).sort();
    expect(categories).toEqual(['intellectual_frameworks', 'strategic_thinking_patterns']);
  });

  it('deduplicates and aggregates multiple frameworks contributing to the same category', () => {
    const input = buildKnowledgeAssetEvidenceInput(baseParams({
      extractedFrameworks: frameworks([
        { name: 'SWOT', category: 'analytical', confidence: 0.6 },
        { name: 'Porter Five Forces', category: 'evaluative', confidence: 0.9 },
      ]),
    }));
    const strategic = input?.candidates.find((c) => c.taxonomyCategory === 'strategic_thinking_patterns');
    expect(strategic?.supportingItems.sort()).toEqual(['Porter Five Forces', 'SWOT']);
    expect(strategic?.confidence).toBe(0.9); // max of the two
  });

  it('never emits a competitive_intelligence / positioning candidate (ADR-004 §0.1)', () => {
    // Even a maximally "positioning-sounding" framework name must not
    // produce a competitive_intelligence candidate — there is no code path
    // that maps to it at all, by construction.
    const input = buildKnowledgeAssetEvidenceInput(baseParams({
      extractedFrameworks: frameworks([{ name: 'Competitive Positioning Map', category: 'strategic', confidence: 0.95 }]),
    }));
    const categories = input?.candidates.map((c) => c.taxonomyCategory) ?? [];
    expect(categories).not.toContain('competitive_intelligence');
  });
});

describe('buildKnowledgeAssetEvidenceInput — vocabulary', () => {
  it('requires at least two recurring items in an identity-relevant category', () => {
    const input = buildKnowledgeAssetEvidenceInput(baseParams({
      extractedVocabulary: vocabulary([{ term: 'founder-led', taxonomyCategory: 'professional_identity' }]),
    }));
    expect(input).toBeNull();
  });

  it('emits a candidate once two or more items recur in the same identity-relevant category', () => {
    const input = buildKnowledgeAssetEvidenceInput(baseParams({
      extractedVocabulary: vocabulary([
        { term: 'founder-led', taxonomyCategory: 'professional_identity' },
        { term: 'operator mindset', taxonomyCategory: 'professional_identity' },
      ]),
    }));
    expect(input?.candidates).toHaveLength(1);
    expect(input?.candidates[0]!.taxonomyCategory).toBe('professional_identity');
    expect(input?.candidates[0]!.supportingItems.sort()).toEqual(['founder-led', 'operator mindset']);
  });

  it('ignores non-identity-relevant categories entirely (descriptive-only, e.g. domain_specific_vocabulary)', () => {
    const input = buildKnowledgeAssetEvidenceInput(baseParams({
      extractedVocabulary: vocabulary([
        { term: 'API', taxonomyCategory: 'domain_specific_vocabulary' },
        { term: 'SDK', taxonomyCategory: 'domain_specific_vocabulary' },
        { term: 'latency', taxonomyCategory: 'expertise_domains' },
        { term: 'throughput', taxonomyCategory: 'expertise_domains' },
      ]),
    }));
    expect(input).toBeNull();
  });

  it('combines terms and phrases within the same category', () => {
    const input = buildKnowledgeAssetEvidenceInput(baseParams({
      extractedVocabulary: vocabulary(
        [{ term: 'thought leader', taxonomyCategory: 'personal_brand_signal' }],
        [{ phrase: 'category of one', taxonomyCategory: 'personal_brand_signal' }],
      ),
    }));
    expect(input?.candidates[0]!.supportingItems.sort()).toEqual(['category of one', 'thought leader']);
  });
});

describe('buildKnowledgeAssetEvidenceInput — envelope shape', () => {
  it('carries sourceKind, sourceId, sourceLabel, subject, and observedAt through', () => {
    const observedAt = new Date().toISOString();
    const input = buildKnowledgeAssetEvidenceInput({
      subject: workspaceSubject('ws-9'),
      projectId: 'proj-1',
      assetId: 'asset-9',
      assetTitle: 'Brand Playbook.pdf',
      observedAt,
      extractedFrameworks: frameworks([{ name: 'JTBD', category: 'methodological', confidence: 0.8 }]),
      extractedVocabulary: null,
    });
    expect(input).toMatchObject({
      sourceKind: 'knowledge_asset',
      sourceId: 'asset-9',
      sourceLabel: 'Brand Playbook.pdf',
      subject: workspaceSubject('ws-9'),
      projectId: 'proj-1',
      observedAt,
    });
  });
});
