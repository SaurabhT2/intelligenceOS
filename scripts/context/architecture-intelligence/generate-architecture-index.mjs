#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph } from '../lib/graph.mjs';

export function generate() {
  const g = buildArchitectureGraph();
  const byType = {};
  for (const n of g.nodes.values()) byType[n.type] = (byType[n.type] ?? 0) + 1;
  const byEdgeType = {};
  for (const e of g.edges) byEdgeType[e.type] = (byEdgeType[e.type] ?? 0) + 1;

  const lines = [];
  lines.push('# Architecture Index');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'This section documents the Architecture Knowledge Graph itself — the intermediate model ' +
    'every other section of `architecture.generated.md`, and every section of ' +
    '`architecture.generated.json`, is a projection of. The graph (`knowledgeGraph` in the JSON ' +
    'file) is nodes + edges built from the same source extraction the rest of this document uses ' +
    '(imports, classes/methods, table access, event-bus calls, HTTP routes), so that "who owns ' +
    'this table," "what breaks if this class changes," and "where did this field originate" are ' +
    'graph queries (see `pnpm trace` / `pnpm impact` below) rather than re-derived by hand each time.'
  );
  lines.push('');

  lines.push('## Graph summary');
  lines.push('');
  lines.push(`- **Nodes:** ${g.nodes.size}`);
  lines.push(`- **Edges:** ${g.edges.length}`);
  lines.push('');
  lines.push('| Node type | Count |');
  lines.push('|---|---|');
  for (const [t, c] of Object.entries(byType).sort()) lines.push(`| ${t} | ${c} |`);
  lines.push('');
  lines.push('| Edge type | Count | Meaning |');
  lines.push('|---|---|---|');
  const edgeMeaning = {
    USES: 'generic structural containment (class is-defined-in module, method is-member-of class, package is-member-of repo)',
    DEPENDS_ON: 'module A imports module B (intra-repo relative imports only)',
    IMPLEMENTS: 'class implements interface',
    OWNS: 'Domain class is the sole authorized writer of a table (declared "Owns:" docblock)',
    READS: 'a `.schema().from(table).select()` call site',
    WRITES: 'a `.schema().from(table).insert/update/upsert/delete()` call site',
    PERSISTS: 'alias of WRITES, scoped to Domain classes — the durable-storage relationship specifically',
    EMITS: 'a `.bus.emit(event)` call site',
    CONSUMES: 'a `.bus.on(event)` call site',
    CALLS: 'HTTP route → handler method, or method → method resolved via constructor-injected field types',
    BUILDS: 'ContextBuilder.build() / ProfileBuilder.rebuildForSubject() → a field of the object they assemble',
    CONTRIBUTES_TO: 'a function or Profile field whose value flows into a CognitionContext field',
    SYNTHESIZES: 'a pure derivation function that computes a context field from Learnings (subset of CONTRIBUTES_TO, called out separately since "synthesis" is architecturally distinct from a passthrough)',
  };
  for (const [t, c] of Object.entries(byEdgeType).sort()) lines.push(`| ${t} | ${c} | ${edgeMeaning[t] ?? '—'} |`);
  lines.push('');

  lines.push('## Edge types reserved but not yet populated');
  lines.push('');
  lines.push(
    'The mission specification also names `RETURNS`, `REBUILDS`, `USES` (as a semantic rather than ' +
    'structural relation), and `REFERENCES` as edge types. `RETURNS` is redundant with the `returnType` ' +
    'already carried in every `Method` node\'s metadata rather than materialized as edges (materializing ' +
    'one edge per return-type reference would roughly double edge count for information already on the ' +
    'node). `REBUILDS` is discoverable today via `EMITS`/`CONSUMES` on `intelligence.profile.updated` plus ' +
    '`BUILDS` from `ProfileBuilder.rebuildForSubject`, without needing a separate edge type. Both are left ' +
    'as documented gaps rather than populated with a fabricated edge, per this framework\'s standing rule: ' +
    'derive from source, or say the derivation wasn\'t attempted.'
  );
  lines.push('');

  lines.push('## Consolidation history');
  lines.push('');
  lines.push(
    'This framework was built in three passes. Pass 1 generated 18 markdown + 8 JSON documents ' +
    'directly from source. Pass 2 added this Architecture Knowledge Graph plus 13 more documents ' +
    'projected from it — at which point several Pass-1 and Pass-2 documents covered the same ' +
    'ground twice (domain ownership, database access, event wiring, API routes, runtime shape, ' +
    'knowledge/identity subsystems, and context/profile fields each had a narrative doc *and* a ' +
    'graph-relationship doc). Pass 3 consolidated all of it into the two files this section lives ' +
    'in — `architecture.generated.md` and `architecture.generated.json` — merging each duplicated ' +
    'pair into one narrative section with the graph ledger nested as a subsection, and folding ' +
    'every JSON artifact into one sectioned file. No extraction logic changed across any of the ' +
    'three passes; only how the same underlying facts are packaged for a reader changed.'
  );
  lines.push('');

  lines.push('## Files (now two, plus the refresh manifest)');
  lines.push('');
  const files = [
    'architecture.generated.md — every narrative section, this one included, in one file with a table of contents.',
    'architecture.generated.json — every graph/JSON artifact (`knowledgeGraph`, `fileLevelGraph`, `dependencyImpact`, `behaviorContracts`, `topicGraphs`), sectioned by key, in one file.',
    'context_refresh_summary.generated.md — kept separate deliberately: the small, high-signal "did anything change" manifest (repository fingerprint + counts + known gaps) shouldn\'t be buried inside either of the two large files above.',
  ];
  for (const f of files) lines.push(`- \`${f}\``);
  lines.push('');

  lines.push('## How to query the graph yourself');
  lines.push('');
  lines.push('```bash');
  lines.push('pnpm trace knowledge      # prints the Knowledge pipeline execution chain');
  lines.push('pnpm trace identity       # prints the Identity pipeline execution chain');
  lines.push('pnpm trace workspace      # prints the Workspace-configuration chain');
  lines.push('pnpm impact ProfileBuilder   # impact analysis for a class name');
  lines.push('pnpm impact ContextBuilder');
  lines.push('```');
  lines.push('');
  lines.push('Or load `architecture.generated.json`\'s `knowledgeGraph` key directly and traverse it — see ' +
    '`scripts/context/lib/graph.mjs`\'s `bfsPath()` / `reachable()` for the same traversal primitives ' +
    'the CLIs use.');
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'architecture_index.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/architecture_index.generated.md');
}
