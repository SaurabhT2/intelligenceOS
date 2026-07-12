/**
 * knowledge/types.ts
 *
 * Internal types for the Sprint 3 Knowledge Intelligence pipeline.
 *
 * These types are pipeline-internal — they are not exported from the public
 * API surface. The only public output types are KnowledgeAsset (from
 * entities.ts) and KnowledgeProcessorResult (exported from index.ts).
 *
 * Source: BrandOS Sprint 3 spec.
 * Source: BrandOS_Logical_Intelligence_Schema.md Section I.5.2–I.5.3.
 * Source: BrandOS_Intelligence_Contracts.md Section E.4 (Knowledge Asset Flow).
 */

import type { KnowledgeAsset, KnowledgeAssetType, KnowledgeAssetOwnerType } from '../types/entities';
import type { TaxonomyCategory } from '../types/entities';

// ── Knowledge Asset Lifecycle ─────────────────────────────────────────────────
// Per sprint spec: UPLOADED → PROCESSING → EXTRACTED → VALIDATED → ACTIVE → ARCHIVED
// Per schema I.5.3: Upload → Verify → Active → Versioned → Deprecated

export type KnowledgeAssetLifecycleState =
  | 'UPLOADED'    // Record created; extraction not yet started
  | 'PROCESSING'  // Extraction pipeline running
  | 'EXTRACTED'   // All extractors have run; awaiting validation
  | 'VALIDATED'   // Confidence assigned; duplicates checked; corroboration applied
  | 'ACTIVE'      // Available for artifact generation reference
  | 'ARCHIVED';   // Deprecated or superseded; retained for reference only

// ── Normalized Content ────────────────────────────────────────────────────────
// KnowledgeAssetExtractor produces this from raw input before the extraction
// sub-components (Vocabulary / Framework / Pattern) consume it.

export interface NormalizedContent {
  /** Raw text extracted from the asset. */
  text: string;
  /** Number of words (approximate). */
  wordCount: number;
  /** Individual lines, trimmed, with empty lines removed. */
  lines: string[];
  /** Individual sentences extracted via simple heuristic splitter. */
  sentences: string[];
  /** Paragraphs: runs of non-empty lines separated by blank lines. */
  paragraphs: string[];
  /** True if the content appears to be structured (has headers, bullets, numbered lists). */
  isStructured: boolean;
}

// ── Extraction Job ────────────────────────────────────────────────────────────
// Created by KnowledgeAssetExtractor; passed through the pipeline.

export interface ExtractionJob {
  /** Unique job id (UUID). */
  id: string;
  /** The knowledge asset this job belongs to. Will be persisted after extraction. */
  assetId: string;
  /** Owner context — needed by extractors to scope their outputs. */
  ownerType: KnowledgeAssetOwnerType;
  userId: string | null;
  projectId: string | null;
  workspaceId: string | null;
  /** Classified asset type. */
  assetType: KnowledgeAssetType;
  /** Human-readable title. */
  title: string;
  /** Normalized content for extractors to work against. */
  content: NormalizedContent;
  /** ISO 8601 timestamp of job creation. */
  createdAt: string;
  /** Tracks current lifecycle state. */
  lifecycleState: KnowledgeAssetLifecycleState;
}

// ── Vocabulary Extraction ─────────────────────────────────────────────────────
// Output of VocabularyExtractor.

export interface ExtractedTerm {
  /** The normalized term (lowercased, trimmed). */
  term: string;
  /** The original surface form as it appeared in the text. */
  surfaceForm: string;
  /** How many times the term appeared. */
  frequency: number;
  /** Whether the term is an acronym (all-caps sequence 2–6 chars). */
  isAcronym: boolean;
  /** Whether the term appears to be proprietary (capitalized phrase not found in common wordlist). */
  isProprietary: boolean;
  /** Taxonomy category this term best maps to. */
  taxonomyCategory: TaxonomyCategory;
}

export interface ExtractedPhrase {
  /** The repeated phrase (2–4 words). */
  phrase: string;
  /** How many times the phrase appeared. */
  frequency: number;
  /** Taxonomy category this phrase best maps to. */
  taxonomyCategory: TaxonomyCategory;
}

export interface VocabularyExtractionResult {
  terms: ExtractedTerm[];
  phrases: ExtractedPhrase[];
  /** Total distinct term count. */
  termCount: number;
  /** Total distinct phrase count. */
  phraseCount: number;
}

