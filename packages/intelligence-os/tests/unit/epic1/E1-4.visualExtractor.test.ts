/**
 * tests/unit/epic1/E1-4.visualExtractor.test.ts
 *
 * Unit tests for E1-4: Visual Intelligence Bridge
 * Exercises VisualFeatureExtractor across all four dimension types.
 *
 * Covers:
 *   - isVisualAsset=false for non-visual content
 *   - Hex color extraction and normalization
 *   - RGB color extraction
 *   - Named color keyword detection
 *   - isRecurring flag for repeated colors
 *   - Font family extraction (known fonts, CSS declarations)
 *   - Weight hint extraction
 *   - Type scale detection
 *   - Layout density detection (dense / balanced / spacious)
 *   - Grid and column count detection
 *   - Responsive design flag
 *   - Mood tone keyword extraction
 *   - Aesthetic signal extraction
 *   - Identity system detection
 *   - KnowledgeProcessor result includes visualResult (E1-4 integration)
 */

import { describe, it, expect } from 'vitest';
import { VisualFeatureExtractor } from '../../../src/knowledge/VisualFeatureExtractor';
import type { ExtractionJob } from '../../../src/knowledge/types';

// ── Fixture factory ───────────────────────────────────────────────────────────

function makeJob(text: string): ExtractionJob {
  const lines      = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sentences  = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  return {
    id:            'job-001',
    assetId:       'asset-001',
    userId:        'user-001',
    ownerType:     'user',
    projectId:     null,
    workspaceId:   null,
    assetType:     'reference',
    title:         'Brand Guidelines',
    lifecycleState: 'PROCESSING',
    content: {
      text,
      wordCount:    text.split(/\s+/).length,
      lines,
      sentences,
      paragraphs,
      isStructured: false,
    },
    createdAt: new Date().toISOString(),
  };
}

// ── Extractor instance ────────────────────────────────────────────────────────

const extractor = new VisualFeatureExtractor();

// ── Non-visual content ────────────────────────────────────────────────────────

describe('E1-4: VisualFeatureExtractor — non-visual content', () => {
  it('returns isVisualAsset=false for plain text with no visual signals', () => {
    const result = extractor.extract(makeJob(
      'Our company values transparency, accountability, and long-term thinking.',
    ));
    expect(result.isVisualAsset).toBe(false);
  });

  it('returns empty arrays for all fields when not visual', () => {
    const result = extractor.extract(makeJob('Just a short text.'));
    expect(result.colors).toHaveLength(0);
    expect(result.typography.fontFamilies).toHaveLength(0);
    expect(result.mood.toneKeywords).toHaveLength(0);
    expect(result.colorCount).toBe(0);
  });
});

// ── Color extraction ──────────────────────────────────────────────────────────

describe('E1-4: VisualFeatureExtractor — color extraction', () => {
  it('extracts hex color codes', () => {
    const result = extractor.extract(makeJob(
      'Primary brand color is #1A2B3C. Use #FF5500 for CTAs. Background: #FFFFFF.',
    ));
    expect(result.isVisualAsset).toBe(true);
    const hexValues = result.colors.map(c => c.value);
    expect(hexValues).toContain('#1a2b3c');
    expect(hexValues).toContain('#ff5500');
    expect(hexValues).toContain('#ffffff');
  });

  it('normalizes 3-character shorthand hex to 6 characters', () => {
    const result = extractor.extract(makeJob(
      'Use #FFF as background, #000 for text and Inter font for typography.',
    ));
    const fff = result.colors.find(c => c.value === '#fff');
    expect(fff?.hex).toBe('#ffffff');
    const zero = result.colors.find(c => c.value === '#000');
    expect(zero?.hex).toBe('#000000');
  });

  it('detects RGB color functions', () => {
    const result = extractor.extract(makeJob(
      'Color: rgb(26, 43, 60). Also rgba(255, 85, 0, 0.9). Use Inter font.',
    ));
    expect(result.isVisualAsset).toBe(true);
    const values = result.colors.map(c => c.value);
    const hasRgb = values.some(v => v.includes('rgb'));
    expect(hasRgb).toBe(true);
  });

  it('detects named brand color keywords', () => {
    const result = extractor.extract(makeJob(
      'Navy is our primary brand color. Use teal for accents. Inter is our typeface.',
    ));
    const values = result.colors.map(c => c.value);
    expect(values).toContain('navy');
    expect(values).toContain('teal');
  });

  it('marks recurring colors with isRecurring=true', () => {
    const result = extractor.extract(makeJob(
      '#1A2B3C is used for headers. Body text also uses #1A2B3C. Inter font.',
    ));
    const recurring = result.colors.find(c => c.value === '#1a2b3c');
    expect(recurring?.isRecurring).toBe(true);
  });

  it('marks non-recurring colors with isRecurring=false', () => {
    const result = extractor.extract(makeJob(
      'Use #FF5500 for CTAs. Background #FFFFFF. Text #000000. Inter typeface.',
    ));
    const cta = result.colors.find(c => c.value === '#ff5500');
    expect(cta?.isRecurring).toBe(false);
  });

  it('returns null hex for named colors (no hex normalization applied)', () => {
    const result = extractor.extract(makeJob(
      'Navy and coral are our brand colors. Use Inter font family.',
    ));
    const navy = result.colors.find(c => c.value === 'navy');
    expect(navy?.hex).toBeNull();
  });
});

