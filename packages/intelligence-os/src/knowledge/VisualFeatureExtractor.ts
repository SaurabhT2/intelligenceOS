/**
 * VisualFeatureExtractor.ts
 *
 * Stage 4 of the Knowledge Intelligence pipeline (parallel to Stage 1–3
 * for visual-typed assets).
 *
 * Extracts structured visual features from knowledge assets that include
 * visual content — brand guidelines, design systems, logos, templates.
 *
 * Produces a VisualFeatureExtractionResult with four distinct dimension
 * fields (colors / typography / layout / mood), mirroring the existing
 * extractors' structured result shapes rather than collapsing to a free-text blob.
 *
 * Design decisions:
 *   1. Pure heuristic extraction against text signals — no LLM calls.
 *      Visual feature detection in Phase 1 operates on structured metadata
 *      (hex color declarations, font-family CSS, layout keywords) found in
 *      the text layer of brand documents. True pixel-level analysis (actual
 *      image ingestion) is deferred to a future sprint that adds image
 *      binary support to the pipeline.
 *   2. Visual assets are detected by a combination of assetType ('reference',
 *      'template') and the presence of visual-signal keywords in the content
 *      (color hex codes, font declarations, layout descriptors). A non-visual
 *      asset returns an empty result without error.
 *   3. The result is persisted to KnowledgeAsset.extractedVisualFeatures
 *      (a new JSONB column — see schema migration note below) for reference-
 *      material assets, and/or as a Learning with taxonomyCategory:
 *      'personal_brand_signal' for style/mood signals that should decay and
 *      accumulate confidence like text-voice learnings.
 *   4. Follows the same graceful-degradation contract as VocabularyExtractor:
 *      individual sub-stage failures do not abort extraction; partial results
 *      are returned with errors captured in the caller's KnowledgeStageError[].
 *
 * Schema migration note (E1-4):
 *   A new column `extracted_visual_features JSONB` must be added to
 *   `intelligence.knowledge_assets` before this extractor's output can be
 *   persisted. The migration SQL is:
 *     ALTER TABLE intelligence.knowledge_assets
 *       ADD COLUMN IF NOT EXISTS extracted_visual_features JSONB;
 *   This is additive and safe to apply to existing rows (NULL default).
 *
 * Source: Engineering Roadmap E1-4 (corrected design via ADR-001).
 * Source: ADR-001-VISUAL-INTELLIGENCE.md §4 (extraction-coverage gap).
 */

import type { ExtractionJob } from './types';

// ── Result types ──────────────────────────────────────────────────────────────

/** A single color token detected in the asset. */
export interface ExtractedColor {
  /** Raw value as found in the text (e.g. '#1A2B3C', 'rgb(26, 43, 60)', 'Navy'). */
  value: string;
  /** Normalized lowercase hex, if parseable. Null for named colors we can't parse. */
  hex: string | null;
  /** Usage context hint extracted from surrounding text. */
  contextHint: string | null;
  /** True if this color appears multiple times in the document. */
  isRecurring: boolean;
}

/** Typography signals extracted from the asset. */
export interface ExtractedTypography {
  /** Font family names mentioned (e.g. 'Inter', 'Helvetica Neue'). */
  fontFamilies: string[];
  /** Size keywords: 'small', 'medium', 'large', 'xl', or explicit px/rem values. */
  sizeHints: string[];
  /** Detected weight keywords: 'light', 'regular', 'medium', 'semibold', 'bold', 'black'. */
  weightHints: string[];
  /** True if the document explicitly references a type scale. */
  hasTypeScale: boolean;
}

/** Layout dimension signals. */
export interface ExtractedLayout {
  /**
   * Detected density hint from the document: 'dense', 'balanced', or 'spacious'.
   * Based on whitespace/padding/margin language in the text.
   */
  densityHint: 'dense' | 'balanced' | 'spacious' | null;
  /** True if a grid system is referenced. */
  hasGrid: boolean;
  /** Column count hint if mentioned (e.g. '12-column grid' → 12). Null if not mentioned. */
  columnCount: number | null;
  /** True if the document mentions responsive design or breakpoints. */
  isResponsive: boolean;
}

