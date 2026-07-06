/**
 * FrameworkExtractor.ts
 *
 * Stage 2 of the Knowledge Intelligence pipeline.
 *
 * Responsibilities (per Sprint 3 spec):
 *   • Detecting named frameworks (explicit detection)
 *   • Detecting recurring methodologies (implicit detection)
 *   • Identifying intellectual models
 *   • Extracting framework descriptions
 *
 * Outputs:
 *   • Framework entities (FrameworkExtractionResult)
 *
 * Design decisions:
 *   1. Two detection modes: explicit (named framework referenced by name) and
 *      implicit (recurring structural/methodological language without explicit name).
 *   2. Known frameworks are checked against a curated list of common professional
 *      frameworks. Matches carry higher initial confidence.
 *   3. Implicit detection looks for: numbered stage/phase sequences, repeated
 *      structured headings, "our [noun] [verb]" proprietary-sounding constructions.
 *   4. Each extracted framework gets a generated UUID. The FrameworkExtractor
 *      produces candidates — User Intelligence domain stores the promoted Framework
 *      entity (per schema I.5.4: "Frameworks detected in a Knowledge Asset are
 *      registered in both").
 *   5. Frameworks extracted from a single asset have confidence ≤ 0.70 per
 *      Contracts B.7 validation rules ("from a single artifact carries Provisional
 *      confidence only"). The Validator may reduce this further.
 *   6. The proprietary flag is set when: (a) the framework is not in the known list,
 *      and (b) the content uses "our", "my", or the user's brand signals.
 *
 * Source: BrandOS Sprint 3 spec.
 * Source: BrandOS_Logical_Intelligence_Schema.md Section B.7 (Framework entity).
 * Source: BrandOS_Logical_Intelligence_Schema.md Section I.5.4 (KA → Framework relationship).
 * Source: BrandOS_Intelligence_Contracts.md Section B (Entity Contracts — Framework).
 */

import type { ExtractionJob } from './types';
import type { ExtractedFramework, FrameworkExtractionResult } from './types';

// ── Known framework vocabulary ────────────────────────────────────────────────
// A curated set of commonly referenced professional frameworks. Explicit
// detection matches these by name in the content.

const KNOWN_FRAMEWORKS: Array<{ name: string; category: ExtractedFramework['category']; terms: string[] }> = [
  // Strategic / analytical
  { name: 'SWOT Analysis',        category: 'analytical',     terms: ['swot', 'strengths', 'weaknesses', 'opportunities', 'threats'] },
  { name: 'OKRs',                 category: 'strategic',      terms: ['okr', 'objectives', 'key results'] },
  { name: 'Jobs To Be Done',      category: 'strategic',      terms: ['jobs to be done', 'jtbd', 'job to be done'] },
  { name: 'Blue Ocean Strategy',  category: 'strategic',      terms: ['blue ocean', 'value innovation', 'eliminate raise reduce create'] },
  { name: 'Porter Five Forces',   category: 'analytical',     terms: ["porter's five forces", 'five forces', 'competitive rivalry', 'buyer power', 'supplier power'] },
  { name: 'BCG Matrix',           category: 'analytical',     terms: ['bcg matrix', 'boston consulting', 'cash cows', 'stars', 'question marks', 'dogs'] },
  { name: 'PESTLE Analysis',      category: 'analytical',     terms: ['pestle', 'pestel', 'political economic social technological'] },
  // Product / methodology
  { name: 'Design Thinking',      category: 'methodological', terms: ['design thinking', 'empathize', 'ideate', 'prototype', 'define stage'] },
  { name: 'Lean Startup',         category: 'methodological', terms: ['lean startup', 'build measure learn', 'validated learning', 'minimum viable product', 'mvp'] },
  { name: 'Agile',                category: 'methodological', terms: ['agile', 'sprint', 'retrospective', 'scrum', 'kanban'] },
  { name: 'Double Diamond',       category: 'creative',       terms: ['double diamond', 'discover define develop deliver'] },
  { name: 'RICE Scoring',         category: 'analytical',     terms: ['rice scoring', 'reach impact confidence effort'] },
  { name: 'Kano Model',           category: 'analytical',     terms: ['kano model', 'must-have', 'performance needs', 'delighters'] },
  // Leadership / communication
  { name: 'STAR Method',          category: 'methodological', terms: ['star method', 'situation task action result'] },
  { name: 'Pyramid Principle',    category: 'strategic',      terms: ['pyramid principle', 'scqa', 'situation complication question answer', 'minto'] },
  { name: 'MECE',                 category: 'analytical',     terms: ['mece', 'mutually exclusive collectively exhaustive'] },
  { name: 'First Principles',     category: 'analytical',     terms: ['first principles', 'first principle thinking'] },
  // Technical
  { name: 'Domain-Driven Design', category: 'technical',      terms: ['domain-driven design', 'ddd', 'bounded context', 'ubiquitous language', 'aggregate root'] },
  { name: 'Event-Driven Architecture', category: 'technical', terms: ['event-driven', 'event bus', 'event sourcing', 'cqrs'] },
  { name: 'Systems Thinking',     category: 'analytical',     terms: ['systems thinking', 'feedback loop', 'causal loop', 'leverage points'] },
];

