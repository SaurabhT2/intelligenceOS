/**
 * HealthChecker.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 *
 * Backs `CognitionProvider.checkHealth()`. Nothing in Epic 2 previously
 * exposed a health/availability check — this is genuinely new, minimal
 * code, not an adaptation of an existing capability. Intentionally does
 * only one thing: confirm the database connection this package depends on
 * is actually reachable. Per PLATFORM_CONTRACT.md §3, "this operation
 * never returns cognitive content — only availability."
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CognitionHealth } from '@platform/cognition-contract';

export class HealthChecker {
  constructor(private readonly db: SupabaseClient) {}

  async check(): Promise<CognitionHealth> {
    try {
      const { error } = await this.db
        .schema('intelligence')
        .from('learnings')
        .select('id', { head: true, count: 'exact' })
        .limit(1);

      if (error) {
        return { healthy: false, degradedReason: error.message };
      }

      return { healthy: true };
    } catch (err) {
      return {
        healthy: false,
        degradedReason: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }
}
