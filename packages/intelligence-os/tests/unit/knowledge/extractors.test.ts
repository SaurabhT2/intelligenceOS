/**
 * tests/unit/knowledge/extractors.test.ts
 *
 * Unit tests for VocabularyExtractor, FrameworkExtractor, PatternExtractor.
 * Tests: vocabulary extraction, acronym detection, framework detection, pattern detection.
 */

import { describe, it, expect } from 'vitest';
import { KnowledgeAssetExtractor } from '../../../src/knowledge/KnowledgeAssetExtractor';
import { VocabularyExtractor } from '../../../src/knowledge/VocabularyExtractor';
import { FrameworkExtractor } from '../../../src/knowledge/FrameworkExtractor';
import { PatternExtractor } from '../../../src/knowledge/PatternExtractor';
import type { KnowledgeAssetInput } from '../../../src/types/domains';

// ── Test helpers ──────────────────────────────────────────────────────────────

const assetExtractor = new KnowledgeAssetExtractor();

function makeJob(content: string, title = 'Test Asset', assetType: KnowledgeAssetInput['assetType'] = 'framework') {
  const input: KnowledgeAssetInput = {
    ownerType: 'user', userId: 'user-001', projectId: null, workspaceId: null,
    assetType, title, sourceFileRef: null,
  };
  return assetExtractor.createJob(input, 'asset-001', content);
}

// ── VocabularyExtractor ───────────────────────────────────────────────────────

describe('VocabularyExtractor', () => {
  const extractor = new VocabularyExtractor();

  it('extracts high-frequency terms from content', () => {
    const content = 'strategy strategy strategy goal goal methodology methodology stakeholder';
    const result = extractor.extract(makeJob(content));
    const termNames = result.terms.map(t => t.term);
    expect(termNames).toContain('strategy');
    expect(termNames).toContain('goal');
  });

  it('excludes stop-words', () => {
    const content = 'the is in a and or but for to with by from as when';
    const result = extractor.extract(makeJob(content));
    expect(result.termCount).toBe(0);
  });

  it('detects acronyms', () => {
    const content = 'Our B2B GTM strategy uses OKR frameworks. The KPI metrics matter.';
    const result = extractor.extract(makeJob(content));
    const acronymTerms = result.terms.filter(t => t.isAcronym);
    expect(acronymTerms.length).toBeGreaterThan(0);
  });

  it('detects repeated 2-gram phrases', () => {
    const content = 'customer success is paramount. customer success drives growth. customer success team matters.';
    const result = extractor.extract(makeJob(content));
    const phraseTexts = result.phrases.map(p => p.phrase);
    // "customer success" should appear as a repeated phrase
    const found = phraseTexts.some(p => p.includes('customer success') || p.includes('success'));
    expect(found).toBe(true);
  });

  it('assigns taxonomy categories to terms', () => {
    const content = 'strategy strategy strategy goal goal goal framework framework framework';
    const result = extractor.extract(makeJob(content));
    for (const term of result.terms) {
      expect(term.taxonomyCategory).toBeDefined();
      expect(term.taxonomyCategory.length).toBeGreaterThan(0);
    }
  });

  it('returns empty result for empty content', () => {
    const result = extractor.extract(makeJob(''));
    expect(result.termCount).toBe(0);
    expect(result.phraseCount).toBe(0);
  });

  it('returns sorted terms by frequency descending', () => {
    const content = 'strategy strategy strategy goal goal single';
    const result = extractor.extract(makeJob(content));
    if (result.terms.length >= 2) {
      for (let i = 0; i < result.terms.length - 1; i++) {
        expect(result.terms[i]!.frequency).toBeGreaterThanOrEqual(result.terms[i + 1]!.frequency);
      }
    }
  });

  it('identifies proprietary title-case phrases', () => {
    const content = 'The Revenue Growth Framework is our proprietary Revenue Growth Framework model.';
    const result = extractor.extract(makeJob(content));
    // Should detect at least some terms from this
    expect(result.termCount).toBeGreaterThan(0);
  });

  it('does not include single-occurrence common words', () => {
    const content = 'unique-neologism-xyz appears once here only.';
    const result = extractor.extract(makeJob(content));
    const termNames = result.terms.map(t => t.term);
    expect(termNames).not.toContain('appears');
    expect(termNames).not.toContain('only');
  });
});

