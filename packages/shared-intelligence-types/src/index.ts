/**
 * @intelligence-os/shared-types
 *
 * Contract types for Intelligence OS. This is the only package any
 * consumer needs to import types from — never from
 * `@intelligence-os/core/src/types/*` directly.
 */

export type { ArtifactRequest, ArtifactType, AudienceReference } from './ArtifactRequest';

export type {
  ArtifactBlueprint,
  BlueprintSection,
  VoiceDirectives,
  VocabularyDirectives,
  AudienceCalibration,
  DetectedConflict,
  ConflictResolution,
  NarrativeFrame,
  DepthSpecification,
  ComplianceRequirement,
} from './ArtifactBlueprint';

export type { FeedbackEvent, FeedbackEventType, EditDiff, VocabularyChange } from './FeedbackEvent';

// E1-3: Brand Summary
export type { IntelligenceSummary } from './IntelligenceSummary';