// ── Implicit framework signals ────────────────────────────────────────────────
// Patterns that suggest an undeclared proprietary framework.

const IMPLICIT_PATTERNS = [
  // Numbered phases / stages (e.g. "Phase 1: ...", "Stage 2: ...")
  /\b(phase|stage|step|level|tier)\s+\d+/gi,
  // Columnar structure signal (A. B. C. or 1. 2. 3. sections)
  /^[A-Z]\.\s+\w+/gm,
  // "Our [Noun] [Verb]" pattern (proprietary process naming)
  /\bour\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(process|approach|model|framework|method|system)\b/gi,
  // Pillar language (3–7 pillars, principles, or elements)
  /\b(three|four|five|six|seven|3|4|5|6|7)\s+(pillars?|principles?|elements?|components?|dimensions?|stages?)\b/gi,
];

// ── Framework description builder ─────────────────────────────────────────────
// Extracts a description by finding context around the first match.

function buildDescription(text: string, term: string, maxLength = 200): string {
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(term.toLowerCase());
  if (idx === -1) return `Framework detected from pattern: ${term}`;

  // Take up to 200 chars around the match
  const start = Math.max(0, idx - 50);
  const end   = Math.min(text.length, idx + term.length + 150);
  const snippet = text.slice(start, end).replace(/\n/g, ' ').trim();
  return snippet.length > maxLength ? snippet.slice(0, maxLength - 3) + '...' : snippet;
}

// ── FrameworkExtractor ────────────────────────────────────────────────────────

export class FrameworkExtractor {
  /**
   * Detects frameworks (explicit and implicit) in the extraction job.
   *
   * Explicit detection: matches known framework vocabulary.
   * Implicit detection: identifies recurring methodological structures.
   *
   * Returns extracted Framework candidates. Does not modify any domain store.
   */
  extract(job: ExtractionJob): FrameworkExtractionResult {
    const { text } = job.content;
    const lowerText = text.toLowerCase();
    const frameworks: ExtractedFramework[] = [];
    const seenNames = new Set<string>();

    // ── Explicit detection ──────────────────────────────────────────────────

    for (const known of KNOWN_FRAMEWORKS) {
      const matchedTerms = known.terms.filter(t => lowerText.includes(t));
      if (matchedTerms.length === 0) continue;

      // Confidence: scales with how many of the known terms appear.
      // Cap at 0.70 per Contracts B.7 (single artifact → Provisional only).
      const rawConfidence = Math.min(0.70, 0.40 + (matchedTerms.length / known.terms.length) * 0.30);

      if (!seenNames.has(known.name)) {
        seenNames.add(known.name);
        frameworks.push({
          id:               generateId(),
          name:             known.name,
          description:      buildDescription(text, matchedTerms[0] ?? known.terms[0] ?? known.name),
          category:         known.category,
          detectionMethod:  'explicit',
          confidence:       Math.round(rawConfidence * 100) / 100,
          evidenceTerms:    matchedTerms,
          isProprietary:    false,
        });
      }
    }

    // ── Implicit detection ──────────────────────────────────────────────────
    // Detect evidence of an undeclared proprietary framework.

    const implicitSignals: string[] = [];
    for (const pattern of IMPLICIT_PATTERNS) {
      const matches = [...text.matchAll(pattern)].map(m => m[0]!);
      implicitSignals.push(...matches);
    }

    if (implicitSignals.length >= 2) {
      // Likely has a proprietary structure.
      // Name it from the document title if possible.
      const implicitName = inferImplicitName(job.title, job.assetType);

      if (!seenNames.has(implicitName)) {
        seenNames.add(implicitName);
        // Confidence for implicit: lower (0.30–0.50) since no confirmed name
        const implicitConfidence = Math.min(0.50, 0.25 + (implicitSignals.length * 0.05));

        frameworks.push({
          id:              generateId(),
          name:            implicitName,
          description:     buildImplicitDescription(implicitSignals),
          category:        inferImplicitCategory(job.assetType),
          detectionMethod: 'implicit',
          confidence:      Math.round(implicitConfidence * 100) / 100,
          evidenceTerms:   [...new Set(implicitSignals.slice(0, 5))],
          isProprietary:   true,  // Implicit = assumed proprietary
        });
      }
    }

    return {
      frameworks,
      frameworkCount: frameworks.length,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferImplicitName(title: string, assetType: string): string {
  // Try to extract a meaningful name from the title
  const cleaned = title
    .replace(/\b(playbook|framework|methodology|template|reference|guide|model)\b/gi, '')
    .trim();
  const suffix = assetType === 'methodology' ? 'Methodology' : 'Framework';
  return cleaned.length > 2 ? `${cleaned} ${suffix}` : `Proprietary ${suffix}`;
}

function inferImplicitCategory(assetType: string): ExtractedFramework['category'] {
  switch (assetType) {
    case 'playbook':    return 'methodological';
    case 'framework':   return 'strategic';
    case 'methodology': return 'methodological';
    case 'template':    return 'creative';
    default:            return 'methodological';
  }
}

function buildImplicitDescription(signals: string[]): string {
  const uniqueSignals = [...new Set(signals.slice(0, 3))];
  return `Proprietary methodology detected from structural patterns: ${uniqueSignals.join(', ')}.`;
}

function generateId(): string {
  return crypto.randomUUID();
}
