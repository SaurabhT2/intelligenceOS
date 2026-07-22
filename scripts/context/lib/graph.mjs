#!/usr/bin/env node
/**
 * scripts/context/lib/graph.mjs
 *
 * The Architecture Knowledge Graph: a canonical node/edge model of
 * IntelligenceOS built on top of the same primitives `lib/analyzer.mjs`
 * already extracts (imports, classes/methods, table access, event bus
 * calls, HTTP routes, SQL schema). This is an ADDITIVE layer — it does not
 * change what `lib/analyzer.mjs` returns or how the 18 pre-existing
 * `generate-*.mjs` scripts work. Those scripts continue to call
 * `buildRepoModel()` directly and their output is verified byte-identical
 * before and after this module was introduced (see
 * `.context/architecture-intelligence/architecture_index.generated.md`
 * §"Migration note" for why full migration of the legacy generators onto
 * this graph was deliberately NOT done in this pass).
 *
 * ── Node shape ───────────────────────────────────────────────────────────
 *   { id, type, label, file, line, metadata }
 *
 * ── Edge shape ───────────────────────────────────────────────────────────
 *   { from, to, type, metadata }
 *
 * Edge `type` is one of the semantic relationships from the mission:
 * OWNS, READS, WRITES, CALLS, IMPLEMENTS, EMITS, CONSUMES, DEPENDS_ON,
 * RETURNS, BUILDS, SYNTHESIZES, CONTRIBUTES_TO, REBUILDS, PERSISTS, USES,
 * REFERENCES.
 */
import {
  buildRepoModel, buildImportGraph, extractTableAccess, extractEventBusCalls,
  extractHttpRoutes, findFile, resolveImport,
} from './analyzer.mjs';

// ── ID helpers ───────────────────────────────────────────────────────────

const idModule = (relPath) => `module:${relPath}`;
const idClass = (relPath, name) => `class:${relPath}#${name}`;
const idMethod = (relPath, cls, name) => `method:${relPath}#${cls}.${name}`;
const idInterface = (relPath, name) => `interface:${relPath}#${name}`;
const idTable = (schema, table) => `table:${schema}.${table}`;
const idEvent = (name) => `event:${name}`;
const idRoute = (method, path) => `route:${method} ${path}`;
const idPackage = (name) => `package:${name}`;
const idField = (kind, name) => `${kind}:${name}`; // contextfield:foo / profilefield:foo

const ROUTE_HANDLER_HINTS = {
  '/v1/cognition/resolve': { file: 'packages/intelligence-os/src/api/CognitionProviderImpl.ts', cls: 'CognitionProviderImpl', method: 'resolveCognitionContext' },
  '/v1/cognition/observe': { file: 'packages/intelligence-os/src/api/CognitionProviderImpl.ts', cls: 'CognitionProviderImpl', method: 'observe' },
  '/v1/cognition/review': { file: 'packages/intelligence-os/src/api/CognitionProviderImpl.ts', cls: 'CognitionProviderImpl', method: 'review' },
  '/v1/cognition/summary': { file: 'packages/intelligence-os/src/api/CognitionProviderImpl.ts', cls: 'CognitionProviderImpl', method: 'summarizeCognition' },
  '/v1/cognition/health': { file: 'packages/intelligence-os/src/api/HealthChecker.ts', cls: 'HealthChecker', method: 'check' },
  '/v1/knowledge/ingest': { file: 'packages/intelligence-os/src/IntelligenceOS.ts', cls: 'IntelligenceOS', method: 'ingestKnowledgeAsset' },
  '/v1/workspace-configuration': { file: 'packages/intelligence-os/src/IntelligenceOS.ts', cls: 'IntelligenceOS', method: 'ingestWorkspaceConfiguration' },
  '/v1/intelligence/feedback': { file: 'packages/intelligence-os/src/IntelligenceOS.ts', cls: 'IntelligenceOS', method: 'recordFeedbackEvent' },
  '/v1/intelligence/correction': { file: 'packages/intelligence-os/src/IntelligenceOS.ts', cls: 'IntelligenceOS', method: 'recordCorrection' },
};

