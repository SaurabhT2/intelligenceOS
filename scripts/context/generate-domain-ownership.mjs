#!/usr/bin/env node
/**
 * generate-domain-ownership.mjs
 * Produces .context/domain_ownership.generated.md — for every
 * `intelligence.*` table: owning Domain class, writers, readers, public
 * APIs, and forbidden access, derived from:
 *   - each domains/*.ts file's leading "Owns:" docblock line
 *   - actual `.schema('intelligence').from(table)...op()` call sites (writers
 *     vs readers, by operation)
 *   - the import graph (who else, if anyone, imports a domains/*.ts file —
 *     which should be pipeline/blueprint/context/api callers only)
 *   - RULE-* boundary rules already enforced by check-boundaries.mjs
 *     (forbidden access is a mechanical fact, not a guess)
 */
import { join } from 'node:path';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE,
  filesUnder, extractTableAccess, buildImportGraph,
} from './lib/analyzer.mjs';

const WRITE_OPS = new Set(['insert', 'update', 'upsert', 'delete']);
const READ_OPS = new Set(['select']);

export function generate(model) {
  const domainFiles = filesUnder(model, 'packages/intelligence-os/src/domains/').filter(
    (f) => f.classes.length > 0
  );
  const { importedBy } = buildImportGraph(model);

  // table -> { owner, writers:Set<opLoc>, readers:Set<opLoc> }
  const tableMap = new Map();
  for (const f of model.files) {
    const accesses = extractTableAccess(f.content);
    for (const a of accesses) {
      const key = `${a.schema}.${a.table}`;
      if (!tableMap.has(key)) tableMap.set(key, { writers: [], readers: [] });
      const entry = tableMap.get(key);
      const loc = `${f.relPath}:${a.line} (${a.op})`;
      if (WRITE_OPS.has(a.op)) entry.writers.push(loc);
      else if (READ_OPS.has(a.op)) entry.readers.push(loc);
    }
  }

  const lines = [];
  lines.push('# Domain Ownership Map');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'This is the persistence boundary of IntelligenceOS: every `intelligence.*` ' +
    'Postgres table has exactly one owning Domain class in ' +
    '`packages/intelligence-os/src/domains/`, mechanically enforced by ' +
    '`RULE-PIPELINE-NO-DIRECT-DB` in `packages/intelligence-os/scripts/check-boundaries.mjs` ' +
    '(no `pipeline/`, `knowledge/`, `blueprint/`, or `context/` file may import ' +
    '`@supabase/supabase-js` directly).'
  );
  lines.push('');

  for (const f of domainFiles) {
    const cls = f.classes[0];
    const ownsMatch = (f.headerDoc ?? '').match(/Owns:\s*([\s\S]*?)(?:\n\s*\n|$)/);
    const owns = ownsMatch
      ? ownsMatch[1].split('\n').map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim()
      : '(see class doc)';
    lines.push(`## \`${cls.name}\``);
    lines.push('');
    lines.push(`- **File:** \`${f.relPath}\``);
    lines.push(`- **Owns (declared):** ${owns}`);
    lines.push(`- **Public API surface (${cls.methods.filter((m) => m.name !== 'constructor').length} methods):**`);
    lines.push('');
    for (const m of cls.methods) {
      if (m.name === 'constructor') continue;
      lines.push(`  - \`${m.async ? 'async ' : ''}${m.name}(${m.params})${m.returnType ? ': ' + m.returnType.trim() : ''}\`${m.summary ? ' — ' + m.summary : ''}`);
    }
    lines.push('');
    const callers = [...(importedBy.get(f.relPath) ?? [])].sort();
    lines.push(`- **Imported by (readers/writers of this domain's data, one level removed):**`);
    if (callers.length === 0) {
      lines.push('  - _(no in-repo importers found — check if this domain is wired at all)_');
    } else {
      for (const c of callers) lines.push(`  - \`${c}\``);
    }
    lines.push('');
    lines.push('- **Forbidden access:** no other `domains/*.ts` file, and no `pipeline/`, `knowledge/`, `blueprint/`, or `context/` file, may hold a `SupabaseClient` or query these tables directly — all access must go through the methods above.');
    lines.push('');
  }

  lines.push('## Table-level access ledger (mechanically extracted call sites)');
  lines.push('');
  lines.push('| Table | Writers (file:line, op) | Readers (file:line, op) |');
  lines.push('|---|---|---|');
  for (const [table, entry] of [...tableMap.entries()].sort()) {
    const w = entry.writers.length ? entry.writers.map((x) => `\`${x}\``).join('<br>') : '_(none found)_';
    const r = entry.readers.length ? entry.readers.map((x) => `\`${x}\``).join('<br>') : '_(none found)_';
    lines.push(`| \`${table}\` | ${w} | ${r} |`);
  }
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'domain_ownership.generated.md'), generate(model));
  console.log('✅ .context/domain_ownership.generated.md');
}
