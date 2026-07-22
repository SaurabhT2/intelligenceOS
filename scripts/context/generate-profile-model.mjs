#!/usr/bin/env node
/**
 * generate-profile-model.mjs
 * Produces .context/profile_model.generated.md — how an IntelligenceProfile
 * is built, field-by-field, extracted from the live `newProfile = {...}`
 * object literal inside `ProfileBuilder.rebuildForSubject()`, plus what
 * triggers a rebuild (from `shouldRebuild*` methods) and what emits after.
 */
import { join } from 'node:path';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE, findFile,
} from './lib/analyzer.mjs';

function extractObjectLiteralFields(content, varName) {
  const marker = new RegExp(`${varName}\\s*:\\s*\\w+\\s*=\\s*\\{`);
  const m = marker.exec(content);
  if (!m) return [];
  const openIdx = content.indexOf('{', m.index);
  let depth = 0, closeIdx = openIdx;
  for (let i = openIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') { depth--; if (depth === 0) { closeIdx = i; break; } }
  }
  const body = content.slice(openIdx + 1, closeIdx);
  const fields = [];
  for (const line of body.split('\n')) {
    const fm = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(.+?),?\s*$/);
    if (fm) {
      fields.push({ key: fm[1], expr: fm[2].replace(/,\s*$/, '') });
      continue;
    }
    const shorthand = line.match(/^\s*([A-Za-z_$][\w$]*)\s*,\s*$/);
    if (shorthand) fields.push({ key: shorthand[1], expr: shorthand[1] });
  }
  return fields;
}

export function generate(model) {
  const f = findFile(model, 'pipeline/ProfileBuilder.ts');
  const lines = [];
  lines.push('# Profile Model');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');

  if (!f) {
    lines.push('_(ProfileBuilder.ts not found)_');
    return lines.join('\n');
  }

  lines.push(f.headerSummary ?? '');
  lines.push('');

  lines.push('## `IntelligenceProfile` field origins (parsed from the live `newProfile` literal in `rebuildForSubject()`)');
  lines.push('');
  const fields = extractObjectLiteralFields(f.content, 'newProfile');
  lines.push('| Field | Origin expression |');
  lines.push('|---|---|');
  for (const field of fields) {
    lines.push(`| \`${field.key}\` | \`${field.expr.replace(/\|/g, '\\|')}\` |`);
  }
  lines.push('');

  lines.push('## What triggers a rebuild');
  lines.push('');
  const cls = f.classes.find((c) => c.name === 'ProfileBuilder');
  const triggerMethods = cls ? cls.methods.filter((m) => /^shouldRebuild/.test(m.name)) : [];
  for (const m of triggerMethods) {
    lines.push(`- \`${m.name}(${m.params})\`${m.summary ? ' — ' + m.summary : ''}`);
  }
  lines.push('');

  lines.push('## How rebuild occurs');
  lines.push('');
  lines.push(
    '`rebuildForSubject(subject, changedDomains)` reads all active Learnings and current ' +
    'Knowledge assets for the subject plus the current profile (for version/archetype ' +
    'carry-forward), computes `compositeConfidence` and per-domain `summaries` ' +
    '(`buildDomainSummaries`), assembles the fields above, persists via ' +
    '`userDomain.upsertProfile(newProfile)`, and emits `intelligence.profile.updated`.'
  );
  lines.push('');
  lines.push('`archetypePrimary` / `archetypeConfidence` are the two fields NOT recomputed on every ' +
    'rebuild — they are carried forward from `currentProfile` unchanged, meaning archetype ' +
    'assignment has its own, separate trigger elsewhere (outside `ProfileBuilder`).');
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'profile_model.generated.md'), generate(model));
  console.log('✅ .context/profile_model.generated.md');
}