const WRITE_OPS = new Set(['insert', 'update', 'upsert', 'delete']);
const READ_OPS = new Set(['select']);

class Graph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }
  addNode(node) {
    if (!this.nodes.has(node.id)) this.nodes.set(node.id, node);
    return node.id;
  }
  addEdge(from, to, type, metadata = {}) {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return; // only well-formed edges
    this.edges.push({ from, to, type, metadata });
  }
  edgesFrom(id, type = null) {
    return this.edges.filter((e) => e.from === id && (!type || e.type === type));
  }
  edgesTo(id, type = null) {
    return this.edges.filter((e) => e.to === id && (!type || e.type === type));
  }
  node(id) { return this.nodes.get(id); }

  /** Breadth-first shortest path between two nodes, following edges of any
   * of `types` (or all edges if types is null), in the given direction. */
  bfsPath(startId, endId, { types = null, maxDepth = 12 } = {}) {
    if (!this.nodes.has(startId) || !this.nodes.has(endId)) return null;
    const queue = [[startId]];
    const visited = new Set([startId]);
    while (queue.length) {
      const path = queue.shift();
      const last = path[path.length - 1];
      if (last === endId) return path;
      if (path.length > maxDepth) continue;
      for (const e of this.edgesFrom(last)) {
        if (types && !types.includes(e.type)) continue;
        if (!visited.has(e.to)) {
          visited.add(e.to);
          queue.push([...path, e.to]);
        }
      }
    }
    return null;
  }

  /** All nodes reachable forward from `startId` following edges of `types`. */
  reachable(startId, { types = null, maxDepth = 20 } = {}) {
    const visited = new Set();
    let frontier = [startId];
    let depth = 0;
    while (frontier.length && depth < maxDepth) {
      const next = [];
      for (const id of frontier) {
        for (const e of this.edgesFrom(id)) {
          if (types && !types.includes(e.type)) continue;
          if (!visited.has(e.to)) { visited.add(e.to); next.push(e.to); }
        }
      }
      frontier = next;
      depth++;
    }
    return visited;
  }

  toJSON() {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      nodes: [...this.nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...this.edges].sort((a, b) => (a.from + a.type + a.to).localeCompare(b.from + b.type + b.to)),
    };
  }
}

let _cached = null;

