/**
 * knowledge/index.ts
 *
 * Public exports for the Knowledge Intelligence pipeline (Sprint 3).
 *
 * Only classes and types that are consumed outside the knowledge package
 * are exported here. Internal utility types (ExtractionJob, NormalizedContent,
 * etc.) are kept in knowledge/types.ts and consumed directly within the package.
 *
 * Source: BrandOS Sprint 3 spec.
 */

export { KnowledgeAssetExtractor, normalizeContent } from './KnowledgeAssetExtractor';
export { VocabularyExtractor } from './VocabularyExtractor';
export { FrameworkExtractor } from './FrameworkExtractor';
export { PatternExtractor } from './PatternExtractor';
export { KnowledgeValidator } from './KnowledgeValidator';
export type { ExistingAssetProvider } from './KnowledgeValidator';
export { KnowledgeProcessor } from './KnowledgeProcessor';

// Pipeline result types — consumed by IntelligenceOS and tests
export type {
  KnowledgeProcessorResult,
  KnowledgeStageError,
  KnowledgeAssetLifecycleState,
  VocabularyExtractionResult,
  FrameworkExtractionResult,
  PatternExtractionResult,
  ValidationResult,
  ExtractedTerm,
  ExtractedPhrase,
  ExtractedFramework,
  ExtractedPattern,
  PatternType,
  FrameworkDetectionMethod,
} from './types';
