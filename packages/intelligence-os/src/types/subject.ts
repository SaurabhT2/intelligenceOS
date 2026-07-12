/**
 * subject.ts
 *
 * ADR-003 (Subject-Centric Intelligence): the `Subject` reference and its
 * small set of pure helpers.
 *
 * A Subject is the entity IntelligenceOS accumulates and synthesizes
 * intelligence about. Two subject types exist today — User and Workspace —
 * both served by the same Learning Pipeline, the same taxonomy, and the
 * same confidence/decay machinery (ADR-003 §2.1–§2.2). This file is
 * deliberately small: it is a reference type and a handful of pure
 * row-shaping helpers, not a new abstraction layer.
 *
 * `intelligence.learnings`, `intelligence.hypotheses`, `intelligence.signals`,
 * and `intelligence.profiles` each carry a nullable `user_id` and a nullable
 * `workspace_id`, plus a `subject_type` discriminator column that states
 * which one is authoritative for a given row (migration
 * `004_subject_centric_intelligence.sql`). `subjectColumns()` below is the
 * single place that maps a `SubjectRef` to that column triple, so every
 * write site (UserIntelligenceDomain, KnowledgeIntelligenceDomain) produces
 * the same shape.
 */

export type SubjectType = 'user' | 'workspace';

export interface SubjectRef {
  readonly subjectType: SubjectType;
  readonly subjectId: string;
}

export function userSubject(userId: string): SubjectRef {
  return { subjectType: 'user', subjectId: userId };
}

export function workspaceSubject(workspaceId: string): SubjectRef {
  return { subjectType: 'workspace', subjectId: workspaceId };
}

/**
 * Maps a SubjectRef to the `{ subject_type, user_id, workspace_id }` column
 * triple every subject-scoped table (learnings, hypotheses, signals,
 * profiles) now carries. Exactly one of `user_id`/`workspace_id` is
 * non-null — mirrors the `*_owner_required` CHECK constraint each of those
 * tables enforces at the database level.
 */
export function subjectColumns(subject: SubjectRef): {
  subject_type: SubjectType;
  user_id: string | null;
  workspace_id: string | null;
} {
  return {
    subject_type: subject.subjectType,
    user_id: subject.subjectType === 'user' ? subject.subjectId : null,
    workspace_id: subject.subjectType === 'workspace' ? subject.subjectId : null,
  };
}

/**
 * Inverse of `subjectColumns()` — derives a SubjectRef from a row's already
 * mapped `userId`/`workspaceId`/`subjectType` fields. Falls back to
 * inferring from which id is present when `subjectType` is missing (rows
 * written before migration 004 backfill it to `'user'` at the database
 * level, so this fallback only matters for in-memory construction, e.g. in
 * tests, that predates the discriminator).
 */
export function subjectRefOf(entity: {
  subjectType?: SubjectType;
  userId: string | null;
  workspaceId: string | null;
}): SubjectRef {
  if (entity.subjectType) {
    const id = entity.subjectType === 'user' ? entity.userId : entity.workspaceId;
    if (id) return { subjectType: entity.subjectType, subjectId: id };
  }
  if (entity.userId) return { subjectType: 'user', subjectId: entity.userId };
  if (entity.workspaceId) return { subjectType: 'workspace', subjectId: entity.workspaceId };
  throw new Error('subjectRefOf: entity has neither a userId nor a workspaceId');
}