export function buildArchitectureGraph({ force = false } = {}) {
  if (_cached && !force) return _cached;
  const model = buildRepoModel();
  const g = new Graph();

  // ── Repository + package nodes ─────────────────────────────────────────
  g.addNode({ id: 'repo:IntelligenceOS', type: 'Repository', label: 'IntelligenceOS', file: null, line: null, metadata: {} });
  for (const pkg of model.packages) {
    g.addNode({ id: idPackage(pkg.name), type: 'Package', label: pkg.name, file: pkg.relDir, line: null, metadata: { version: pkg.version, description: pkg.description } });
    g.addEdge(idPackage(pkg.name), 'repo:IntelligenceOS', 'USES', { relation: 'member-of' });
  }

  // ── Module nodes ────────────────────────────────────────────────────────
  for (const f of model.files) {
    const pkg = model.packages.find((p) => f.relPath.startsWith(p.relDir + '/'));
    g.addNode({ id: idModule(f.relPath), type: 'Module', label: f.relPath, file: f.relPath, line: null, metadata: { package: pkg?.name ?? null } });
    if (pkg) g.addEdge(idModule(f.relPath), idPackage(pkg.name), 'USES', { relation: 'member-of' });
  }

  // ── Class / Interface / Method nodes ────────────────────────────────────
  for (const f of model.files) {
    for (const cls of f.classes) {
      const classId = idClass(f.relPath, cls.name);
      const isDomain = f.relPath.includes('/domains/');
      g.addNode({
        id: classId,
        type: isDomain ? 'Domain' : 'Class',
        label: cls.name,
        file: f.relPath,
        line: cls.bodyStartLine,
        metadata: { extends: cls.extends, implements: cls.implements, summary: cls.summary },
      });
      g.addEdge(classId, idModule(f.relPath), 'USES', { relation: 'defined-in' });
      if (cls.extends) {
        // extends target may or may not be a parsed class in this repo; add
        // node lazily as an external reference if not already present.
        const superId = `class:external#${cls.extends}`;
        if (!g.nodes.has(superId) && !model.files.some((x) => x.classes.some((c) => c.name === cls.extends))) {
          g.addNode({ id: superId, type: 'Class', label: cls.extends, file: null, line: null, metadata: { external: true } });
        }
      }
      for (const iface of cls.implements) {
        const ifaceId = `interface:external#${iface}`;
        const known = model.files.flatMap((x) => x.interfaces.map((i) => idInterface(x.relPath, i.name))).find((id) => id.endsWith(`#${iface}`));
        const targetId = known ?? ifaceId;
        if (!g.nodes.has(targetId)) g.addNode({ id: targetId, type: 'Interface', label: iface, file: null, line: null, metadata: { external: true } });
        g.addEdge(classId, targetId, 'IMPLEMENTS', {});
      }
      for (const m of cls.methods) {
        if (m.name === 'constructor') continue;
        const methodId = idMethod(f.relPath, cls.name, m.name);
        g.addNode({
          id: methodId,
          type: 'Method',
          label: `${cls.name}.${m.name}`,
          file: f.relPath,
          line: null,
          metadata: { async: m.async, visibility: m.visibility, params: m.params, returnType: m.returnType, summary: m.summary },
        });
        g.addEdge(methodId, classId, 'USES', { relation: 'member-of' });
      }
    }
    for (const iface of f.interfaces) {
      g.addNode({ id: idInterface(f.relPath, iface.name), type: 'Interface', label: iface.name, file: f.relPath, line: iface.line, metadata: { summary: iface.summary } });
    }
  }

  // ── DEPENDS_ON: module import graph ─────────────────────────────────────
  const { edges: importEdges } = buildImportGraph(model);
  for (const [from, targets] of importEdges) {
    for (const to of targets) {
      g.addEdge(idModule(from), idModule(to), 'DEPENDS_ON', {});
    }
  }

  // ── OWNS / READS / WRITES / PERSISTS: domain -> table ───────────────────
  for (const f of model.files) {
    if (!f.relPath.includes('/domains/')) continue;
    const cls = f.classes[0];
    if (!cls) continue;
    const classId = idClass(f.relPath, cls.name);
    const ownsMatch = (f.headerDoc ?? '').match(/Owns:\s*([\s\S]*?)(?:\n\s*\n|$)/);
    const ownedTables = ownsMatch
      ? [...ownsMatch[1].matchAll(/intelligence\.(\w+)/g)].map((m) => m[1])
      : [];
    for (const t of ownedTables) {
      const tableId = idTable('intelligence', t);
      if (!g.nodes.has(tableId)) g.addNode({ id: tableId, type: 'Table', label: `intelligence.${t}`, file: 'packages/intelligence-os/src/db/schema.sql', line: null, metadata: {} });
      g.addEdge(classId, tableId, 'OWNS', {});
    }
    const accesses = extractTableAccess(f.content);
    for (const a of accesses) {
      const tableId = idTable(a.schema, a.table);
      if (!g.nodes.has(tableId)) g.addNode({ id: tableId, type: 'Table', label: `${a.schema}.${a.table}`, file: 'packages/intelligence-os/src/db/schema.sql', line: null, metadata: {} });
      if (WRITE_OPS.has(a.op)) {
        g.addEdge(classId, tableId, 'WRITES', { op: a.op, line: a.line });
        g.addEdge(classId, tableId, 'PERSISTS', { op: a.op, line: a.line });
      } else if (READ_OPS.has(a.op)) {
        g.addEdge(classId, tableId, 'READS', { op: a.op, line: a.line });
      }
    }
  }

  // ── EMITS / CONSUMES: class -> event ────────────────────────────────────
  for (const f of model.files) {
    const { emits, ons } = extractEventBusCalls(f.content);
    if (emits.length === 0 && ons.length === 0) continue;
    const enclosingClass = f.classes[0]; // best-effort: one primary class per file in this codebase
    const sourceId = enclosingClass ? idClass(f.relPath, enclosingClass.name) : idModule(f.relPath);
    for (const e of emits) {
      const eventId = idEvent(e.event);
      if (!g.nodes.has(eventId)) g.addNode({ id: eventId, type: 'Event', label: e.event, file: 'packages/intelligence-os/src/types/events.ts', line: null, metadata: {} });
      g.addEdge(sourceId, eventId, 'EMITS', { line: e.line });
    }
    for (const o of ons) {
      const eventId = idEvent(o.event);
      if (!g.nodes.has(eventId)) g.addNode({ id: eventId, type: 'Event', label: o.event, file: 'packages/intelligence-os/src/types/events.ts', line: null, metadata: {} });
      g.addEdge(sourceId, eventId, 'CONSUMES', { line: o.line });
    }
  }
  // Declared-but-unwired events still get nodes (so gaps are graph-visible).
  const eventsFile = findFile(model, 'types/events.ts');
  if (eventsFile) {
    for (const m of eventsFile.content.matchAll(/^\s*\|\s*'([\w.]+)'/gm)) {
      const eventId = idEvent(m[1]);
      if (!g.nodes.has(eventId)) g.addNode({ id: eventId, type: 'Event', label: m[1], file: 'packages/intelligence-os/src/types/events.ts', line: null, metadata: { declaredOnly: true } });
    }
  }

  // ── CALLS: HTTP route -> handler method ─────────────────────────────────
  const serverFile = findFile(model, 'api/http/server.ts');
  if (serverFile) {
    const routes = extractHttpRoutes(serverFile.content);
    for (const r of routes) {
      const routeId = idRoute(r.method, r.path);
      g.addNode({ id: routeId, type: 'HttpApi', label: `${r.method} ${r.path}`, file: serverFile.relPath, line: r.line, metadata: {} });
      const hint = ROUTE_HANDLER_HINTS[r.path];
      if (hint) {
        const methodId = idMethod(hint.file, hint.cls, hint.method);
        if (g.nodes.has(methodId)) g.addEdge(routeId, methodId, 'CALLS', {});
      }
    }
  }

  // ── CALLS: method -> method, resolved via constructor field types ───────
  // Build, per class, a map of `this.<field>` -> the class type of that
  // field, from TWO sources: (a) constructor parameter-property injection
  // (`constructor(private readonly x: Foo)`), and (b) a plain field
  // instantiated inside the constructor body (`this.x = new Foo(...)`) —
  // the pattern a class with no external dependencies of its own (e.g.
  // `EvidenceExtractor`) is constructed with. Then scan each method body
  // for `this.<field>.<method>(` call sites.
  for (const f of model.files) {
    for (const cls of f.classes) {
      const ctor = cls.methods.find((m) => m.name === 'constructor');
      const fieldTypes = new Map();
      if (ctor) {
        for (const m of ctor.params.matchAll(/(?:private|protected|public|readonly)\s+(?:readonly\s+)?(\w+)\s*:\s*(\w+)/g)) {
          fieldTypes.set(m[1], m[2]);
        }
      }
      // Constructor-body instantiation: `this.<field> = new <ClassName>(`.
      // Re-locate the constructor's own body text (ctor.params doesn't
      // include it) via brace matching against the file, same technique
      // used below for every other method.
      const ctorRe = /\bconstructor\s*\([^{};]*\)\s*(?::[^{;=]+)?\s*\{/;
      const ctorMatch = ctorRe.exec(f.content.slice(f.content.indexOf(`class ${cls.name}`)));
      if (ctorMatch) {
        const classStart = f.content.indexOf(`class ${cls.name}`);
        const ctorOpenIdx = classStart + ctorMatch.index + ctorMatch[0].length - 1;
        let cDepth = 0, ctorCloseIdx = ctorOpenIdx;
        for (let i = ctorOpenIdx; i < f.content.length; i++) {
          if (f.content[i] === '{') cDepth++;
          else if (f.content[i] === '}') { cDepth--; if (cDepth === 0) { ctorCloseIdx = i; break; } }
        }
        const ctorBody = f.content.slice(ctorOpenIdx, ctorCloseIdx);
        for (const m of ctorBody.matchAll(/this\.(\w+)\s*=\s*new\s+(\w+)\s*\(/g)) {
          if (!fieldTypes.has(m[1])) fieldTypes.set(m[1], m[2]);
        }
      }
      if (fieldTypes.size === 0) continue;
      // Re-extract each method's raw body text via brace matching against the file.
      for (const m of cls.methods) {
        if (m.name === 'constructor') continue;
        const methodId = idMethod(f.relPath, cls.name, m.name);
        const re = new RegExp(`\\b${m.name}\\s*\\([^{};]*\\)\\s*(?::[^{;=]+)?\\s*\\{`);
        const mm = re.exec(f.content);
        if (!mm) continue;
        const openIdx = f.content.indexOf('{', mm.index);
        let depth = 0, closeIdx = openIdx;
        for (let i = openIdx; i < f.content.length; i++) {
          if (f.content[i] === '{') depth++;
          else if (f.content[i] === '}') { depth--; if (depth === 0) { closeIdx = i; break; } }
        }
        const body = f.content.slice(openIdx, closeIdx);
        for (const call of body.matchAll(/this\.(\w+)\.(\w+)\(/g)) {
          const targetType = fieldTypes.get(call[1]);
          if (!targetType) continue;
          const targetFile = model.files.find((x) => x.classes.some((c) => c.name === targetType));
          if (!targetFile) continue;
          const targetMethodId = idMethod(targetFile.relPath, targetType, call[2]);
          if (g.nodes.has(targetMethodId)) g.addEdge(methodId, targetMethodId, 'CALLS', {});
        }
      }
    }
  }

  // ── BUILDS / CONTRIBUTES_TO / SYNTHESIZES: CognitionContext + Profile fields ─
  // Profile fields first — ContextBuilder's fields reference Profile fields,
  // not the other way around, so this order lets that cross-reference resolve.
  addProfileFieldEdges(g, model);
  addContextFieldEdges(g, model);

  _cached = g;
  return g;
}

/** Locates `return { ... }`-shaped object literal fields inside a method,
 * mapping field name -> its initializer expression (shorthand-aware). Used
 * to wire CONTRIBUTES_TO edges from whichever function produced a field's
 * value to the field node itself. */
function extractObjectFields(fileContent, methodNamePattern, returnMarker = 'return {') {
  const re = new RegExp(`\\b${methodNamePattern}\\s*\\([^{};]*\\)\\s*(?::[^{;=]+)?\\s*\\{`);
  const m = re.exec(fileContent);
  if (!m) return [];
  const methodOpenIdx = fileContent.indexOf('{', m.index);
  let depth = 0, methodCloseIdx = methodOpenIdx;
  for (let i = methodOpenIdx; i < fileContent.length; i++) {
    if (fileContent[i] === '{') depth++;
    else if (fileContent[i] === '}') { depth--; if (depth === 0) { methodCloseIdx = i; break; } }
  }
  const methodBody = fileContent.slice(methodOpenIdx, methodCloseIdx);
  const retIdx = methodBody.indexOf(returnMarker);
  if (retIdx === -1) return [];
  const openIdx = methodBody.indexOf('{', retIdx);
  let d2 = 0, closeIdx = openIdx;
  for (let i = openIdx; i < methodBody.length; i++) {
    if ('{(['.includes(methodBody[i])) d2++;
    else if ('})]'.includes(methodBody[i])) { d2--; if (d2 === 0) { closeIdx = i; break; } }
  }
  const body = methodBody.slice(openIdx + 1, closeIdx);
  const fields = [];
  let depth3 = 0, fieldStart = 0, currentKey = null;
  const pushShorthand = (seg) => {
    const t = seg.trim();
    const mm = t.match(/^([A-Za-z_$][\w$]*)$/);
    if (mm) fields.push({ key: mm[1], expr: mm[1] });
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if ('{(['.includes(ch)) depth3++;
    else if ('})]'.includes(ch)) depth3--;
    if (depth3 === 0 && ch === ':' && currentKey === null) {
      const km = body.slice(fieldStart, i).match(/([A-Za-z_$][\w$]*)\s*$/);
      currentKey = km ? km[1] : null;
      fieldStart = i + 1;
    } else if (depth3 === 0 && ch === ',') {
      if (currentKey !== null) { fields.push({ key: currentKey, expr: body.slice(fieldStart, i).trim() }); currentKey = null; }
      else pushShorthand(body.slice(fieldStart, i));
      fieldStart = i + 1;
    }
  }
  if (currentKey !== null) fields.push({ key: currentKey, expr: body.slice(fieldStart).trim() });
  else pushShorthand(body.slice(fieldStart));
  return fields;
}

/** For a shorthand return property (e.g. `return { voice, ... }`), the field's
 * "expression" as extracted from the object literal is just the bare
 * identifier `voice` — useless for producer-matching. This resolves that
 * identifier back to its `const voice = <initializer>;` declaration
 * elsewhere in the same file (methods in this codebase compute a field's
 * value in a local variable, then return it by shorthand), so producer
 * lookups can still match against the real initializer expression. */
function resolveLocalVariable(fileContent, identifier) {
  const re = new RegExp(`\\bconst\\s+${identifier}\\s*=\\s*`, 'g');
  const m = re.exec(fileContent);
  if (!m) return null;
  const startIdx = m.index + m[0].length;
  let depth = 0;
  for (let i = startIdx; i < fileContent.length; i++) {
    const ch = fileContent[i];
    if ('{(['.includes(ch)) depth++;
    else if ('})]'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) return fileContent.slice(startIdx, i).trim();
  }
  return null;
}

function addContextFieldEdges(g, model) {
  const f = findFile(model, 'context/ContextBuilder.ts');
  if (!f) return;
  const cls = f.classes.find((c) => c.name === 'ContextBuilder');
  const buildMethodId = cls ? idMethod(f.relPath, 'ContextBuilder', 'build') : null;
  const fields = extractObjectFields(f.content, 'build');
  // function-name -> the module/class that defines it, for CONTRIBUTES_TO source resolution.
  const producerLookup = new Map([
    ['deriveVoiceProfile', 'context/voiceMapping.ts'],
    ['deriveConfidence', 'context/voiceMapping.ts'],
    ['deriveLastConsolidatedAt', 'context/voiceMapping.ts'],
    ['deriveIdentityContribution', 'context/identitySynthesis.ts'],
    ['applyVoiceConfiguration', 'context/ContextBuilder.ts'],
    ['applyIdentityConfiguration', 'context/ContextBuilder.ts'],
    ['projectSynthesizedCollection', 'context/ContextBuilder.ts'],
  ]);
  for (const field of fields) {
    const fieldId = idField('contextfield', field.key);
    // Bare identifier (shorthand return property) → resolve to its local
    // `const` initializer so producer-matching below has something to match.
    const isBareIdentifier = /^[A-Za-z_$][\w$]*$/.test(field.expr);
    const resolvedExpr = isBareIdentifier ? resolveLocalVariable(f.content, field.expr) : null;
    const matchExpr = resolvedExpr ?? field.expr;
    if (!g.nodes.has(fieldId)) {
      const displayExpr = resolvedExpr ? `${field.expr} = ${resolvedExpr}` : field.expr;
      g.addNode({ id: fieldId, type: 'ContextField', label: `CognitionContext.${field.key}`, file: f.relPath, line: null, metadata: { originExpression: displayExpr.length > 300 ? displayExpr.slice(0, 300) + '…' : displayExpr } });
    }
    if (buildMethodId) g.addEdge(buildMethodId, fieldId, 'BUILDS', {});
    for (const [fnName, fnFile] of producerLookup) {
      if (matchExpr.includes(fnName + '(')) {
        const producerFile = findFile(model, fnFile);
        if (!producerFile) continue;
        const fn = producerFile.functions.find((x) => x.name === fnName);
        const producerId = fn ? `function:${producerFile.relPath}#${fnName}` : idModule(producerFile.relPath);
        if (fn && !g.nodes.has(producerId)) {
          g.addNode({ id: producerId, type: 'Function', label: fnName, file: producerFile.relPath, line: fn.line, metadata: { summary: fn.summary } });
        }
        g.addEdge(producerId, fieldId, 'CONTRIBUTES_TO', {});
        g.addEdge(producerId, fieldId, 'SYNTHESIZES', {});
      }
    }
    // Profile-derived fields (knowledge/reasoning/positioning) read from the Profile.
    for (const profField of ['knowledgeSummary', 'reasoningSummary', 'positioningSummary']) {
      if (matchExpr.includes(profField)) {
        const src = idField('profilefield', profField);
        if (g.nodes.has(src)) g.addEdge(src, fieldId, 'CONTRIBUTES_TO', {});
      }
    }
  }
}

function addProfileFieldEdges(g, model) {
  const f = findFile(model, 'pipeline/ProfileBuilder.ts');
  if (!f) return;
  const cls = f.classes.find((c) => c.name === 'ProfileBuilder');
  const rebuildMethodId = cls ? idMethod(f.relPath, 'ProfileBuilder', 'rebuildForSubject') : null;
  const fields = extractObjectFields(f.content, 'rebuildForSubject', 'newProfile');
  // Recover the actual `newProfile: IntelligenceProfile = {` block since our
  // generic extractor looks for a literal substring match of returnMarker.
  const marker = 'newProfile: IntelligenceProfile = {';
  const idx = f.content.indexOf(marker);
  let realFields = fields;
  if (idx !== -1) {
    const openIdx = f.content.indexOf('{', idx);
    let depth = 0, closeIdx = openIdx;
    for (let i = openIdx; i < f.content.length; i++) {
      if (f.content[i] === '{') depth++;
      else if (f.content[i] === '}') { depth--; if (depth === 0) { closeIdx = i; break; } }
    }
    const body = f.content.slice(openIdx + 1, closeIdx);
    realFields = [];
    for (const line of body.split('\n')) {
      const fm = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(.+?),?\s*$/);
      if (fm) { realFields.push({ key: fm[1], expr: fm[2].replace(/,\s*$/, '') }); continue; }
      const sh = line.match(/^\s*([A-Za-z_$][\w$]*)\s*,\s*$/);
      if (sh) realFields.push({ key: sh[1], expr: sh[1] });
    }
  }
  for (const field of realFields) {
    const fieldId = idField('profilefield', field.key);
    if (!g.nodes.has(fieldId)) {
      g.addNode({ id: fieldId, type: 'ProfileField', label: `IntelligenceProfile.${field.key}`, file: f.relPath, line: null, metadata: { originExpression: field.expr } });
    }
    if (rebuildMethodId) g.addEdge(rebuildMethodId, fieldId, 'BUILDS', {});
    if (field.expr.startsWith('summaries.')) {
      g.addEdge(rebuildMethodId ?? idModule(f.relPath), fieldId, 'CONTRIBUTES_TO', {});
    }
  }
}

export { idModule, idClass, idMethod, idInterface, idTable, idEvent, idRoute, idPackage, idField, Graph };
