/**
 * FeedbackEvent.ts
 *
 * The ingestion type for `IntelligenceOS.recordFeedbackEvent()`.
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 8.
 */

import type { ArtifactType } from './ArtifactRequest';

export interface FeedbackEvent {
  userId: string;
  artifactId: string;
  artifactType: ArtifactType;
  projectId?: string;
  /** correlates feedback to the blueprint used */
  blueprintId?: string;
  eventType: FeedbackEventType;
  editDiff?: EditDiff;
  explicitReason?: string;
}

export type FeedbackEventType =
  | 'accepted' // used without edits
  | 'edited' // used after making changes
  | 'rejected' // not used
  | 'deployed' // sent/published externally (highest signal)
  | 'explicit_feedback'; // user provided direct feedback text

export interface EditDiff {
  sectionsAdded: string[];
  sectionsRemoved: string[];
  sectionsReordered: boolean;
  /** positive = made longer, negative = shorter */
  lengthDelta: number;
  vocabularyChanges: VocabularyChange[];
  toneShift?: 'more_formal' | 'more_casual' | 'more_authoritative' | 'other';
}

/**
 * PLACEHOLDER — referenced by name only (`EditDiff.vocabularyChanges`),
 * never given a shape in any source document. Owned by Feedback Processor's
 * Delta Learning Protocol (Sprint 2, Learning Pipeline). Replace once that
 * component is built.
 */
export interface VocabularyChange {
  term: string;
  changeType: 'added' | 'removed' | 'replaced';
  replacement?: string;
  [key: string]: unknown;
}
