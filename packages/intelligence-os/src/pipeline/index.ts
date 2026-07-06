/**
 * pipeline/index.ts
 *
 * Public exports for the Sprint 2 Learning Pipeline.
 * Internal types (Observation, PipelineRunResult) are exported for testing;
 * BrandOS does not import from this path directly — it interacts only via
 * the IntelligenceOS public API.
 */

export { SignalExtractor } from './SignalExtractor';
export { ObservationBuilder } from './ObservationBuilder';
export { HypothesisEngine } from './HypothesisEngine';
export { LearningValidator } from './LearningValidator';
export { ProfileBuilder } from './ProfileBuilder';
export { FeedbackProcessor } from './FeedbackProcessor';
export type { Observation, SourceQuality, PipelineRunResult, PipelineStageError } from './types';
export type { ValidationResult } from './LearningValidator';
export type { RebuildDecision } from './ProfileBuilder';
