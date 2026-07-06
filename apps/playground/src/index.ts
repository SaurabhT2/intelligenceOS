/**
 * apps/playground/src/index.ts
 *
 * Scaffold only — deliberately not a full application. This file exists
 * to prove the workspace wiring is correct (this app resolves
 * `@intelligence-os/core` as a normal dependency) and to give a future
 * interactive-playground effort a starting point, not to implement one
 * now. See README.md for the intended future direction.
 */

import { IntelligenceOS } from '@intelligence-os/core';

console.info('[playground] @intelligence-os/core resolved successfully:', typeof IntelligenceOS);
console.info('[playground] This is a scaffold, not a runnable playground yet — see apps/playground/README.md.');
