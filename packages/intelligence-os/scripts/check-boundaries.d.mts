/**
 * Type declarations for check-boundaries.mjs, hand-written rather than
 * generated (this script is a standalone .mjs CLI, deliberately outside
 * the package's compiled build — see the script's own header comment).
 * Kept in sync manually; the script itself is the source of truth.
 */

export interface BoundaryViolation {
  file: string;
  line: number;
  specifier: string;
}

export interface ImportSpecifierMatch {
  specifier: string;
  index: number;
}

export function findTsFiles(dir: string, out?: string[]): string[];
export function lineNumberOf(content: string, index: number): number;
export function extractSpecifiers(content: string): ImportSpecifierMatch[];
export function checkPackage(
  srcDir: string,
  isAllowed: (specifier: string) => boolean,
  relativeTo?: string,
  excludeDirs?: string[],
): BoundaryViolation[];

export function isRelative(specifier: string): boolean;
export function isNodeBuiltin(specifier: string): boolean;
export function iosIsolationAllowed(specifier: string): boolean;
export function sitIsolationAllowed(specifier: string): boolean;

/**
 * RULE-PIPELINE-NO-DIRECT-DB support (Completion Mission — Gap Analysis
 * G-2). See the corresponding exports' docblocks in check-boundaries.mjs
 * for the full rationale.
 */
export const DOMAIN_OWNERSHIP_RESTRICTED_DIRS: string[];
export function checkNoDirectDb(
  srcDir: string,
  relativeTo?: string,
): BoundaryViolation[];
