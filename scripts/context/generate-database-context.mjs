#!/usr/bin/env node
/**
 * generate-database-context.mjs
 * Produces .context/database_context.generated.md from
 * packages/intelligence-os/src/db/schema.sql (authoritative schema) plus
 * the migrations directory and actual `.from(table)` call sites — so it
 * also flags any table declared in schema.sql that no domain code ever
 * touches (a real signal, not documentation drift).
 */
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE,
  readText, extractSqlTables, extractTableAccess, extractAlterTableAddColumn,
} from './lib/analyzer.mjs';

export function generate(model) {
  const schemaPath = join(REPO_ROOT, 'packages/intelligence-os/src/db/schema.sql');
  const sql = readText(schemaPath);
  const tables = extractSqlTables(sql);

  const accessedTables = new Set();
  for (const f of model.files) {
    for (const a of extractTableAccess(f.content)) accessedTables.add(`${a.schema}.${a.table}`);
  }

  const migrationsDir = join(REPO_ROOT, 'packages/intelligence-os/src/db/migrations');
  let migrations = [];
  try {
    migrations = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  } catch { /* no migrations dir */ }

  // Schema/migration drift: does every column a migration added actually
  // appear in schema.sql (the "authoritative" consolidated schema)? A
  // migration is the ground truth for what's live in the database;
  // schema.sql is a hand-maintained mirror of it and can fall behind.
  const schemaColumnsByTable = new Map(tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]));
  const driftFindings = [];
  for (const m of migrations) {
    const migrationSql = readText(join(migrationsDir, m));
    for (const added of extractAlterTableAddColumn(migrationSql)) {
      const cols = schemaColumnsByTable.get(added.table);
      if (!cols || !cols.has(added.column)) {
        driftFindings.push({ migration: m, table: added.table, column: added.column, type: added.type });
      }
    }
  }

  const lines = [];
  lines.push('# Database Context');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    `Authoritative schema: \`packages/intelligence-os/src/db/schema.sql\` (${tables.length} tables in the ` +
    '`intelligence` schema). Every table is owned by exactly one Domain class — see ' +
    'the "Domain Ownership" section of `architecture.generated.md` for the ownership map and live call sites.'
  );
  lines.push('');

  lines.push('## Tables');
  lines.push('');
  for (const t of tables) {
    const accessed = accessedTables.has(t.name);
    lines.push(`### \`${t.name}\`${accessed ? '' : '  ⚠️ no in-code `.from()` access found'}`);
    lines.push('');
    lines.push('| Column | Type |');
    lines.push('|---|---|');
    for (const c of t.columns) {
      lines.push(`| \`${c.name}\` | ${c.type ?? '—'} |`);
    }
    lines.push('');
  }

  lines.push('## Migrations (applied in order)');
  lines.push('');
  if (migrations.length === 0) {
    lines.push('_(no migrations directory found)_');
  } else {
    for (const m of migrations) lines.push(`- \`${m}\``);
  }
  lines.push('');

  lines.push('## Health signal: schema/migration drift');
  lines.push('');
  lines.push(
    'A migration file is ground truth for what a column actually is in the live database; ' +
    '`schema.sql` is a hand-maintained consolidated mirror of all migrations and can fall behind. ' +
    'This checks every `alter table ... add column if not exists ...` statement across ' +
    '`db/migrations/*.sql` against `schema.sql`\'s column list for that table.'
  );
  lines.push('');
  if (driftFindings.length === 0) {
    lines.push('No drift found — every column added by a migration is present in `schema.sql`.');
  } else {
    lines.push('`schema.sql` is missing the following column(s) that a migration added:');
    lines.push('');
    lines.push('| Migration | Table | Column | Type |');
    lines.push('|---|---|---|---|');
    for (const d of driftFindings) {
      lines.push(`| \`${d.migration}\` | \`${d.table}\` | \`${d.column}\` | ${d.type} |`);
    }
  }
  lines.push('');

  const unaccessed = tables.filter((t) => !accessedTables.has(t.name));
  lines.push('## Health signal: schema/code gap');
  lines.push('');
  if (unaccessed.length === 0) {
    lines.push('Every table in `schema.sql` has at least one in-code `.from()` access site.');
  } else {
    lines.push(
      'The following tables are declared in `schema.sql` but no ' +
      '`.schema(\'intelligence\').from(table)` call site was found anywhere in ' +
      '`packages/intelligence-os/src` — either dead schema, a not-yet-wired domain, ' +
      'or access via a code path this generator\'s regex does not recognize (verify by hand ' +
      'before treating as confirmed dead):'
    );
    lines.push('');
    for (const t of unaccessed) lines.push(`- \`${t.name}\``);
  }
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'database_context.generated.md'), generate(model));
  console.log('✅ .context/database_context.generated.md');
}
