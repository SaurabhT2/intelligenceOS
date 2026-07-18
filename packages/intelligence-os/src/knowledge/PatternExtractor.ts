/**
 * PatternExtractor.ts
 *
 * Stage 3 of the Knowledge Intelligence pipeline.
 *
 * Responsibilities (per Sprint 3 spec):
 *   • Identifying structural patterns (document/section organization)
 *   • Identifying recurring narrative structures (how arguments are built)
 *   • Identifying repeatable artifact approaches
 *
 * Outputs:
 *   • Knowledge Patterns (pattern candidates, stored in KnowledgeAsset.extractedPatterns)
 *   • Artifact Pattern candidates (flagged for Artifact Intelligence review)
 *
 * CRITICAL CONSTRAINT — per spec:
 *   "Do not directly mutate Artifact Patterns. Produce candidates only."
 *
 * Design decisions:
 *   1. Structural patterns: detected from heading density, list usage, and
 *      section regularity. The presence of regular heading hierarchies signals
 *      a structural template pattern.
 *   2. Narrative patterns: detected from transition/connector words
 *      ("First... Then... Finally...", "Problem... Solution...", cause-effect chains).
 *   3. Artifact approach patterns: detected when the content appears to be a
 *      complete artifact template (has a title block, sections, and calls to action).
 *   4. Pattern confidence: structural patterns detected by multiple signals
 *      carry higher confidence (0.55–0.75). Single-signal patterns cap at 0.45.
 *   5. All patterns are candidates only — they are stored on the KnowledgeAsset
 *      record and do not touch the intelligence.artifact_patterns table.
 *
 * Source: BrandOS Sprint 3 spec.
 * Source: BrandOS_Logical_Intelligence_Schema.md Section I.5.2 (Knowledge Pattern entity).
 * Source: BrandOS_Intelligence_Contracts.md Section E.4 (Structural patterns → Artifact Intelligence).
 */

import type { ExtractionJob } from './types';
import type {
  ExtractedPattern,
  PatternExtractionResult,
  PatternType,
} from './types';

// ── Structural pattern signals ────────────────────────────────────────────────

// Headings: markdown-style (#, ##, ###) or numbered (1. 2.) or ALLCAPS
const HEADING_PATTERNS = [
  /^#{1,6}\s+\w+/gm,
  /^\d+\.\s+[A-Z]\w+/gm,
  /^[A-Z][A-Z\s]{3,}$/gm,
];

// Section regularity: headings of similar depth recurring multiple times
function countHeadings(text: string): number {
  let count = 0;
  for (const pattern of HEADING_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    count += matches.length;
  }
  return count;
}

// List density: ratio of list lines to total lines
function listDensity(lines: string[]): number {
  if (lines.length === 0) return 0;
  const listLines = lines.filter(l => /^[-*•]\s|^\d+[.)]\s/.test(l)).length;
  return listLines / lines.length;
}

// ── Narrative pattern signals ─────────────────────────────────────────────────

interface NarrativeTemplate {
  name: string;
  description: string;
  pattern: RegExp;
  elements: string[];
}

const NARRATIVE_TEMPLATES: NarrativeTemplate[] = [
  {
    name: 'Problem-Solution-Benefit',
    description: 'Identifies a problem, proposes a solution, and articulates the benefit.',
    pattern: /\b(problem|challenge|issue|pain|struggle)\b.{0,500}\b(solution|approach|answer|resolve)\b.{0,500}\b(benefit|result|outcome|impact)\b/is,
    elements: ['problem', 'solution', 'benefit'],
  },
  {
    name: 'Situation-Complication-Resolution',
    description: 'Classic pyramid principle: frames current state, introduces tension, resolves it.',
    pattern: /\b(situation|context|background|currently)\b.{0,400}\b(however|but|complication|challenge|issue|gap)\b.{0,400}\b(therefore|thus|recommend|action|next step)\b/is,
    elements: ['situation', 'complication', 'resolution'],
  },
  {
    name: 'Sequential Process Narrative',
    description: 'Step-by-step process with ordered transitions.',
    pattern: /\b(first|step 1|phase 1|begin|start)\b.{0,300}\b(then|next|second|step 2|phase 2)\b.{0,300}\b(finally|lastly|step 3|phase 3|complete|done)\b/is,
    elements: ['first', 'then', 'finally'],
  },
  {
    name: 'Claim-Evidence-Conclusion',
    description: 'Analytical narrative: asserts a claim, provides evidence, draws a conclusion.',
    pattern: /\b(because|since|given that|evidence|data shows?|research|studies?)\b.{0,400}\b(therefore|conclude|in conclusion|as a result|this means?)\b/is,
    elements: ['evidence', 'conclusion'],
  },
  {
    name: 'Before-After-Bridge',
    description: 'Before/after transformation narrative common in persuasive content.',
    pattern: /\b(before|currently|today|pain|struggle|status quo)\b.{0,500}\b(after|future|vision|goal|transformed|new)\b/is,
    elements: ['before', 'after'],
  },
];

// ── Artifact approach signals ─────────────────────────────────────────────────
// Detects that the document itself is a template for a specific artifact type.

