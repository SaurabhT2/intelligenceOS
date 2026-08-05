#!/usr/bin/env node
/**
 * check-migration-drift.mjs
 *
 * Added post-incident 2026-08-04 (production `/v1/cognition/resolve`
 * failing on `column profiles.workspace_id does not exist`). Root cause
 * was not a code bug — it was that `src/db/migrations/004_*.sql` and
 * `005_*.sql` were merged to `main` (and `apps/api` auto-deployed on that
 * merge, per docs/DEPLOYMENT.md) without every ALTER TABLE statement in
 * those files ever being executed against the live database. There is no
 * migration-tracking table in this project and CI never touches a live
 * database (see db/AGENT_CONTEXT.md), so nothing caught the gap before
 * production traffic did.
 *
 * This script is intentionally simple, not a general SQL parser: it
 * extracts `(table, column)` pairs from `ADD COLUMN` and `CREATE TABLE`
 * statements across schema.sql + src/db/migrations/*.sql (both directories
 * combined, in filename order) via regex, then confirms every one of those
 * columns exists in the live database's `information_schema.columns`.
 *
 * Known limitations (accepted trade-off — see incident RCA):
 *   - Does not understand DROP COLUMN / RENAME COLUMN / column type
 *     changes. A column removed live but still referenced by old
 *     migration text would be a false negative. This is fine: renames/
 *     drops are rare and tend to be loud (something breaks obviously);
 *     the failure mode this guards against — a column silently never
 *     added — is the common, quiet one, and the one that caused this
 *     incident.
 *   - Assumes `schema` prefix is always `intelligence.` — matches this
 *     codebase's convention throughout schema.sql/migrations.
 *   - This is a *forward* net: it does not retroactively validate rows
 *     already written under a mismatched schema.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/db/check-migration-drift.mjs
 *
 * Exit code 0 = no drift found. Exit code 1 = drift found (or a hard
 * error, e.g. can't connect) — either should fail CI.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DB_DIR = join(REPO_ROOT, 'packages', 'intelligence-os', 'src', 'db');

/** Extracts { table, column }[] from one SQL file's text. */
function extractExpectedColumns(sql, fileLabel) {
  const found = [];

  // ALTER TABLE intelligence.<table> ... ADD COLUMN [IF NOT EXISTS] <col> ...
  // Handles multiple ADD COLUMN clauses in one ALTER TABLE, and the common
  // one-ALTER-per-column style this codebase mostly uses.
  const alterRe = /ALTER TABLE\s+intelligence\.(\w+)\s+([\s\S]*?);/gi;
  let m;
  while ((m = alterRe.exec(sql)) !== null) {
    const table = m[1];
    const body = m[2];
    const addColRe = /ADD COLUMN(?:\s+IF NOT EXISTS)?\s+(\w+)/gi;
    let c;
    while ((c = addColRe.exec(body)) !== null) {
      found.push({ table, column: c[1], source: fileLabel });
    }
  }

  // CREATE TABLE intelligence.<table> ( col1 type, col2 type, ... )
  const createRe = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+intelligence\.(\w+)\s*\(([\s\S]*?)\n\);/gi;
  while ((m = createRe.exec(sql)) !== null) {
    const table = m[1];
    const body = m[2];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim().replace(/,\s*$/, '');
      if (!line || line.startsWith('--')) continue;
      // Skip table-level constraints (PRIMARY KEY, CHECK, FOREIGN KEY, UNIQUE(...))
      if (/^(PRIMARY KEY|CHECK|FOREIGN KEY|UNIQUE|CONSTRAINT)\b/i.test(line)) continue;
      const colMatch = line.match(/^(\w+)\s+/);
      if (colMatch) found.push({ table, column: colMatch[1], source: fileLabel });
    }
  }

  return found;
}

function loadExpectedColumns() {
  const files = [
    { path: join(DB_DIR, 'schema.sql'), label: 'schema.sql' },
    ...readdirSync(join(DB_DIR, 'migrations'))
      .filter(f => f.endsWith('.sql'))
      .sort() // numeric filename prefixes (002_, 003_, ...) sort correctly as strings here
      .map(f => ({ path: join(DB_DIR, 'migrations', f), label: `migrations/${f}` })),
  ];

  const all = [];
  for (const { path, label } of files) {
    let sql;
    try {
      sql = readFileSync(path, 'utf8');
    } catch {
      continue; // schema.sql is optional in some checkouts; migrations dir is required
    }
    all.push(...extractExpectedColumns(sql, label));
  }
  return all;
}

async function loadLiveColumns(client) {
  const { rows } = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'intelligence'`
  );
  const live = new Set(rows.map(r => `${r.table_name}.${r.column_name}`));
  return live;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set — cannot check live schema. Failing closed.');
    process.exit(1);
  }

  const expected = loadExpectedColumns();
  const expectedUnique = new Map(); // "table.column" -> first source that declared it
  for (const e of expected) {
    const key = `${e.table}.${e.column}`;
    if (!expectedUnique.has(key)) expectedUnique.set(key, e.source);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  let live;
  try {
    live = await loadLiveColumns(client);
  } finally {
    await client.end();
  }

  const missing = [];
  for (const [key, source] of expectedUnique) {
    if (!live.has(key)) missing.push({ key, source });
  }

  if (missing.length === 0) {
    console.log(`Migration drift check passed — ${expectedUnique.size} expected columns all present live.`);
    process.exit(0);
  }

  console.error(`Migration drift detected — ${missing.length} column(s) declared in migrations but not present in the live database:\n`);
  for (const { key, source } of missing) {
    console.error(`  intelligence.${key}  (declared in ${source})`);
  }
  console.error('\nThis PR would deploy code that may depend on these columns. Apply the missing migration(s) to the target database before merging, or confirm this drift is expected (e.g. a migration intentionally not yet applied) and adjust before proceeding.');
  process.exit(1);
}

export { extractExpectedColumns, loadExpectedColumns, loadLiveColumns };

// Only run as a CLI when invoked directly (`node check-migration-drift.mjs`),
// not when imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Migration drift check errored:', err);
    process.exit(1);
  });
}