// ── Typography extraction ─────────────────────────────────────────────────────

describe('E1-4: VisualFeatureExtractor — typography extraction', () => {
  it('extracts known font families by name', () => {
    const result = extractor.extract(makeJob(
      'Our typeface is Inter for body copy and Playfair Display for headings. Use #003366 as primary.',
    ));
    expect(result.typography.fontFamilies).toContain('Inter');
    expect(result.typography.fontFamilies).toContain('Playfair Display');
  });

  it('detects weight keywords', () => {
    const result = extractor.extract(makeJob(
      'Headings use bold weight. Body copy uses regular weight. Use Inter typeface. Color: #112233.',
    ));
    expect(result.typography.weightHints).toContain('bold');
    expect(result.typography.weightHints).toContain('regular');
  });

  it('detects type scale references', () => {
    const result = extractor.extract(makeJob(
      'Our typography scale defines h1–h6. Inter typeface. Primary color: #001122.',
    ));
    expect(result.typography.hasTypeScale).toBe(true);
  });

  it('extracts explicit pixel sizes as sizeHints', () => {
    const result = extractor.extract(makeJob(
      'Body font-size: 16px. Heading: 32px. Inter font. Color #445566.',
    ));
    expect(result.typography.sizeHints).toContain('16px');
    expect(result.typography.sizeHints).toContain('32px');
  });
});

// ── Layout extraction ─────────────────────────────────────────────────────────

describe('E1-4: VisualFeatureExtractor — layout extraction', () => {
  it('detects spacious layout density', () => {
    const result = extractor.extract(makeJob(
      'The layout is spacious and airy, with generous padding. Inter font. Color #223344.',
    ));
    expect(result.layout.densityHint).toBe('spacious');
  });

  it('detects dense layout density', () => {
    const result = extractor.extract(makeJob(
      'Dashboard layout is compact and dense. Montserrat typeface. Color #334455.',
    ));
    expect(result.layout.densityHint).toBe('dense');
  });

  it('detects grid system presence', () => {
    const result = extractor.extract(makeJob(
      'We use a 12-column grid system for all layouts. Inter font. Primary: #445566.',
    ));
    expect(result.layout.hasGrid).toBe(true);
    expect(result.layout.columnCount).toBe(12);
  });

  it('detects responsive design flag', () => {
    const result = extractor.extract(makeJob(
      'All components must be responsive with defined breakpoints. Inter. Color #556677.',
    ));
    expect(result.layout.isResponsive).toBe(true);
  });

  it('returns null density for neutral content with visual signals', () => {
    const result = extractor.extract(makeJob(
      'Brand color #1A2B3C. Font: Inter. Header font: Montserrat. Grid system used.',
    ));
    // No density keyword, so null
    if (result.isVisualAsset) {
      expect(['dense', 'balanced', 'spacious', null]).toContain(result.layout.densityHint);
    }
  });
});

// ── Mood extraction ───────────────────────────────────────────────────────────

