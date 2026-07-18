/**
 * KnowledgeAssetExtractor.ts
 *
 * Stage 0 of the Knowledge Intelligence pipeline.
 *
 * Responsibilities (per Sprint 3 spec):
 *   • Ingest uploaded knowledge assets
 *   • Normalize raw content (text extraction, cleanup, structural detection)
 *   • Classify asset type from input or heuristics
 *   • Create and return an ExtractionJob consumed by downstream extractors
 *
 * Supported asset types (per spec):
 *   playbook | framework | methodology | template | reference
 *
 * Design decisions:
 *   1. No dependency on BrandOS runtime — extractor is self-contained.
 *   2. Content normalization is heuristic (no LLM calls) — consistent with the
 *      "smallest implementation" principle and the constraint that pipeline internals
 *      must not call external AI (signalled by the FeedbackProcessor pattern in Sprint 2).
 *   3. sourceFileRef is treated as a text blob key for Phase 1. Real file I/O
 *      (pulling from storage) is a Sprint 4 / BrandOS Integration concern.
 *   4. If content is empty after normalization, the job is still created but
 *      wordCount = 0 and extraction will produce empty results — KnowledgeValidator
 *      will assign low confidence accordingly.
 *
 * Source: BrandOS Sprint 3 spec.
 * Source: BrandOS_Logical_Intelligence_Schema.md Section I.5.3 (lifecycle: Upload stage).
 */

import type { KnowledgeAssetInput } from '../types/domains';
import type { KnowledgeAssetType } from '../types/entities';
import type {
  ExtractionJob,
  NormalizedContent,
  KnowledgeAssetLifecycleState,
} from './types';

// ── Sentence splitter ─────────────────────────────────────────────────────────
// Simple heuristic: split on '. ', '! ', '? ', and newlines.
// Does not handle abbreviations. Acceptable for Phase 1.

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// ── Structural detection ──────────────────────────────────────────────────────
// Detects markdown-style or plain-text structure signals.

const STRUCTURE_PATTERNS = [
  /^#{1,6}\s/m,         // Markdown headers
  /^\s*[-*•]\s/m,       // Bullet lists
  /^\s*\d+[.)]\s/m,     // Numbered lists
  /^[A-Z][^a-z]{2,}/m,  // ALL-CAPS headings
  /\t/,                  // Tab-delimited tables
];

function detectStructure(text: string): boolean {
  return STRUCTURE_PATTERNS.some(pattern => pattern.test(text));
}

// ── Paragraph splitter ────────────────────────────────────────────────────────

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

// ── Asset type inference ──────────────────────────────────────────────────────
// If the caller doesn't specify an asset type, infer from the title + content.

const TYPE_KEYWORDS: Record<KnowledgeAssetType, RegExp> = {
  playbook:    /\b(playbook|runbook|run ?book|how[-\s]?to|step[-\s]?by[-\s]?step)\b/i,
  framework:   /\b(framework|model|canvas|matrix|lens|principles?|pillars?)\b/i,
  methodology: /\b(methodology|method|process|approach|system|workflow|protocol)\b/i,
  template:    /\b(template|boilerplate|starter|scaffold|format|structure)\b/i,
  reference:   /\b(reference|glossary|guide|handbook|manual|cheat ?sheet|definitions?)\b/i,
  // EM-2.4 (Cognitive Platform Evolution Program): only reachable via this
  // inference fallback when a caller omits assetType entirely — BrandOS's
  // image-analysis call site always specifies 'visual_asset' explicitly
  // (see the audit/program), so this entry mainly exists for
  // Record<KnowledgeAssetType, RegExp> exhaustiveness and any future
  // caller that doesn't.
  visual_asset: /\b(logo|brand ?mark|palette|color ?scheme|typography|font ?family|visual ?identity|moodboard|mood ?board)\b/i,
};

function inferAssetType(title: string, content: string): KnowledgeAssetType {
  const combined = `${title} ${content.slice(0, 500)}`;
  for (const [type, pattern] of Object.entries(TYPE_KEYWORDS)) {
    if (pattern.test(combined)) return type as KnowledgeAssetType;
  }
  // Default: reference is the most generic catch-all
  return 'reference';
}

// ── Content cleaning ──────────────────────────────────────────────────────────

function cleanText(raw: string): string {
  return raw
    // Normalize Windows line endings
    .replace(/\r\n/g, '\n')
    // Collapse runs of 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove non-printable control characters (except newlines and tabs) —
    // the control-character range below is intentional, not accidental.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

// ── Normalizer ────────────────────────────────────────────────────────────────

export function normalizeContent(rawText: string): NormalizedContent {
  const text = cleanText(rawText);
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const words = text.match(/\b\w+\b/g) ?? [];

  return {
    text,
    wordCount: words.length,
    lines,
    sentences: splitSentences(text),
    paragraphs: splitParagraphs(text),
    isStructured: detectStructure(text),
  };
}

// ── KnowledgeAssetExtractor ───────────────────────────────────────────────────

export class KnowledgeAssetExtractor {
  /**
   * Creates an ExtractionJob from a KnowledgeAssetInput.
   *
   * @param input     The raw knowledge asset input from the public API.
   * @param assetId   Pre-generated UUID for the asset (caller-provided so the
   *                  domain store and processor can correlate without a DB round-trip).
   * @param rawContent Raw text content of the asset (the actual document text).
   *                   In Phase 1 this is passed directly by the caller. Phase 2+
   *                   could retrieve it from storage via sourceFileRef.
   * @returns A fully populated ExtractionJob in PROCESSING state.
   */
  createJob(
    input: KnowledgeAssetInput,
    assetId: string,
    rawContent: string,
  ): ExtractionJob {
    const content = normalizeContent(rawContent);
    const assetType = input.assetType ?? inferAssetType(input.title, content.text);
    const lifecycleState: KnowledgeAssetLifecycleState = 'PROCESSING';

    return {
      id:             generateId(),
      assetId,
      ownerType:      input.ownerType,
      userId:         input.userId ?? null,
      projectId:      input.projectId ?? null,
      workspaceId:    input.workspaceId ?? null,
      assetType,
      title:          input.title.trim(),
      content,
      createdAt:      new Date().toISOString(),
      lifecycleState,
    };
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}