interface ArtifactApproachSignal {
  artifactTypeHint: string;
  pattern: RegExp;
}

const ARTIFACT_SIGNALS: ArtifactApproachSignal[] = [
  { artifactTypeHint: 'investor_update',      pattern: /\b(traction|runway|mrr|arr|investors?|fundrais|metrics|key results|team update)\b/i },
  { artifactTypeHint: 'executive_summary',    pattern: /\b(executive summary|tldr|tl;dr|key takeaways?|in brief|summary)\b/i },
  { artifactTypeHint: 'strategy_document',    pattern: /\b(strategic priorities|roadmap|strategic plan|vision and mission|goals and objectives)\b/i },
  { artifactTypeHint: 'case_study',           pattern: /\b(client story|case study|customer story|challenge solution result|before after)\b/i },
  { artifactTypeHint: 'project_brief',        pattern: /\b(project brief|scope|deliverables|stakeholders|timeline|budget|success criteria)\b/i },
  { artifactTypeHint: 'proposal',             pattern: /\b(proposal|proposed approach|investment|scope of work|sow|terms and conditions|acceptance)\b/i },
  { artifactTypeHint: 'research_report',      pattern: /\b(methodology|findings|recommendations|literature review|abstract|hypothesis|conclusion)\b/i },
];

// ── PatternExtractor ──────────────────────────────────────────────────────────

export class PatternExtractor {
  /**
   * Extracts structural, narrative, and artifact approach patterns from the
   * extraction job's normalized content.
   *
   * All outputs are candidates only. No ArtifactPattern records are mutated.
   */
  extract(job: ExtractionJob): PatternExtractionResult {
    const patterns: ExtractedPattern[] = [];
    const { text, lines, paragraphs, isStructured } = job.content;

    // ── Structural pattern detection ──────────────────────────────────────

    const headingCount = countHeadings(text);
    const listRatio    = listDensity(lines);
    const hasRegularHeadings = headingCount >= 3;
    const hasListStructure   = listRatio > 0.15;

    if (isStructured && (hasRegularHeadings || hasListStructure)) {
      const signals: string[] = [];
      if (hasRegularHeadings) signals.push(`${headingCount} section headings`);
      if (hasListStructure)   signals.push(`${Math.round(listRatio * 100)}% list formatting`);

      const confidence = hasRegularHeadings && hasListStructure ? 0.70 : 0.50;

      patterns.push(createPattern(
        'structural',
        deriveStructuralName(job.title, job.assetType),
        `Structured document with ${signals.join(' and ')}.`,
        confidence,
        signals,
        true,
        null,
      ));
    }

    // ── Narrative pattern detection ───────────────────────────────────────

    for (const template of NARRATIVE_TEMPLATES) {
      if (template.pattern.test(text)) {
        // How strongly: count matches across paragraphs
        const matchingParagraphs = paragraphs.filter(p => template.pattern.test(p)).length;
        const confidence = Math.min(0.70, 0.40 + matchingParagraphs * 0.10);

        patterns.push(createPattern(
          'narrative',
          template.name,
          template.description,
          Math.round(confidence * 100) / 100,
          template.elements,
          matchingParagraphs >= 2,
          null,
        ));
      }
    }

    // ── Artifact approach detection ───────────────────────────────────────

    for (const signal of ARTIFACT_SIGNALS) {
      if (signal.pattern.test(text)) {
        // Additional confidence signal: does the document look like a complete
        // artifact (has both structure AND this artifact signal)?
        const confidence = isStructured ? 0.60 : 0.40;

        patterns.push(createPattern(
          'artifact_approach',
          `${formatArtifactType(signal.artifactTypeHint)} Approach Pattern`,
          `Content contains signals consistent with a ${formatArtifactType(signal.artifactTypeHint)} artifact approach.`,
          confidence,
          [signal.artifactTypeHint],
          false,
          signal.artifactTypeHint,
        ));
      }
    }

    // Deduplicate by name (keep highest confidence)
    const deduped = deduplicateByName(patterns);

    return {
      patterns: deduped,
      patternCount: deduped.length,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function createPattern(
  patternType: PatternType,
  name: string,
  description: string,
  confidence: number,
  elements: string[],
  isRecurring: boolean,
  artifactTypeHint: string | null,
): ExtractedPattern {
  return {
    id:              generateId(),
    patternType,
    name,
    description,
    confidence,
    elements,
    isRecurring,
    artifactTypeHint,
  };
}

function deriveStructuralName(title: string, _assetType: string): string {
  const clean = title.replace(/\b(the|a|an|your)\b/gi, '').trim();
  return `${clean} Structure Pattern`.replace(/\s+/g, ' ');
}

function formatArtifactType(slug: string): string {
  return slug
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function deduplicateByName(patterns: ExtractedPattern[]): ExtractedPattern[] {
  const seen = new Map<string, ExtractedPattern>();
  for (const p of patterns) {
    const existing = seen.get(p.name);
    if (!existing || p.confidence > existing.confidence) {
      seen.set(p.name, p);
    }
  }
  return [...seen.values()];
}

function generateId(): string {
  return crypto.randomUUID();
}