/** Visual mood / aesthetic signals. */
export interface ExtractedMood {
  /**
   * Detected tone keywords that describe the visual aesthetic.
   * Examples: 'minimalist', 'bold', 'playful', 'professional', 'warm', 'cool'.
   */
  toneKeywords: string[];
  /**
   * Industry aesthetic signals: 'corporate', 'startup', 'creative', 'technical',
   * 'luxury', 'friendly'. Derived from vocabulary patterns.
   */
  aestheticSignals: string[];
  /** True if the document references a specific visual identity system. */
  hasIdentitySystem: boolean;
}

/** Structured result from VisualFeatureExtractor.extract(). */
export interface VisualFeatureExtractionResult {
  colors:     ExtractedColor[];
  typography: ExtractedTypography;
  layout:     ExtractedLayout;
  mood:       ExtractedMood;
  /** Total distinct color tokens detected. */
  colorCount: number;
  /** True when the asset contains enough visual signals to justify extraction. */
  isVisualAsset: boolean;
}

// ── Detection patterns ────────────────────────────────────────────────────────

/** Hex color regex: #RGB, #RRGGBB, #RRGGBBAA */
const HEX_COLOR_RE = /#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b/g;

/** RGB/RGBA color functions */
const RGB_COLOR_RE = /\brgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/gi;

/** Named color keywords with high brand signal value */
const NAMED_COLOR_KEYWORDS = [
  'navy', 'teal', 'coral', 'crimson', 'indigo', 'slate', 'emerald', 'amber',
  'violet', 'magenta', 'turquoise', 'maroon', 'olive', 'lavender', 'salmon',
];

/** Font-related vocabulary */
const FONT_FAMILY_RE = /\b(?:font-family|typeface|font)\s*[:=]?\s*["']?([A-Za-z][A-Za-z0-9 \-]+?)["']?(?:[,;)]|\s+\d|\s+(?:bold|light|regular|italic))/gi;

const KNOWN_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Nunito', 'Poppins',
  'Source Sans', 'Raleway', 'Oswald', 'Merriweather', 'Playfair Display',
  'Helvetica', 'Arial', 'Georgia', 'Times New Roman', 'Futura', 'Gotham',
  'Proxima Nova', 'Circular', 'GT Walsheim', 'Neue Haas Grotesk',
];

const WEIGHT_KEYWORDS_RE = /\b(thin|extra-?light|light|regular|normal|medium|semi-?bold|bold|extra-?bold|black|heavy)\b/gi;

const TYPE_SCALE_RE = /\b(?:typography\s*scale|type\s*scale|heading\s*h[1-6]|font\s*size\s*(?:hierarchy|system)|text\s*styles?)\b/i;

const DENSITY_PATTERNS: Array<{ re: RegExp; density: 'dense' | 'balanced' | 'spacious' }> = [
  { re: /\b(?:dense|compact|tight|condensed|packed)\b/i,              density: 'dense' },
  { re: /\b(?:spacious|airy|generous|open|breathing|white space)\b/i, density: 'spacious' },
  { re: /\b(?:balanced|comfortable|moderate)\b/i,                     density: 'balanced' },
];

const GRID_RE = /\b(?:grid\s*system|column\s*grid|baseline\s*grid|\d+-?column)\b/i;
const COLUMN_COUNT_RE = /\b(\d+)-?column\b/i;
const RESPONSIVE_RE = /\b(?:responsive|breakpoint|mobile-first|adaptive)\b/i;

const MOOD_TONE_MAP: Array<{ re: RegExp; tone: string }> = [
  { re: /\b(?:minimal|minimalist|clean|simple|stripped)\b/i,                      tone: 'minimalist' },
  { re: /\b(?:bold|impactful|strong|powerful|assertive)\b/i,                       tone: 'bold' },
  { re: /\b(?:playful|fun|energetic|vibrant|lively)\b/i,                           tone: 'playful' },
  { re: /\b(?:professional|formal|serious|authoritative|refined)\b/i,              tone: 'professional' },
  { re: /\b(?:warm|friendly|approachable|welcoming|human)\b/i,                     tone: 'warm' },
  { re: /\b(?:cool|modern|tech|sleek|cutting-edge)\b/i,                            tone: 'cool' },
  { re: /\b(?:luxur|premium|exclusive|high-end|sophisticat)/i,                     tone: 'luxury' },
  { re: /\b(?:innovative|forward-looking|future|progressive|disruptive)\b/i,       tone: 'innovative' },
  { re: /\b(?:trustworthy|reliable|dependable|stable|established)\b/i,             tone: 'trustworthy' },
];

