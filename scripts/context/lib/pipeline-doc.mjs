/**
 * scripts/context/lib/pipeline-doc.mjs
 * Shared renderer for the narrative "pipeline" docs: given an ordered list
 * of stages (each pointing at a source file), renders class doc, method
 * list, resolved intra-repo dependencies, and in-repo callers for each
 * stage — the same structural facts every pipeline doc needs, so
 * cognition/learning/knowledge/identity pipelines don't hand-roll this
 * four times over.
 */
import { findFile, resolveImport, buildImportGraph } from './analyzer.mjs';

export function renderStage(model, edgesData, stageDef) {
  const f = findFile(model, stageDef.file);
  const lines = [];
  lines.push(`### ${stageDef.name}`);
  lines.push('');
  if (stageDef.note) lines.push(stageDef.note);
  if (!f) {
    lines.push('');
    lines.push(`_(file matching \`${stageDef.file}\` not found)_`);
    lines.push('');
    return lines.join('\n');
  }
  lines.push('');
  lines.push(`- **File:** \`${f.relPath}\``);
  if (f.headerSummary) lines.push(`- **Summary:** ${f.headerSummary}`);

  for (const cls of f.classes) {
    lines.push(`- **Class:** \`${cls.name}\`${cls.extends ? ` extends \`${cls.extends}\`` : ''}`);
    if (cls.summary && cls.summary !== f.headerSummary) lines.push(`  - ${cls.summary}`);
    const pub = cls.methods.filter((m) => m.name !== 'constructor' && m.visibility === 'public');
    if (pub.length) {
      lines.push('  - **Methods:**');
      for (const m of pub) {
        lines.push(`    - \`${m.async ? 'async ' : ''}${m.name}(${m.params})${m.returnType ? ': ' + m.returnType.trim() : ''}\`${m.summary ? ' — ' + m.summary : ''}`);
      }
    }
  }
  for (const fn of [...f.functions, ...f.constArrowFns]) {
    lines.push(`- **Function:** \`${fn.name}\`${fn.summary ? ' — ' + fn.summary : ''}`);
  }

  const { importedBy } = edgesData;
  const deps = [...new Set(f.imports.map((i) => resolveImport(model, f.path, i.specifier)).filter(Boolean))]
    .map((p) => model.files.find((x) => x.path === p).relPath)
    .sort();
  const callers = [...(importedBy.get(f.relPath) ?? [])].sort();

  lines.push(`- **Depends on (intra-repo):** ${deps.length ? deps.map((d) => `\`${d}\``).join(', ') : '_(none)_'}`);
  lines.push(`- **Called from:** ${callers.length ? callers.map((c) => `\`${c}\``).join(', ') : '_(no in-repo caller found)_'}`);
  lines.push('');
  return lines.join('\n');
}

export function renderPipelineDoc(model, { title, headerNote, intro, stages }) {
  const edgesData = buildImportGraph(model);
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(headerNote);
  lines.push('');
  lines.push(intro);
  lines.push('');
  lines.push('## Stages');
  lines.push('');
  for (const stage of stages) {
    lines.push(renderStage(model, edgesData, stage));
  }
  return lines.join('\n');
}