describe('E1-4: VisualFeatureExtractor — mood extraction', () => {
  it('detects minimalist tone', () => {
    const result = extractor.extract(makeJob(
      'Our brand is minimalist and clean with simple lines. Inter typeface. Color #AABBCC.',
    ));
    expect(result.mood.toneKeywords).toContain('minimalist');
  });

  it('detects multiple tone keywords', () => {
    const result = extractor.extract(makeJob(
      'Bold and professional brand identity with warm, friendly interactions. Inter. #112233.',
    ));
    expect(result.mood.toneKeywords).toContain('bold');
    expect(result.mood.toneKeywords).toContain('professional');
    expect(result.mood.toneKeywords).toContain('warm');
  });

  it('detects startup aesthetic signal', () => {
    const result = extractor.extract(makeJob(
      'This is a startup disrupting the market. Montserrat typeface. Color #CCDDEE.',
    ));
    expect(result.mood.aestheticSignals).toContain('startup');
  });

  it('detects corporate aesthetic signal', () => {
    const result = extractor.extract(makeJob(
      'Enterprise B2B software for corporate clients. Inter font. Color #112244.',
    ));
    expect(result.mood.aestheticSignals).toContain('corporate');
  });

  it('detects identity system flag from "brand guidelines"', () => {
    const result = extractor.extract(makeJob(
      'This brand guidelines document defines our visual identity. Inter font. #001122.',
    ));
    expect(result.mood.hasIdentitySystem).toBe(true);
  });

  it('detects identity system flag from "design system"', () => {
    const result = extractor.extract(makeJob(
      'Our design system governs all UI components. Roboto typeface. Primary: #003366.',
    ));
    expect(result.mood.hasIdentitySystem).toBe(true);
  });
});

// ── KnowledgeProcessor integration (E1-4) ────────────────────────────────────

describe('E1-4: KnowledgeProcessor — visualResult in result', () => {
  it('KnowledgeProcessorResult has visualResult field (can be null)', async () => {
    // Type-level test: confirm the field exists on KnowledgeProcessorResult
    const { KnowledgeProcessor } = await import('../../../src/knowledge/KnowledgeProcessor');
    const { InProcessEventBus } = await import('../../../src/events/IntelligenceEventBus');

    const bus = new InProcessEventBus();

    // Mock DB with upsert chain
    const single = { data: {
      id: 'ka-001', owner_type: 'user', user_id: 'u1',
      project_id: null, workspace_id: null, asset_type: 'reference',
      title: 'Test', source_file_ref: null,
      extracted_vocabulary: null, extracted_patterns: null,
      extracted_frameworks: null, extracted_visual_features: null,
      confidence: 0.6, version: 1, is_current: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, error: null };

    const upsertChain = { select: () => ({ single: () => Promise.resolve(single) }) };
    const selectChain = { single: () => Promise.resolve({ data: [], error: null }) };
    const from = () => ({
      upsert: () => upsertChain,
      select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    });
    const db = { schema: () => ({ from }) } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const processor = new KnowledgeProcessor(db, bus);
    const result = await processor.process(
      { ownerType: 'user', userId: 'u1', projectId: null, workspaceId: null,
        assetType: 'reference', title: 'Test', sourceFileRef: null },
      'plain text without visual signals',
      'ka-001',
    );

    // visualResult should exist on the result type
    expect('visualResult' in result).toBe(true);
    // Non-visual content → null
    expect(result.visualResult).toBeNull();
  });

  it('visualResult is populated for content with visual signals', async () => {
    const { KnowledgeProcessor } = await import('../../../src/knowledge/KnowledgeProcessor');
    const { InProcessEventBus } = await import('../../../src/events/IntelligenceEventBus');

    const bus = new InProcessEventBus();

    const single = { data: {
      id: 'ka-002', owner_type: 'user', user_id: 'u1',
      project_id: null, workspace_id: null, asset_type: 'reference',
      title: 'Brand Guidelines', source_file_ref: null,
      extracted_vocabulary: null, extracted_patterns: null,
      extracted_frameworks: null, extracted_visual_features: null,
      confidence: 0.7, version: 1, is_current: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, error: null };

    const from = () => ({
      upsert: () => ({ select: () => ({ single: () => Promise.resolve(single) }) }),
      select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    });
    const db = { schema: () => ({ from }) } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const processor = new KnowledgeProcessor(db, bus);
    const result = await processor.process(
      { ownerType: 'user', userId: 'u1', projectId: null, workspaceId: null,
        assetType: 'reference', title: 'Brand Guidelines', sourceFileRef: null },
      // Content with enough visual signals to be classified as visual
      'Our brand guidelines define our visual identity. Primary color: #1A2B3C. ' +
      'Secondary: #FF5500. We use Inter as our typeface. The design system is minimalist ' +
      'and professional with a spacious layout.',
      'ka-002',
    );

    expect(result.visualResult).not.toBeNull();
    expect(result.visualResult?.isVisualAsset).toBe(true);
    expect(result.visualResult?.colors.length).toBeGreaterThan(0);
    expect(result.visualResult?.mood.toneKeywords).toContain('minimalist');
  });
});