const AESTHETIC_SIGNAL_MAP: Array<{ re: RegExp; signal: string }> = [
  { re: /\b(?:enterprise|corporate|b2b|business|institutional)\b/i,                signal: 'corporate' },
  { re: /\b(?:startup|scale-up|growth|disrupt|innovate|agile)\b/i,                 signal: 'startup' },
  { re: /\b(?:creative|agency|studio|design-led|brand)\b/i,                        signal: 'creative' },
  { re: /\b(?:technical|developer|api|code|engineering|platform)\b/i,              signal: 'technical' },
  { re: /\b(?:luxury|premium|high-end|bespoke|curated)\b/i,                        signal: 'luxury' },
  { re: /\b(?:consumer|user-friendly|accessible|inclusive|community)\b/i,          signal: 'friendly' },
];

const IDENTITY_SYSTEM_RE = /\b(?:brand\s*(?:identity|system|guidelines?|book|standards?)|visual\s*identity|style\s*guide|design\s*system)\b/i;

/** Minimum visual keyword count to classify an asset as visual. */
const MIN_VISUAL_SIGNALS = 2;

// ── Extractor class ───────────────────────────────────────────────────────────

export class VisualFeatureExtractor {
  /**
   * Extracts visual features from an ExtractionJob.
   *
   * Returns an empty result (isVisualAsset=false) for non-visual assets.
   * Never throws — callers handle graceful degradation.
   */
  extract(job: ExtractionJob): VisualFeatureExtractionResult {
    const text = job.content.text;

    const colorSignals = this.extractColors(text);
    const typography   = this.extractTypography(text);
    const layout       = this.extractLayout(text);
    const mood         = this.extractMood(text);

    // Determine if this is actually a visual asset based on total signal count.
    const totalSignals =
      colorSignals.length +
      typography.fontFamilies.length +
      (layout.hasGrid ? 1 : 0) +
      mood.toneKeywords.length +
      (mood.hasIdentitySystem ? 2 : 0);

    const isVisualAsset = totalSignals >= MIN_VISUAL_SIGNALS;

    if (!isVisualAsset) {
      return this.emptyResult();
    }

    return {
      colors:     colorSignals,
      typography,
      layout,
      mood,
      colorCount: colorSignals.length,
      isVisualAsset: true,
    };
  }

  // ── Color extraction ────────────────────────────────────────────────────────

  private extractColors(text: string): ExtractedColor[] {
    const seen = new Map<string, { count: number; contextHint: string | null }>();

    // Hex colors
    for (const match of text.matchAll(HEX_COLOR_RE)) {
      const raw = match[0].toLowerCase();
      const existing = seen.get(raw);
      const context  = this.extractContext(text, match.index ?? 0, 40);
      seen.set(raw, {
        count:       (existing?.count ?? 0) + 1,
        contextHint: existing?.contextHint ?? context,
      });
    }

    // RGB colors — normalize to a string key
    for (const match of text.matchAll(RGB_COLOR_RE)) {
      const raw = match[0].toLowerCase().replace(/\s+/g, '');
      const existing = seen.get(raw);
      const context  = this.extractContext(text, match.index ?? 0, 40);
      seen.set(raw, {
        count:       (existing?.count ?? 0) + 1,
        contextHint: existing?.contextHint ?? context,
      });
    }

    // Named colors
    for (const name of NAMED_COLOR_KEYWORDS) {
      const re = new RegExp(`\\b${name}\\b`, 'gi');
      let matchResult;
      let count = 0;
      let contextHint: string | null = null;
      while ((matchResult = re.exec(text)) !== null) {
        count++;
        if (!contextHint) {
          contextHint = this.extractContext(text, matchResult.index, 40);
        }
      }
      if (count > 0) {
        const key = name.toLowerCase();
        const existing = seen.get(key);
        seen.set(key, {
          count:       (existing?.count ?? 0) + count,
          contextHint: existing?.contextHint ?? contextHint,
        });
      }
    }

    return Array.from(seen.entries()).map(([value, { count, contextHint }]) => ({
      value,
      hex:         value.startsWith('#') ? this.normalizeHex(value) : null,
      contextHint,
      isRecurring: count > 1,
    }));
  }

