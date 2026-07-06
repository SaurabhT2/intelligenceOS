/**
 * errors.ts
 *
 * Typed error hierarchy for Intelligence OS. All errors thrown by this
 * package extend IntelligenceOSError so callers can catch the base type
 * without importing every subclass.
 */

export class IntelligenceOSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'IntelligenceOSError';
    // Maintains correct prototype chain in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a method is deferred to a future sprint or phase.
 *
 * Usage:
 *   throw new PhaseNotImplementedError('buildBlueprint', 'Sprint 1 (Blueprint Assembly)');
 */
export class PhaseNotImplementedError extends IntelligenceOSError {
  constructor(methodName: string, availableIn: string) {
    super(
      `IntelligenceOS.${methodName}() is not implemented in Sprint 0. ` +
        `It will be available in ${availableIn}.`,
      'PHASE_NOT_IMPLEMENTED',
    );
    this.name = 'PhaseNotImplementedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a domain store method is deferred because the domain itself
 * is not activated until a later phase (e.g., Relationship Intelligence
 * in Phase 2).
 */
export class DomainNotActivatedError extends IntelligenceOSError {
  constructor(domainName: string, activatesIn: string) {
    super(
      `${domainName} is not activated in Phase 1. ` +
        `It will be activated in ${activatesIn}. ` +
        `See Contracts Section J.3 for activation triggers.`,
      'DOMAIN_NOT_ACTIVATED',
    );
    this.name = 'DomainNotActivatedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a requested entity does not exist in the database.
 */
export class EntityNotFoundError extends IntelligenceOSError {
  constructor(entityType: string, id: string) {
    super(`${entityType} not found: ${id}`, 'ENTITY_NOT_FOUND');
    this.name = 'EntityNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when input fails validation before hitting the database.
 */
export class ValidationError extends IntelligenceOSError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Wraps errors returned by Supabase / Postgres.
 */
export class DatabaseError extends IntelligenceOSError {
  constructor(message: string, cause: unknown) {
    super(message, 'DATABASE_ERROR', cause);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
