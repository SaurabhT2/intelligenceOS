/**
 * ArtifactRequest.ts
 *
 * What a consumer sends in to `IntelligenceOS.buildBlueprint()`.
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 8.
 */

export interface ArtifactRequest {
  userId: string;
  workspaceId?: string;
  projectId?: string;
  artifactType: ArtifactType;
  audienceRef?: AudienceReference;
  /**
   * Contextual hints a consumer can provide; Intelligence OS uses
   * these as context but does not blindly trust them.
   */
  hints?: {
    urgency?: 'high' | 'standard';
    recipientName?: string;
    topicOverride?: string;
  };
}

export type ArtifactType =
  | 'board_update'
  | 'strategy_document'
  | 'architecture_proposal'
  | 'research_paper'
  | 'product_roadmap'
  | 'investor_update'
  | 'linkedin_post'
  | string; // extensible for custom artifact types

export interface AudienceReference {
  /** Named relationship (highest specificity). Phase 2 — see AudienceCalibration. */
  relationshipId?: string;
  /** Generic audience type (fallback). This is the Phase 1 path. */
  audienceType?: 'board' | 'investor' | 'engineering' | 'customer' | 'general';
}
