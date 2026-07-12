/**
 * ConflictResolutionModel.ts
 *
 * Resolves detected conflicts using the authority ordering from the approved
 * architecture (Section 6.2).
 *
 * Sprint 1 rules (in evaluation order):
 *
 *   COMPLIANCE  — conflictType === 'COMPLIANCE': workspace always wins.
 *                 This is the Immutability Rule — no other authority can
 *                 override a workspace compliance requirement.
 *
 *   WORKSPACE   — one entity is 'workspace' and conflict is not COMPLIANCE:
 *                 workspace wins for general workspace governance.
 *
 *   RECIPIENT   — conflictType === 'REGISTER' between user and audience:
 *                 audience wins. The artifact has a recipient; their context
 *                 takes priority over the sender's preference for register.
 *
 *   PROJECT     — conflictType === 'VOCABULARY': project vocabulary model wins
 *                 for project-scoped content.
 *
 *   AUTHORITY   — default: higher authority level wins.
 *
 * Transparency Rule: when departure.isSignificant is true, a human-readable
 * transparency note is added to the ConflictResolution. This surfaces to the
 * user in the UI so they understand why their preferences were adjusted.
 *
 * Constraint: this class does NOT mutate source intelligence or directives.
 * It records what was resolved and why. NarrativePlanner applies the
 * resolution outcomes directly when building the final directives.
 */

import type { DetectedConflict, ConflictResolution } from '@intelligence-os/shared-types';

export class ConflictResolutionModel {
  /**
   * Resolves all detected conflicts. Returns one ConflictResolution per conflict.
   * Input order is preserved; order does not affect resolution outcomes.
   */
  resolve(conflicts: DetectedConflict[]): ConflictResolution[] {
    return conflicts.map(c => this.resolveOne(c));
  }

  private resolveOne(conflict: DetectedConflict): ConflictResolution {
    const { rule, winner } = this.selectRuleAndWinner(conflict);

    return {
      conflictId: conflict.id,
      rule,
      winner,
      departure:  conflict.departure,
      transparency: conflict.departure.isSignificant
        ? this.buildTransparencyNote(conflict, rule, winner)
        : null,
    };
  }

  private selectRuleAndWinner(
    conflict: DetectedConflict,
  ): { rule: string; winner: string } {
    const { conflictType, entityAType, entityBType, authorityLevelA, authorityLevelB } = conflict;

    // Rule 1 — COMPLIANCE (Immutability Rule)
    if (conflictType === 'COMPLIANCE') {
      return { rule: 'COMPLIANCE', winner: 'workspace' };
    }

    // Rule 2 — WORKSPACE governance (non-compliance workspace conflicts)
    if (entityAType === 'workspace' || entityBType === 'workspace') {
      return { rule: 'WORKSPACE', winner: 'workspace' };
    }

    // Rule 3 — RECIPIENT (register conflicts where audience is one party)
    if (
      conflictType === 'REGISTER' &&
      (entityAType === 'audience' || entityBType === 'audience')
    ) {
      return { rule: 'RECIPIENT', winner: 'audience' };
    }

    // Rule 4 — PROJECT (vocabulary conflicts where project is one party)
    if (conflictType === 'VOCABULARY') {
      const projectIsB = entityBType === 'project';
      return { rule: 'PROJECT', winner: projectIsB ? 'project' : 'user' };
    }

    // Rule 5 — AUTHORITY (general: higher authority level wins)
    const winner = authorityLevelA >= authorityLevelB ? entityAType : entityBType;
    return { rule: 'AUTHORITY', winner };
  }

  private buildTransparencyNote(
    conflict: DetectedConflict,
    rule:     string,
    winner:   string,
  ): string {
    switch (rule) {
      case 'COMPLIANCE':
        return (
          `This artifact's communication requirements have been adjusted to meet workspace compliance constraints. ` +
          `This adjustment cannot be overridden by personal preferences (Immutability Rule). ` +
          (conflict.departure.description ? conflict.departure.description : '')
        ).trim();

      case 'RECIPIENT':
        return (
          `Your communication style has been adapted for this ${conflict.entityBId} audience. ` +
          `Your established preferences remain active for communications to other audiences. ` +
          (conflict.departure.description ? conflict.departure.description : '')
        ).trim();

      case 'PROJECT':
        return (
          `Project-specific vocabulary requirements apply for this artifact. ` +
          `Your personal vocabulary preferences are active outside this project context. ` +
          (conflict.departure.description ? conflict.departure.description : '')
        ).trim();

      case 'WORKSPACE':
        return (
          `Workspace governance requirements have been applied to this artifact. ` +
          (conflict.departure.description ? conflict.departure.description : '')
        ).trim();

      default:
        return (
          `A preference conflict between ${conflict.entityAType} and ${conflict.entityBType} ` +
          `was resolved in favour of ${winner} (${rule} rule). ` +
          (conflict.departure.description ?? '')
        ).trim();
    }
  }
}