  private normalizeHex(raw: string): string {
    // Already lowercase from above. Expand shorthand #RGB → #RRGGBB.
    const v = raw.replace('#', '');
    if (v.length === 3) {
      return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
    }
    return raw; // 6 or 8 chars — already canonical
  }

  private extractContext(text: string, index: number, radius: number): string | null {
    const start = Math.max(0, index - radius);
    const end   = Math.min(text.length, index + radius);
    const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
    return snippet.length > 0 ? snippet : null;
  }

  // ── Typography extraction ───────────────────────────────────────────────────

  private extractTypography(text: string): ExtractedTypography {
    const fontFamilies = new Set<string>();

    // Match CSS-style font-family declarations
    for (const match of text.matchAll(FONT_FAMILY_RE)) {
      const name = match[1]?.trim();
      if (name && name.length > 1) {
        fontFamilies.add(name);
      }
    }

    // Check for known fonts by name
    for (const font of KNOWN_FONTS) {
      if (new RegExp(`\\b${font.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text)) {
        fontFamilies.add(font);
      }
    }

    // Size hints
    const sizeHints: string[] = [];
    const sizePatternsRe = /\b(\d+(?:\.\d+)?(?:px|rem|em|pt))\b/gi;
    for (const m of text.matchAll(sizePatternsRe)) {
      const val = m[1];
      if (val) sizeHints.push(val);
    }
    // Keyword size hints
    for (const kw of ['small', 'medium', 'large', 'xl', '2xl', '3xl']) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(text)) {
        sizeHints.push(kw);
      }
    }

    // Weight hints
    const weightHints: string[] = [];
    for (const m of text.matchAll(WEIGHT_KEYWORDS_RE)) {
      const val = m[1];
      if (val) weightHints.push(val.toLowerCase());
    }

    return {
      fontFamilies: Array.from(fontFamilies),
      sizeHints:    [...new Set(sizeHints)],
      weightHints:  [...new Set(weightHints)],
      hasTypeScale: TYPE_SCALE_RE.test(text),
    };
  }

  // ── Layout extraction ───────────────────────────────────────────────────────

  private extractLayout(text: string): ExtractedLayout {
    let densityHint: 'dense' | 'balanced' | 'spacious' | null = null;
    for (const { re, density } of DENSITY_PATTERNS) {
      if (re.test(text)) {
        densityHint = density;
        break;
      }
    }

    const hasGrid = GRID_RE.test(text);

    let columnCount: number | null = null;
    const colMatch = COLUMN_COUNT_RE.exec(text);
    if (colMatch && colMatch[1]) {
      const n = parseInt(colMatch[1], 10);
      if (!isNaN(n) && n > 0 && n <= 24) {
        columnCount = n;
      }
    }

    return {
      densityHint,
      hasGrid,
      columnCount,
      isResponsive: RESPONSIVE_RE.test(text),
    };
  }

  // ── Mood extraction ─────────────────────────────────────────────────────────

  private extractMood(text: string): ExtractedMood {
    const toneKeywords: string[] = [];
    for (const { re, tone } of MOOD_TONE_MAP) {
      if (re.test(text)) {
        toneKeywords.push(tone);
      }
    }

    const aestheticSignals: string[] = [];
    for (const { re, signal } of AESTHETIC_SIGNAL_MAP) {
      if (re.test(text)) {
        aestheticSignals.push(signal);
      }
    }

    return {
      toneKeywords:     [...new Set(toneKeywords)],
      aestheticSignals: [...new Set(aestheticSignals)],
      hasIdentitySystem: IDENTITY_SYSTEM_RE.test(text),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private emptyResult(): VisualFeatureExtractionResult {
    return {
      colors:     [],
      typography: { fontFamilies: [], sizeHints: [], weightHints: [], hasTypeScale: false },
      layout:     { densityHint: null, hasGrid: false, columnCount: null, isResponsive: false },
      mood:       { toneKeywords: [], aestheticSignals: [], hasIdentitySystem: false },
      colorCount:    0,
      isVisualAsset: false,
    };
  }
}
