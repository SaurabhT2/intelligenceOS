/**
 * Internal types barrel.
 *
 * These types are for use within intelligence-os only. BrandOS imports only
 * from @intelligence-os/shared-types, never from here.
 */

export type {
  TaxonomyCategory,
  StabilityClass,
  DecayRate,
  LearningState,
  LearningContextScope,
  HypothesisState,
  SignalSourceType,
  ArtifactPatternLevel,
  ExemplarPromotionReason,
  KnowledgeAssetOwnerType,
  KnowledgeAssetType,
  ProjectLifecycleState,
  RelationshipType,
  ExpertiseLevel,
  AudienceProfileOwnerType,
  AudienceType,
  ArchetypeType,
  UserId,
  ArtifactId,
  IntelligenceProfile,
  Archetype,
  Learning,
  Hypothesis,
  Signal,
  ArtifactPattern,
  ArtifactExemplar,
  KnowledgeAsset,
  Project,
  Relationship,
  AudienceProfile,
  WorkspaceContext,
  FeedbackEventRecord,
} from './entities';

export type {
  DomainType,
  ProjectInput,
  KnowledgeAssetInput,
  KnowledgeAssetFilter,
  ArtifactExemplarInput,
} from './domains';

export type {
  IntelligenceEventType,
  IntelligenceEventPayload,
  FeedbackEventPayload,
  KnowledgeAssetPayload,
  ProjectPayload,
  UserCorrectionPayload,
  ProfileUpdatedPayload,
  RecurringConflictPayload,
  BaseEventPayload,
} from './events';