// ── Framework Extraction ──────────────────────────────────────────────────────
// Output of FrameworkExtractor.

export type FrameworkDetectionMethod = 'explicit' | 'implicit';

export interface ExtractedFramework {
  /** Unique id for this extracted framework candidate. */
  id: string;
  /** The framework name as detected. */
  name: string;
  /** Concise description (1–3 sentences). */
  description: string;
  /** Category per taxonomy. */
  category: 'analytical' | 'strategic' | 'creative' | 'technical' | 'methodological' | 'evaluative';
  /** How the framework was detected. */
  detectionMethod: FrameworkDetectionMethod;
  /** Confidence in this detection (0–1). */
  confidence: number;
  /** Terms/phrases that were evidence for this detection. */
  evidenceTerms: string[];
  /** Whether this framework appears to be the user's proprietary IP. */
  isProprietary: boolean;
}

export interface FrameworkExtractionResult {
  frameworks: ExtractedFramework[];
  frameworkCount: number;
}

// ── Pattern Extraction ────────────────────────────────────────────────────────
// Output of PatternExtractor.
// Design decision: PatternExtractor produces candidates only — it does NOT
// mutate ArtifactPattern records. Candidates flow into KnowledgeAsset.extractedPatterns
// and may later be promoted by Artifact Intelligence (out of scope here).

export type PatternType =
  | 'structural'       // Document/section structure pattern
  | 'narrative'        // Recurring narrative or argumentation structure
  | 'artifact_approach'; // Repeatable approach to a specific artifact type

export interface ExtractedPattern {
  /** Unique id for this extracted pattern candidate. */
  id: string;
  /** Pattern type. */
  patternType: PatternType;
  /** Human-readable name. */
  name: string;
  /** Description of the pattern. */
  description: string;
  /** Confidence in this detection (0–1). */
  confidence: number;
  /** Key structural elements observed. */
  elements: string[];
  /** Whether this pattern recurs across multiple sections. */
  isRecurring: boolean;
  /** If artifact_approach: the artifact type this pattern applies to. Null otherwise. */
  artifactTypeHint: string | null;
}

export interface PatternExtractionResult {
  patterns: ExtractedPattern[];
  patternCount: number;
}

// ── Validation ────────────────────────────────────────────────────────────────
// Output of KnowledgeValidator.

export interface ValidationResult {
  /** Overall confidence assigned to this asset (0–1). */
  confidence: number;
  /** Whether a near-identical asset already exists. */
  isDuplicate: boolean;
  /** Id of the existing asset if isDuplicate is true. */
  duplicateAssetId: string | null;
  /** Corroboration: how many existing vocabulary terms from this asset already exist in the user/project model. */
  corroborationScore: number;
  /** Validation warnings (non-fatal). */
  warnings: string[];
  /** Whether the asset passed validation and should be promoted to VALIDATED/ACTIVE. */
  passed: boolean;
}

// ── Processor Result ──────────────────────────────────────────────────────────
// Returned by KnowledgeProcessor.process() — this is the public-facing result.

export interface KnowledgeProcessorResult {
  /** The id of the knowledge asset created or updated. */
  assetId: string;
  /** Final lifecycle state after processing. */
  lifecycleState: KnowledgeAssetLifecycleState;
  /** The fully populated KnowledgeAsset as persisted (without DB round-trip). */
  asset: KnowledgeAsset;
  /** Vocabulary extraction summary. */
  vocabularyResult: VocabularyExtractionResult;
  /** Framework extraction summary. */
  frameworkResult: FrameworkExtractionResult;
  /** Pattern extraction summary. */
  patternResult: PatternExtractionResult;
  /** Visual feature extraction summary (E1-4). null when asset is not visual. */
  visualResult: import('../knowledge/VisualFeatureExtractor').VisualFeatureExtractionResult | null;
  /** Validation result. */
  validationResult: ValidationResult;
  /** Non-fatal errors encountered during processing. */
  errors: KnowledgeStageError[];
}

export interface KnowledgeStageError {
  stage: 'extract' | 'vocabulary' | 'framework' | 'pattern' | 'visual' | 'validation' | 'persist';
  message: string;
  cause?: unknown;
}
