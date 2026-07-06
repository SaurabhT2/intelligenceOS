/**
 * conflictDetection.ts
 *
 * Detects conflicts between intelligence sources.
 *
 * Conflicts are detected by comparing what the user's stored intelligence
 * prefers against what workspace compliance, audience calibration, and
 * project context require. ConflictResolutionModel then resolves them.
 *
 * Sprint 1 supports four conflict types:
 *   COMPLIANCE  — user register vs workspace requirement (always workspace wins)
 *   REGISTER    — user register vs audience expectation (RECIPIENT rule applies)
 *   VOCABULARY  — user terms vs project vocabulary model
 *   TONE        — user tone vs audience expected tone (rarely significant)
 *
 * No exceptions are thrown from this module. Missing data = no conflict.
 */

import type { DetectedConflict } from '@intelligence-os/shared-types';
import type { IntelligenceProfile, WorkspaceContext, AudienceProfile, Project } from '../../types/entities';
import type { AudienceCalibration } from '@intelligence-os/shared-types';
import { AUTHORITY_LEVELS, AUDIENCE_TYPE_DEFAULTS } from './defaults';

export interface ConflictDetectionInput {
  profile:             IntelligenceProfile | null;
  audienceCalibration: AudienceCalibration;
  audienceProfile:     AudienceProfile | null;
  project:             Project | null;
  workspaceContext:    WorkspaceContext | null;
}

/**
 * Detects all conflicts across intelligence dimensions.
 * Returns an empty array when no profile exists (new user = no conflicts).
 */
export function detectConflicts(input: ConflictDetectionInput): DetectedConflict[] {
  const { profile, audienceCalibration, project, workspaceContext } = input;
  if (!profile) return [];

  const conflicts: DetectedConflict[] = [];

  const userRegister = profile.voiceSummary?.['register'] as string | undefined;
  const userForbidden = (profile.vocabularySnapshot?.['forbiddenTerms'] as string[] | undefined) ?? [];
  const userPreferred = (profile.vocabularySnapshot?.['preferredTerms'] as Record<string, string> | undefined) ?? {};

  // ── 1. COMPLIANCE: user register vs workspace requirement ─────────────────
  if (workspaceContext && userRegister) {
    for (const constraint of workspaceContext.complianceConstraints) {
      if (constraint['type'] === 'register' && typeof constraint['requirement'] === 'string') {
        const required = constraint['requirement'] as string;
        if (userRegister !== required) {
          const significant = isSignificantRegisterDeparture(userRegister, required);
          conflicts.push({
            id:              crypto.randomUUID(),
            conflictType:    'COMPLIANCE',
            entityAType:     'user_profile',
            entityAId:       profile.id,
            entityBType:     'workspace',
            entityBId:       workspaceContext.workspaceId,
            authorityLevelA: AUTHORITY_LEVELS.USER_ESTABLISHED_PATTERN,
            authorityLevelB: AUTHORITY_LEVELS.WORKSPACE_COMPLIANCE,
            departure: {
              isSignificant: significant,
              description:   significant
                ? `User's established ${userRegister} register conflicts with workspace requirement for ${required} register. Workspace requirement applies (Immutability Rule).`
                : `User's ${userRegister} register differs from workspace preference for ${required}.`,
            },
          });
        }
      }
    }
  }

  // ── 2. REGISTER: user register vs audience expectation ───────────────────
  if (audienceCalibration.audienceType && userRegister) {
    const audienceDefaults = AUDIENCE_TYPE_DEFAULTS[audienceCalibration.audienceType];
    const expectedRegister = audienceDefaults?.register;
    if (expectedRegister && userRegister !== expectedRegister) {
      const significant = isSignificantRegisterDeparture(userRegister, expectedRegister);
      conflicts.push({
        id:              crypto.randomUUID(),
        conflictType:    'REGISTER',
        entityAType:     'user_profile',
        entityAId:       profile.id,
        entityBType:     'audience',
        entityBId:       audienceCalibration.audienceType,
        authorityLevelA: AUTHORITY_LEVELS.USER_ESTABLISHED_PATTERN,
        authorityLevelB: AUTHORITY_LEVELS.AUDIENCE_CALIBRATION,
        departure: {
          isSignificant: significant,
          description:   significant
            ? `Your established ${userRegister} register has been adapted to ${expectedRegister} for this ${audienceCalibration.audienceType} audience.`
            : `Minor register adjustment from ${userRegister} to ${expectedRegister} for ${audienceCalibration.audienceType} audience.`,
        },
      });
    }
  }

  // ── 3. VOCABULARY: user terms vs project vocabulary model ────────────────
  if (project) {
    const projectPreferred = (project.vocabularyModel['preferredTerms'] as Record<string, string> | undefined) ?? {};
    const projectForbidden = (project.vocabularyModel['forbiddenTerms'] as string[] | undefined) ?? [];

    // Terms the user forbids that the project actively prefers
    const conflictingForbidden = userForbidden.filter(
      term =>
        Object.keys(projectPreferred).includes(term) ||
        Object.values(projectPreferred).includes(term),
    );

    // Terms the user prefers that the project explicitly forbids
    const conflictingPreferred = Object.keys(userPreferred).filter(term =>
      projectForbidden.includes(term),
    );

    const conflictingTerms = [...conflictingForbidden, ...conflictingPreferred];

    if (conflictingTerms.length > 0) {
      const preview = conflictingTerms.slice(0, 3).join(', ');
      const overflow = conflictingTerms.length > 3 ? ` and ${conflictingTerms.length - 3} more` : '';
      conflicts.push({
        id:              crypto.randomUUID(),
        conflictType:    'VOCABULARY',
        entityAType:     'user_profile',
        entityAId:       profile.id,
        entityBType:     'project',
        entityBId:       project.id,
        authorityLevelA: AUTHORITY_LEVELS.USER_ESTABLISHED_PATTERN,
        authorityLevelB: AUTHORITY_LEVELS.PROJECT_CONTEXT,
        departure: {
          isSignificant: conflictingTerms.length > 2,
          description:   `Vocabulary conflict on: ${preview}${overflow}. Project vocabulary applies for project-scoped content.`,
        },
      });
    }
  }

  return conflicts;
}

/**
 * Returns true when the register difference is large enough to matter —
 * formal ↔ conversational is significant; formal ↔ professional is not.
 *
 * Register rank: formal=3, professional=2, technical=2, conversational=1
 * Significant = rank difference ≥ 2
 */
function isSignificantRegisterDeparture(a: string, b: string): boolean {
  const rank: Record<string, number> = {
    formal: 3, professional: 2, technical: 2, conversational: 1,
  };
  const rankA = rank[a] ?? 2;
  const rankB = rank[b] ?? 2;
  return Math.abs(rankA - rankB) >= 2;
}
