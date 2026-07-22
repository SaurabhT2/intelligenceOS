#!/usr/bin/env node
/**
 * scripts/context/lib/analyzer.mjs
 *
 * Shared, dependency-free (Node builtins only — fs/path/url) static-analysis
 * core for the IntelligenceOS Context Generation Framework.
 *
 * Every `generate-*.mjs` script imports `buildRepoModel()` from here rather
 * than re-walking the filesystem itself. This keeps every generated artifact
 * derived from ONE consistent pass over the source tree, which is what makes
 * "run twice without source changes → identical output" true: the model is
 * built once, deterministically, from sorted file lists and regex extraction
 * with no timestamps, randomness, or environment-dependent ordering baked in.
 *
 * This mirrors the regex-based approach already used by this repository's
 * own `packages/intelligence-os/scripts/check-boundaries.mjs` rather than
 * introducing a TypeScript-compiler-API dependency — consistent with the
 * mission's "zero new dependencies" spirit and this codebase's existing
 * tooling convention.
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// This file lives at scripts/context/lib/ — repo root is three levels up.
export const REPO_ROOT = join(__dirname, '..', '..', '..');

// ── Generic filesystem walking ──────────────────────────────────────────────

export function walkFiles(dir, { exts = null, excludeDirs = ['node_modules', 'dist', '.git', '.turbo'] } = {}, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (excludeDirs.includes(entry)) continue;
      walkFiles(full, { exts, excludeDirs }, out);
    } else {
      if (!exts || exts.some((e) => entry.endsWith(e))) out.push(full);
    }
  }
  return out;
}

export function rel(p) {
  return relative(REPO_ROOT, p).split(sep).join('/');
}

export function readText(p) {
  return readFileSync(p, 'utf8');
}

export function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

// ── Package discovery ────────────────────────────────────────────────────────

/** Reads pnpm-workspace.yaml globs (hand-rolled — no yaml dependency) and
 *  resolves every package.json under them, sorted by directory for
 *  determinism. */
export function discoverPackages() {
  const wsPath = join(REPO_ROOT, 'pnpm-workspace.yaml');
  const globs = [];
  if (existsSync(wsPath)) {
    const raw = readText(wsPath);
    for (const m of raw.matchAll(/^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*$/gm)) {
      globs.push(m[1].trim());
    }
  }
  const roots = new Set();
  for (const g of globs) {
    const base = g.replace(/\/\*+$/, '');
    const baseDir = join(REPO_ROOT, base);
    if (!existsSync(baseDir)) continue;
    if (g.endsWith('/*')) {
      for (const entry of readdirSync(baseDir).sort()) {
        const full = join(baseDir, entry);
        if (statSync(full).isDirectory() && existsSync(join(full, 'package.json'))) {
          roots.add(full);
        }
      }
    } else if (existsSync(join(baseDir, 'package.json'))) {
      roots.add(baseDir);
    }
  }
  const packages = [...roots].sort().map((dir) => {
    const pkgJson = JSON.parse(readText(join(dir, 'package.json')));
    return {
      dir,
      relDir: rel(dir),
      name: pkgJson.name,
      version: pkgJson.version,
      description: pkgJson.description ?? null,
      scripts: pkgJson.scripts ?? {},
      dependencies: Object.keys(pkgJson.dependencies ?? {}),
      devDependencies: Object.keys(pkgJson.devDependencies ?? {}),
      packageJson: pkgJson,
    };
  });
  return packages;
}

// ── Import / export extraction (regex, same pattern as check-boundaries) ───

const FROM_IMPORT_RE = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gs;
const BARE_IMPORT_RE = /\bimport\s*['"]([^'"]+)['"]/g;

export function extractImports(content) {
  const specs = [];
  for (const re of [FROM_IMPORT_RE, BARE_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      specs.push({ specifier: m[1], line: lineOf(content, m.index) });
    }
  }
  return specs;
}

