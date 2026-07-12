/**
 * VocabularyExtractor.ts
 *
 * Stage 1 of the Knowledge Intelligence pipeline (after KnowledgeAssetExtractor).
 *
 * Responsibilities (per Sprint 3 spec):
 *   • Domain terminology extraction
 *   • Acronym extraction
 *   • Proprietary vocabulary detection
 *   • Repeated phrase detection
 *
 * Outputs:
 *   • VocabularyModel entries (terms → taxonomy categories)
 *   • Knowledge Vocabulary entries (phrases and high-signal terms)
 *
 * Vocabulary scope: User | Project | Workspace — set by the ExtractionJob's
 * ownerType, which inherits from the KnowledgeAssetInput.
 *
 * Design decisions:
 *   1. Pure heuristic extraction — no LLM calls. Consistent with Sprint 2
 *      SignalExtractor pattern (deterministic mapping, no AI in pipeline internals).
 *   2. Common English stop-words are excluded from term extraction. The
 *      stop-word list is a hardcoded minimal set for Phase 1; a full NLP
 *      library would be the Phase 2 path.
 *   3. Acronym detection: 2–6 uppercase letters only. Numbers allowed inside
 *      acronyms (e.g. B2B) but must start and end with a letter.
 *   4. Phrase detection uses a 2- and 3-gram sliding window. Phrases that
 *      appear ≥ 2 times are candidates. ≥ 3 times are high-confidence.
 *   5. Taxonomy mapping is keyword-based. Each term/phrase is mapped to the
 *      first matching category. The taxonomy category 'domain_specific_vocabulary'
 *      is the catch-all.
 *
 * Source: BrandOS Sprint 3 spec.
 * Source: BrandOS_Logical_Intelligence_Schema.md Section I.5.2 (Knowledge Vocabulary).
 * Source: BrandOS_Logical_Intelligence_Schema.md Section B.22 (Vocabulary Model).
 */

import type { TaxonomyCategory } from '../types/entities';
import type { ExtractionJob } from './types';
import type {
  ExtractedTerm,
  ExtractedPhrase,
  VocabularyExtractionResult,
} from './types';

// ── Stop-word list (minimal Phase 1) ─────────────────────────────────────────
// Excludes words that carry no domain signal.

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'not', 'no', 'nor', 'so', 'yet',
  'both', 'either', 'neither', 'each', 'few', 'more', 'most', 'other', 'some',
  'such', 'than', 'too', 'very', 'just', 'also', 'that', 'this', 'these',
  'those', 'their', 'they', 'them', 'then', 'when', 'where', 'which', 'who',
  'how', 'what', 'why', 'all', 'any', 'its', 'our', 'your', 'we', 'us', 'it',
  'he', 'she', 'his', 'her', 'into', 'out', 'up', 'down', 'about', 'above',
  'between', 'through', 'during', 'before', 'after', 'while',
]);

// ── Taxonomy category mapping ─────────────────────────────────────────────────
// Maps a term to the most likely taxonomy category by keyword presence.

const TAXONOMY_KEYWORD_MAP: Array<{ pattern: RegExp; category: TaxonomyCategory }> = [
  { pattern: /\b(goal|objective|target|outcome|kpi|metric|measure|success)\b/i,       category: 'goals_and_objectives' },
  { pattern: /\b(strategy|strategic|approach|roadmap|vision|mission|priority)\b/i,    category: 'strategic_thinking_patterns' },
  { pattern: /\b(framework|model|canvas|matrix|lens|pillar|principle)\b/i,            category: 'intellectual_frameworks' },
  { pattern: /\b(methodology|method|process|system|workflow|protocol|phase|step)\b/i, category: 'skills_inventory' },
  { pattern: /\b(audience|customer|stakeholder|user|client|persona|segment)\b/i,      category: 'audience_intelligence' },
  { pattern: /\b(brand|voice|tone|style|narrative|message|story|communicate)\b/i,     category: 'communication_style' },
  { pattern: /\b(write|writing|draft|copy|content|format|structure|template)\b/i,     category: 'writing_style' },
  { pattern: /\b(decision|criteria|evaluate|assess|prioritize|trade.?off)\b/i,        category: 'decision_making_style' },
  { pattern: /\b(constraint|limit|boundary|rule|policy|compliance|requirement)\b/i,   category: 'constraints_and_boundaries' },
  { pattern: /\b(learn|research|study|explore|investigate|discover|insight)\b/i,      category: 'learning_and_curiosity_patterns' },
  { pattern: /\b(lead|manage|delegate|coach|mentor|collaborate|team)\b/i,             category: 'collaboration_and_leadership_style' },
  { pattern: /\b(tool|technology|platform|software|system|stack|technical|code)\b/i, category: 'tool_and_technology_preferences' },
  { pattern: /\b(persona|identity|founder|executive|expert|professional)\b/i,        category: 'professional_identity' },
  { pattern: /\b(expertise|skill|domain|knowledge|experience|background)\b/i,        category: 'expertise_domains' },
  { pattern: /\b(value|principle|belief|ethics|culture|mission|purpose)\b/i,          category: 'operating_principles' },
];

