/**
 * @intelligence-os/core — Public API surface
 *
 * Any consumer imports from this package's public surface only — never
 * from an internal path like `@intelligence-os/core/src/...`. A consumer
 * typically needs:
 *   IntelligenceOS        — the root class (concrete, full surface incl. .eventBus)
 *   IIntelligenceProvider — the platform's formal provider contract (Epic 2)
 *   IntelligenceOSProvider — IIntelligenceProvider-typed adapter over IntelligenceOS
 *   InProcessEventBus     — the default event bus (swap at Sprint 4)
 *   Types from @intelligence-os/shared-types (imported directly there)
 *
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 2.1.
 * Epic 2 (Platform Publication): see docs/INTEGRATION_GUIDE.md
 * for the full, maintained list of what's public vs. internal.
 */

export { IntelligenceOS } from './IntelligenceOS';
export type { IntelligenceOSConfig } from './IntelligenceOS';
export { InProcessEventBus } from './events/IntelligenceEventBus';
export type { IntelligenceEventBus } from './events/IntelligenceEventBus';

// Epic 2 / E2-2, E2-4-T1: the platform's provider contract and its own
// implementation. See IIntelligenceProvider.ts for why this interface is
// published from here rather than from a consumer's own package.
export type { IIntelligenceProvider } from './IIntelligenceProvider';
export { IntelligenceOSProvider } from './compat/IntelligenceOSProvider';

// Re-export error types so any consumer can catch them by class reference
// without importing from internal paths.
export {
  IntelligenceOSError,
  PhaseNotImplementedError,
  DomainNotActivatedError,
  EntityNotFoundError,
  ValidationError,
  DatabaseError,
} from './errors';

// Re-export the event type strings for event bus subscription.
export type { IntelligenceEventType, IntelligenceEventPayload } from './types/events';

// Epic 2: the 9 individual payload interfaces, exported by name in addition
// to the IntelligenceEventPayload<T> conditional lookup above — useful for
// typing a handler parameter or a test fixture directly without writing out
// IntelligenceEventPayload<'intelligence.blueprint.built'> every time.
export type {
  FeedbackEventPayload,
  KnowledgeAssetPayload,
  ProjectPayload,
  UserCorrectionPayload,
  ProfileUpdatedPayload,
  BlueprintBuiltPayload,
  RecurringConflictPayload,
  LearningReviewedPayload,
  BaseEventPayload,
} from './types/events';

// Re-export input types a consumer passes to upsertProject() / ingestKnowledgeAsset().
export type { ProjectInput, KnowledgeAssetInput } from './types/domains';

// Sprint 2: pipeline types exported for testing and observability consumers.
export type { PipelineRunResult, PipelineStageError } from './pipeline/types';

// Sprint 3: knowledge pipeline types exported for testing and observability consumers.
export type {
  KnowledgeProcessorResult,
  KnowledgeStageError,
  KnowledgeAssetLifecycleState,
  VocabularyExtractionResult,
  FrameworkExtractionResult,
  PatternExtractionResult,
  ValidationResult,
} from './knowledge/types';

// Epic 1: Visual Intelligence extraction types (E1-4).
export type {
  VisualFeatureExtractionResult,
  ExtractedColor,
  ExtractedTypography,
  ExtractedLayout,
  ExtractedMood,
} from './knowledge/VisualFeatureExtractor';

// Epic 1: Backward-compat classification utility (E1-5, transition only).
export { toLegacyClassification } from './utils/classificationCompat';

// Epic 1: Workspace learning input type (E1-2).
export type { WorkspaceLearningInput } from './types/domains';

// ── Milestone 2: CognitionProvider (the BrandOS ⇄ IntelligenceOS contract) ──
//
// Re-exported from `@platform/cognition-contract` so a consumer only needs
// to depend on `@intelligence-os/core` to get both the implementation and
// the types it satisfies. `IntelligenceOS.asCognitionProvider()` is the
// primary way to obtain an instance; `createCognitionHttpServer` exposes it
// over HTTP.
export { CognitionProviderImpl } from './api/CognitionProviderImpl';
export type { CognitionProviderImplDeps } from './api/CognitionProviderImpl';
export { HealthChecker } from './api/HealthChecker';
export { createCognitionHttpServer } from './api/http/server';
export type { CognitionHttpServerOptions } from './api/http/server';
export { ContextBuilder } from './context/ContextBuilder';

export type {
  CognitionProvider,
  CognitionContext,
  CognitionRequest,
  ObservationInput,
  CognitionReviewDecision,
  CognitionSummary,
  CognitionHealth,
  CognitionConfidence,
  VoiceProfile,
  IdentityContribution,
  VisualIdentityProjection,
  CognitionProvenance,
} from '@platform/cognition-contract';
export { COGNITION_CONTRACT_VERSION, createDegradedCognitionContext } from '@platform/cognition-contract';