/** Finds the JSDoc-style /** ... *\/ block immediately preceding `index`, if any. */
export function jsdocBefore(content, index) {
  const before = content.slice(0, index);
  // Find every /** ... */ block in `before`, non-greedily, then take the
  // LAST one — and only if nothing but whitespace separates its end from
  // `index` (otherwise it's some earlier method's doc, not this one's).
  const blockRe = /\/\*\*([\s\S]*?)\*\//g;
  let m;
  let last = null;
  while ((m = blockRe.exec(before)) !== null) {
    last = m;
  }
  if (!last) return null;
  const gapAfter = before.slice(last.index + last[0].length);
  if (!/^\s*$/.test(gapAfter)) return null; // something else sits between doc and target
  return last[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();
}

/** First doc comment or line comment block at the very top of a file. */
export function fileHeaderDoc(content) {
  const m = content.match(/^\/\*\*([\s\S]*?)\*\//);
  if (!m) return null;
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();
}

/** First sentence / summary line of a doc-comment block. */
export function summaryOf(doc) {
  if (!doc) return null;
  const cleaned = doc.split('\n').map((l) => l.trim()).filter(Boolean);
  // Skip a bare "Filename.ts" title line if present.
  const withoutTitle = cleaned[0] && /\.tsx?$/.test(cleaned[0]) ? cleaned.slice(1) : cleaned;
  const text = withoutTitle.join(' ');
  const m = text.match(/^(.*?[.!?])(\s|$)/);
  return (m ? m[1] : text).slice(0, 400);
}

const CLASS_RE = /export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w<>,.\s]+))?\s*\{/g;
const INTERFACE_RE = /export\s+interface\s+(\w+)(?:\s+extends\s+([\w<>,.\s]+))?\s*\{/g;
const TYPE_ALIAS_RE = /export\s+type\s+(\w+)(?:<[^=]*>)?\s*=/g;
const FUNCTION_RE = /export\s+(?:async\s+)?function\s+(\w+)\s*(<[^(]*>)?\s*\(/g;
const CONST_ARROW_RE = /export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/g;

/** Finds the matching closing brace for the `{` at `openIdx`. */
function matchBrace(content, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return content.length - 1;
}

// Param group is restricted to `[^{};]` (no braces/semicolons) rather than
// `[\s\S]` — a lazy `[\s\S]*?` would happily backtrack across an unrelated
// `if (x) throw new Error(...)` statement inside a *previous* method body to
// find some later `) {`, silently swallowing every method in between. This
// codebase's real parameter lists never contain `{`, `}`, or `;`, so the
// tighter class is both safe and what fixes that false-match class.
const METHOD_RE = /^[ \t]{2,4}(?:(private|protected|public)\s+)?(?:(static)\s+)?(?:(readonly)\s+)?(?:(async)\s+)?(?:(get|set)\s+)?(\w+)\s*(<[^(]*>)?\s*\(([^{};]*?)\)\s*(?::\s*([^{;=]+))?\s*\{/gm;

export function extractClassMethods(classBody) {
  const methods = [];
  const seen = new Set();
  METHOD_RE.lastIndex = 0;
  let m;
  while ((m = METHOD_RE.exec(classBody)) !== null) {
    const [, visibility, isStatic, , isAsync, accessor, name, generics, params, returnType] = m;
    if (['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name) && name !== 'constructor') continue;
    const key = `${name}:${m.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const doc = jsdocBefore(classBody, m.index);
    methods.push({
      name,
      visibility: visibility ?? 'public',
      static: !!isStatic,
      async: !!isAsync,
      accessor: accessor ?? null,
      params: params.trim().replace(/\s+/g, ' ').replace(/,\s*$/, ''),
      returnType: returnType ? returnType.trim() : null,
      doc: doc,
      summary: summaryOf(doc),
    });
  }
  return methods;
}

export function parseFile(absPath) {
  const content = readText(absPath);
  const file = {
    path: absPath,
    relPath: rel(absPath),
    content,
    headerDoc: fileHeaderDoc(content),
    headerSummary: summaryOf(fileHeaderDoc(content)),
    imports: extractImports(content),
    classes: [],
    interfaces: [],
    typeAliases: [],
    functions: [],
    constArrowFns: [],
  };

  CLASS_RE.lastIndex = 0;
  let m;
  while ((m = CLASS_RE.exec(content)) !== null) {
    const openIdx = content.indexOf('{', m.index);
    const closeIdx = matchBrace(content, openIdx);
    const body = content.slice(openIdx + 1, closeIdx);
    const doc = jsdocBefore(content, m.index);
    file.classes.push({
      name: m[1],
      extends: m[2] ?? null,
      implements: m[3] ? m[3].split(',').map((s) => s.trim()) : [],
      doc,
      summary: summaryOf(doc),
      methods: extractClassMethods(body),
      bodyStartLine: lineOf(content, openIdx),
      bodyEndLine: lineOf(content, closeIdx),
    });
  }

  INTERFACE_RE.lastIndex = 0;
  while ((m = INTERFACE_RE.exec(content)) !== null) {
    const doc = jsdocBefore(content, m.index);
    file.interfaces.push({
      name: m[1],
      extends: m[2] ? m[2].split(',').map((s) => s.trim()) : [],
      doc,
      summary: summaryOf(doc),
      line: lineOf(content, m.index),
    });
  }

  TYPE_ALIAS_RE.lastIndex = 0;
  while ((m = TYPE_ALIAS_RE.exec(content)) !== null) {
    const doc = jsdocBefore(content, m.index);
    file.typeAliases.push({ name: m[1], doc, summary: summaryOf(doc), line: lineOf(content, m.index) });
  }

  FUNCTION_RE.lastIndex = 0;
  while ((m = FUNCTION_RE.exec(content)) !== null) {
    const doc = jsdocBefore(content, m.index);
    file.functions.push({ name: m[1], doc, summary: summaryOf(doc), line: lineOf(content, m.index) });
  }

  CONST_ARROW_RE.lastIndex = 0;
  while ((m = CONST_ARROW_RE.exec(content)) !== null) {
    const doc = jsdocBefore(content, m.index);
    file.constArrowFns.push({ name: m[1], doc, summary: summaryOf(doc), line: lineOf(content, m.index) });
  }

  return file;
}

// ── Domain-specific extraction ───────────────────────────────────────────────

/** `.schema('intelligence').from('table_name')` occurrences, with the
 * chained operation immediately following (select/insert/update/upsert/delete). */
export function extractTableAccess(content) {
  const re = /\.schema\(\s*['"]([\w]+)['"]\s*\)\s*\.from\(\s*['"]([\w]+)['"]\s*\)([\s\S]{0,80}?)\.(select|insert|update|upsert|delete)\(/g;
  const out = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push({ schema: m[1], table: m[2], op: m[4], line: lineOf(content, m.index) });
  }
  return out;
}

/** `this.bus.emit('event.name'` / `this.bus.on('event.name'` occurrences. */
export function extractEventBusCalls(content) {
  const emitRe = /\.bus\.emit\(\s*['"]([\w.]+)['"]/g;
  const onRe = /\.bus\.on\(\s*['"]([\w.]+)['"]/g;
  const emits = [];
  const ons = [];
  let m;
  while ((m = emitRe.exec(content)) !== null) emits.push({ event: m[1], line: lineOf(content, m.index) });
  while ((m = onRe.exec(content)) !== null) ons.push({ event: m[1], line: lineOf(content, m.index) });
  return { emits, ons };
}

/** `req.method === 'GET' && url.pathname === '/v1/...'`-style route guards. */
export function extractHttpRoutes(content) {
  const re = /req\.method\s*===\s*['"](\w+)['"]\s*&&\s*url\.pathname\s*===\s*['"]([^'"]+)['"]/g;
  const out = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push({ method: m[1], path: m[2], line: lineOf(content, m.index) });
  }
  return out;
}

/** `CREATE TABLE schema.table (` blocks from a raw SQL schema file, with
 * column name/type pairs extracted line-by-line until the matching `);`. */
export function extractSqlTables(sql) {
  const tables = [];
  const re = /CREATE TABLE\s+([\w.]+)\s*\(/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const startIdx = sql.indexOf('(', m.index);
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < sql.length; i++) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    const body = sql.slice(startIdx + 1, endIdx);
    const columns = body
      .split(/,\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|CONSTRAINT)/i.test(l))
      .filter((l) => /^"?[A-Za-z_][\w]*"?\s+\S/.test(l))
      .map((l) => {
        const cm = l.match(/^"?(\w+)"?\s+([\w()[\],. ]+?)(\s+(NOT NULL|NULL|DEFAULT|REFERENCES|UNIQUE|PRIMARY KEY).*)?$/is);
        return cm ? { name: cm[1], type: cm[2].trim() } : { name: l.split(/\s+/)[0], type: null };
      });
    tables.push({ name: m[1], line: lineOf(sql, m.index), columns });
  }
  return tables;
}

/** Detects the repo's own conventions for "not really implemented":
 * `PhaseNotImplementedError`, `DomainNotActivatedError`, or a raw
 * `not_implemented` / `NotImplementedError` marker. Returns line numbers so
 * callers can attribute a stub marker to the enclosing method. */
export function extractStubMarkers(content) {
  const re = /\bnew\s+(PhaseNotImplementedError|DomainNotActivatedError|NotImplementedError)\s*\(/g;
  const out = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push({ marker: m[1], line: lineOf(content, m.index) });
  }
  return out;
}

/** `process.env.FOO` and `requireEnv('FOO')` references. */
export function extractEnvVars(content) {
  const out = new Set();
  for (const m of content.matchAll(/process\.env\.(\w+)/g)) out.add(m[1]);
  for (const m of content.matchAll(/requireEnv\(\s*['"](\w+)['"]/g)) out.add(m[1]);
  return [...out].sort();
}

/** `catch` blocks and `??`/`?? null`-style fallback expressions — a rough
 * but useful signal for "where does this module degrade gracefully." */
export function extractFallbackSignals(content) {
  const out = [];
  for (const m of content.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{/g)) {
    out.push({ kind: 'catch', line: lineOf(content, m.index) });
  }
  for (const m of content.matchAll(/createDegraded\w*\(/g)) {
    out.push({ kind: 'degraded-factory', line: lineOf(content, m.index) });
  }
  return out;
}

/** Resolves a relative import specifier (e.g. `../domains/index`) found in
 * `fromFile` to an absolute path of a real parsed file in `model`, trying
 * the common TS resolution suffixes. Returns null for package specifiers
 * or anything that doesn't resolve to a file we parsed (e.g. type-only
 * re-exports of a package). */
export function resolveImport(model, fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = join(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.mts`,
    join(base, 'index.ts'),
    join(base, 'index.mts'),
  ];
  for (const c of candidates) {
    const found = model.files.find((f) => f.path === c);
    if (found) return found.path;
  }
  return null;
}

/** Builds a file-level import graph: for every parsed file, which other
 * parsed files it imports (`edges`), and the inverse (`importedBy`). Only
 * intra-repo relative imports are resolved — package-boundary imports are
 * intentionally out of scope for this graph (that's what package.json
 * dependency lists already declare). */
export function buildImportGraph(model) {
  const edges = new Map(); // relPath -> Set(relPath)
  const importedBy = new Map(); // relPath -> Set(relPath)
  for (const f of model.files) importedBy.set(f.relPath, new Set());

  for (const f of model.files) {
    const targets = new Set();
    for (const imp of f.imports) {
      const resolved = resolveImport(model, f.path, imp.specifier);
      if (resolved) {
        const target = model.files.find((x) => x.path === resolved);
        if (target && target.relPath !== f.relPath) targets.add(target.relPath);
      }
    }
    edges.set(f.relPath, targets);
    for (const t of targets) {
      if (!importedBy.has(t)) importedBy.set(t, new Set());
      importedBy.get(t).add(f.relPath);
    }
  }
  return { edges, importedBy };
}

/** Tarjan-lite cycle detection over the file-level import graph — returns
 * an array of cycles (each an array of relPaths), deduped, sorted. */
export function findCycles(edges) {
  const cycles = [];
  const visited = new Set();
  const stack = [];
  const onStack = new Set();

  function visit(node) {
    visited.add(node);
    stack.push(node);
    onStack.add(node);
    for (const next of edges.get(node) ?? []) {
      if (!visited.has(next)) {
        visit(next);
      } else if (onStack.has(next)) {
        const idx = stack.indexOf(next);
        const cyclePath = stack.slice(idx);
        const key = [...cyclePath].sort().join('|');
        if (!cycles.some((c) => [...c].sort().join('|') === key)) {
          cycles.push(cyclePath);
        }
      }
    }
    stack.pop();
    onStack.delete(node);
  }

  for (const node of [...edges.keys()].sort()) {
    if (!visited.has(node)) visit(node);
  }
  return cycles;
}

/** `alter table <schema>.<table> add column if not exists <col> <type...>`
 * statements from a migration file — used to detect when `schema.sql` (the
 * "authoritative" consolidated schema) has drifted from what a migration
 * actually applied. */
export function extractAlterTableAddColumn(sql) {
  const re = /alter\s+table\s+([\w.]+)\s+add\s+column\s+if\s+not\s+exists\s+(\w+)\s+([\w()[\],. ]+?)(?:\s+(not null|null|default|references|unique|primary key).*)?;/gis;
  const out = [];
  let m;
  while ((m = re.exec(sql)) !== null) {
    out.push({ table: m[1].replace(/^intelligence\./, ''), column: m[2], type: m[3].trim() });
  }
  return out;
}

// ── The unified repo model ───────────────────────────────────────────────────

let _cachedModel = null;

export function buildRepoModel({ force = false } = {}) {
  if (_cachedModel && !force) return _cachedModel;

  const packages = discoverPackages();
  const allTsFiles = [];
  for (const pkg of packages) {
    for (const dir of ['src', 'api', 'scripts']) {
      const full = join(pkg.dir, dir);
      walkFiles(full, { exts: ['.ts', '.mts'] }, allTsFiles);
    }
  }
  // De-dup + sort for determinism.
  const uniqueFiles = [...new Set(allTsFiles)]
    .filter((f) => !f.endsWith('.d.ts'))
    .sort();

  const parsedFiles = uniqueFiles.map(parseFile);

  const model = {
    root: REPO_ROOT,
    packages,
    files: parsedFiles,
    generatedAt: null, // filled in by generators that need it; kept out of
                        // hashed/comparable content so re-runs stay diffable.
  };

  _cachedModel = model;
  return model;
}

export function findFile(model, relSuffix) {
  return model.files.find((f) => f.relPath.endsWith(relSuffix));
}

export function filesUnder(model, relPrefix) {
  return model.files.filter((f) => f.relPath.startsWith(relPrefix));
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

/** Writes a generated artifact, ensuring its parent directory exists and
 * every file ends with exactly one trailing newline (reproducibility). */
export function writeGenerated(absPath, contents) {
  ensureDir(dirname(absPath));
  const normalized = contents.replace(/\s+$/, '') + '\n';
  writeFileSync(absPath, normalized, 'utf8');
}

export const GENERATED_HEADER_NOTE =
  '> **Generated file — do not edit by hand.** Produced by `scripts/context/`. ' +
  'Re-run `pnpm context:generate` (or `pnpm context:refresh`) to regenerate. ' +
  'See `READMEFIRST.md` at the repo root before using this file.';