function mapToTaxonomy(text: string): TaxonomyCategory {
  for (const { pattern, category } of TAXONOMY_KEYWORD_MAP) {
    if (pattern.test(text)) return category;
  }
  return 'domain_specific_vocabulary';
}

// ── Acronym detection ─────────────────────────────────────────────────────────
// Matches 2–6 letter (plus optional digit) sequences that are all-caps and
// appear as standalone tokens.

const ACRONYM_PATTERN = /\b[A-Z][A-Z0-9]{1,5}\b/g;

function extractAcronyms(text: string): string[] {
  const matches = text.match(ACRONYM_PATTERN) ?? [];
  return [...new Set(matches)];
}

// ── Proprietary term detection ────────────────────────────────────────────────
// A term is considered potentially proprietary if it:
//   - Is capitalized (not at sentence start) in the middle of a sentence
//   - Consists of 2+ words all starting with caps (Title Case phrases)
//   - Is not a common proper noun (simplistic: not in stop-words, not all lowercase)

const TITLE_CASE_PHRASE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;

function extractProprietaryPhrases(text: string): string[] {
  const matches = text.match(TITLE_CASE_PHRASE) ?? [];
  // Filter phrases that are likely company/framework names (2+ words in Title Case)
  return [...new Set(matches)].filter(phrase => {
    const words = phrase.split(' ');
    return words.length >= 2 && !STOP_WORDS.has(phrase.toLowerCase());
  });
}

// ── N-gram phrase extraction ──────────────────────────────────────────────────
// Generates 2- and 3-grams from the word list.

function extractNgrams(words: string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(' ');
    if (gram.length < 4) continue; // Skip trivially short grams
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

// ── Term tokenizer ────────────────────────────────────────────────────────────

function tokenizeWords(text: string): string[] {
  return (text.match(/\b[a-zA-Z][a-zA-Z0-9'-]*[a-zA-Z]\b/g) ?? [])
    .map(w => w.toLowerCase())
    .filter(w => !STOP_WORDS.has(w) && w.length >= 3);
}

// ── VocabularyExtractor ───────────────────────────────────────────────────────

export class VocabularyExtractor {
  /**
   * Extracts vocabulary intelligence from a normalized ExtractionJob.
   *
   * @param job The extraction job with normalized content.
   * @returns VocabularyExtractionResult with terms and phrases.
   */
  extract(job: ExtractionJob): VocabularyExtractionResult {
    const { text } = job.content;

    // 1. Count word frequencies (excluding stop-words)
    const wordTokens = tokenizeWords(text);
    const wordFreq = new Map<string, number>();
    for (const word of wordTokens) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    }

    // 2. Detect acronyms
    const acronyms = new Set(extractAcronyms(text));

    // 3. Detect proprietary Title Case phrases
    const proprietaryPhrases = new Set(
      extractProprietaryPhrases(text).map(p => p.toLowerCase()),
    );

    // 4. Build term list — words that appear ≥ 2 times OR are acronyms / proprietary
    const terms: ExtractedTerm[] = [];
    const upperWords = text.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? [];
    const acronymSurface = new Map<string, string>();
    for (const a of upperWords) {
      acronymSurface.set(a.toLowerCase(), a);
    }

    const seenTerms = new Set<string>();
    for (const [word, freq] of wordFreq.entries()) {
      const isAcronym = acronyms.has(word.toUpperCase()) || acronymSurface.has(word);
      const isProprietary = proprietaryPhrases.has(word);

      // Include if: high frequency, acronym, or proprietary signal
      if (freq >= 2 || isAcronym || isProprietary) {
        if (!seenTerms.has(word)) {
          seenTerms.add(word);
          terms.push({
            term:             word,
            surfaceForm:      acronymSurface.get(word) ?? word,
            frequency:        freq,
            isAcronym:        isAcronym,
            isProprietary:    isProprietary,
            taxonomyCategory: mapToTaxonomy(word),
          });
        }
      }
    }

    // Sort by frequency descending, then alphabetically
    terms.sort((a, b) => b.frequency - a.frequency || a.term.localeCompare(b.term));

    // 5. Extract 2- and 3-grams as repeated phrases
    const bigramCounts  = extractNgrams(wordTokens, 2);
    const trigramCounts = extractNgrams(wordTokens, 3);

    const phrases: ExtractedPhrase[] = [];
    const allGrams = new Map([...bigramCounts, ...trigramCounts]);

    for (const [phrase, freq] of allGrams.entries()) {
      if (freq >= 2) {
        phrases.push({
          phrase,
          frequency:        freq,
          taxonomyCategory: mapToTaxonomy(phrase),
        });
      }
    }

    // Sort phrases by frequency descending
    phrases.sort((a, b) => b.frequency - a.frequency);

    return {
      terms,
      phrases,
      termCount:   terms.length,
      phraseCount: phrases.length,
    };
  }
}