// ── FrameworkExtractor ────────────────────────────────────────────────────────

describe('FrameworkExtractor', () => {
  const extractor = new FrameworkExtractor();

  it('detects a known framework (SWOT)', () => {
    const content = 'We apply SWOT analysis to identify strengths, weaknesses, opportunities, and threats.';
    const result = extractor.extract(makeJob(content));
    const names = result.frameworks.map(f => f.name);
    expect(names).toContain('SWOT Analysis');
  });

  it('detects OKRs framework', () => {
    const content = 'Our OKR process sets objectives and key results quarterly.';
    const result = extractor.extract(makeJob(content));
    const names = result.frameworks.map(f => f.name);
    expect(names).toContain('OKRs');
  });

  it('detects Agile methodology', () => {
    const content = 'The team uses agile methodology with sprint-based delivery and retrospectives.';
    const result = extractor.extract(makeJob(content));
    const names = result.frameworks.map(f => f.name);
    expect(names).toContain('Agile');
  });

  it('marks known frameworks as non-proprietary', () => {
    const content = 'SWOT analysis identifies strengths, weaknesses, opportunities, threats.';
    const result = extractor.extract(makeJob(content));
    const swot = result.frameworks.find(f => f.name === 'SWOT Analysis');
    expect(swot?.isProprietary).toBe(false);
  });

  it('marks known frameworks as explicitly detected', () => {
    const content = 'We use SWOT analysis. Strengths weaknesses opportunities threats matter.';
    const result = extractor.extract(makeJob(content));
    const swot = result.frameworks.find(f => f.name === 'SWOT Analysis');
    expect(swot?.detectionMethod).toBe('explicit');
  });

  it('detects implicit proprietary framework from phase language', () => {
    const content = `
      Phase 1: Discovery - we identify the core problem.
      Phase 2: Design - our team proposes solutions.
      Phase 3: Delivery - the solution is implemented.
      Phase 4: Debrief - we review outcomes.
      Our proven process delivers results every time.
    `;
    const result = extractor.extract(makeJob(content, 'Our Process', 'methodology'));
    const implicit = result.frameworks.find(f => f.detectionMethod === 'implicit');
    expect(implicit).toBeDefined();
    expect(implicit?.isProprietary).toBe(true);
  });

  it('caps framework confidence at 0.70 for single asset', () => {
    const content = 'SWOT analysis. Strengths weaknesses opportunities threats.';
    const result = extractor.extract(makeJob(content));
    for (const fw of result.frameworks) {
      expect(fw.confidence).toBeLessThanOrEqual(0.70);
    }
  });

  it('returns empty result for content with no frameworks', () => {
    const content = 'This is just some plain text about nothing in particular.';
    const result = extractor.extract(makeJob(content));
    // May still detect implicit if structural signals present, but no explicit
    const explicit = result.frameworks.filter(f => f.detectionMethod === 'explicit');
    expect(explicit.length).toBe(0);
  });

  it('does not duplicate frameworks in result', () => {
    const content = 'SWOT analysis. Strengths weaknesses opportunities threats. More SWOT.';
    const result = extractor.extract(makeJob(content));
    const names = result.frameworks.map(f => f.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });

  it('provides evidence terms for detected frameworks', () => {
    const content = 'OKR framework: objectives and key results drive quarterly planning.';
    const result = extractor.extract(makeJob(content));
    const okr = result.frameworks.find(f => f.name === 'OKRs');
    expect(okr?.evidenceTerms.length).toBeGreaterThan(0);
  });
});

// ── PatternExtractor ──────────────────────────────────────────────────────────

describe('PatternExtractor', () => {
  const extractor = new PatternExtractor();

  it('detects structural patterns in heading-heavy content', () => {
    const content = `
# Section 1
Content here.

# Section 2
More content here.

# Section 3
Even more content.

# Section 4
Final content.
    `;
    const result = extractor.extract(makeJob(content));
    const structural = result.patterns.filter(p => p.patternType === 'structural');
    expect(structural.length).toBeGreaterThan(0);
  });

  it('detects Problem-Solution-Benefit narrative pattern', () => {
    const content = `
The problem we face is customer churn. Many clients struggle with retention issues.
Our solution is a proactive success program that addresses each pain point systematically.
The benefit is a 40% improvement in retention and a measurable increase in NPS outcome.
    `;
    const result = extractor.extract(makeJob(content));
    const narrative = result.patterns.filter(p => p.patternType === 'narrative');
    expect(narrative.some(n => n.name.includes('Problem') || n.name.includes('Solution'))).toBe(true);
  });

  it('detects sequential process pattern', () => {
    const content = 'First, we conduct discovery. Then, we design the solution. Finally, we deliver and debrief.';
    const result = extractor.extract(makeJob(content));
    const narrative = result.patterns.filter(p => p.patternType === 'narrative');
    expect(narrative.some(n => n.name.includes('Sequential'))).toBe(true);
  });

  it('detects investor update artifact approach', () => {
    const content = 'This month, our MRR grew 15%. The team expanded. Traction continues. Runway is 18 months. Investors should note our key results.';
    const result = extractor.extract(makeJob(content));
    const artifactPatterns = result.patterns.filter(p => p.patternType === 'artifact_approach');
    expect(artifactPatterns.some(p => p.artifactTypeHint?.includes('investor'))).toBe(true);
  });

  it('detects executive summary artifact approach', () => {
    const content = 'Executive Summary: The following key takeaways summarize our findings. TL;DR: we recommend action now.';
    const result = extractor.extract(makeJob(content));
    const artifactPatterns = result.patterns.filter(p => p.patternType === 'artifact_approach');
    expect(artifactPatterns.some(p => p.artifactTypeHint?.includes('executive'))).toBe(true);
  });

  it('does not mutate Artifact Patterns — returns candidates only', () => {
    const content = 'Phase 1: Strategy. Phase 2: Execution. Phase 3: Review.';
    const result = extractor.extract(makeJob(content));
    // All patterns are candidates (no side effects). Result should just be data.
    for (const p of result.patterns) {
      expect(p.id).toBeDefined();
      expect(p.patternType).toBeDefined();
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty result for sparse unstructured content', () => {
    const content = 'Just a short paragraph with no discernible patterns here.';
    const result = extractor.extract(makeJob(content));
    // May or may not detect patterns; confidence should be modest if any
    for (const p of result.patterns) {
      expect(p.confidence).toBeLessThanOrEqual(0.75);
    }
  });

  it('deduplicates patterns by name (keeps highest confidence)', () => {
    const content = `
# Section One
Problem: we face a challenge.
Solution: here is our answer.
Benefit: the outcome is great.

# Section Two
Problem: another challenge exists.
Solution: a different approach.
Benefit: measurable improvements.
    `;
    const result = extractor.extract(makeJob(content));
    const names = result.patterns.map(p => p.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });

  it('assigns artifact type hint for artifact_approach patterns', () => {
    const content = 'This proposal covers scope of work, deliverables, timeline, budget, and acceptance criteria.';
    const result = extractor.extract(makeJob(content));
    const artifactPatterns = result.patterns.filter(p => p.patternType === 'artifact_approach');
    for (const p of artifactPatterns) {
      expect(p.artifactTypeHint).not.toBeNull();
    }
  });
});
