#!/usr/bin/env node
/**
 * generate-context-builder.mjs
 * Produces .context/context_builder.generated.md — a field-by-field
 * breakdown of `ContextBuilder.build()`'s return object, extracted by
 * parsing the actual `return { ... }` object literal (top-level keys only,
 * via brace-depth tracking) rather than hand-transcribing it. Each field's
 * initializer expression is shown verbatim so nullability/fallback logic is
 * visible without needing to open the source file.
 */
import { join } from 'node:path';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE, findFile,
} from './lib/analyzer.mjs';

/** Extracts top-level `key: value` pairs from the first `return {` object
 * literal found in `methodBody`, tracking brace/paren/bracket depth so
 * nested object literals inside a field's initializer aren't split apart. */
function extractReturnedFields(methodBody) {
  const startMarker = methodBody.indexOf('return {');
  if (startMarker === -1) return [];
  const openIdx = methodBody.indexOf('{', startMarker);
  let depth = 0, closeIdx = openIdx;
  for (let i = openIdx; i < methodBody.length; i++) {
    if ('{(['.includes(methodBody[i])) depth++;
    else if ('})]'.includes(methodBody[i])) {
      depth--;
      if (depth === 0) { closeIdx = i; break; }
    }
  }
  const body = methodBody.slice(openIdx + 1, closeIdx);

  const fields = [];
  let depth2 = 0;
  let fieldStart = 0;
  let currentKey = null;
  const pushShorthandOrSkip = (segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const m = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
    if (m) fields.push({ key: m[1], expr: m[1] });
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if ('{(['.includes(ch)) depth2++;
    else if ('})]'.includes(ch)) depth2--;
    if (depth2 === 0 && ch === ':' && currentKey === null) {
      // Look backward for the key identifier (skipping comments/whitespace).
      const keyMatch = body.slice(fieldStart, i).match(/([A-Za-z_$][\w$]*)\s*$/);
      currentKey = keyMatch ? keyMatch[1] : null;
      fieldStart = i + 1;
    } else if (depth2 === 0 && ch === ',') {
      if (currentKey !== null) {
        fields.push({ key: currentKey, expr: body.slice(fieldStart, i).trim() });
        currentKey = null;
      } else {
        pushShorthandOrSkip(body.slice(fieldStart, i));
      }
      fieldStart = i + 1;
    }
  }
  if (currentKey !== null) {
    fields.push({ key: currentKey, expr: body.slice(fieldStart).trim() });
  } else {
    pushShorthandOrSkip(body.slice(fieldStart));
  }
  return fields;
}

function findMethodBody(fileContent, methodNamePattern) {
  const re = new RegExp(`\\b${methodNamePattern}\\s*\\([^{};]*\\)\\s*(?::[^{;=]+)?\\s*\\{`);
  const m = re.exec(fileContent);
  if (!m) return null;
  const openIdx = fileContent.indexOf('{', m.index);
  let depth = 0, closeIdx = openIdx;
  for (let i = openIdx; i < fileContent.length; i++) {
    if (fileContent[i] === '{') depth++;
    else if (fileContent[i] === '}') { depth--; if (depth === 0) { closeIdx = i; break; } }
  }
  return fileContent.slice(openIdx + 1, closeIdx);
}

function classify(expr) {
  const canBeNull = /\bnull\b/.test(expr) || /\?\?/.test(expr);
  const isInline = /\(\(\)/.test(expr) || expr.includes('=>');
  return { canBeNull, isInline };
}

export function generate(model) {
  const f = findFile(model, 'context/ContextBuilder.ts');
  const lines = [];
  lines.push('# ContextBuilder');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');

  if (!f) {
    lines.push('_(ContextBuilder.ts not found)_');
    return lines.join('\n');
  }

  lines.push(f.headerSummary ?? '');
  lines.push('');
  const cls = f.classes.find((c) => c.name === 'ContextBuilder');
  if (cls) {
    lines.push('## Constructor dependencies (what it reads from)');
    lines.push('');
    const ctor = cls.methods.find((m) => m.name === 'constructor');
    lines.push(ctor ? `\`constructor(${ctor.params})\`` : '_(no constructor found)_');
    lines.push('');
  }

  const body = findMethodBody(f.content, 'build');
  const fields = body ? extractReturnedFields(body) : [];

  lines.push('## `CognitionContext` field origins (parsed from the live `return {}` in `build()`)');
  lines.push('');
  lines.push('| Field | Can be null / fallback? | Origin expression |');
  lines.push('|---|---|---|');
  for (const field of fields) {
    const { canBeNull } = classify(field.expr);
    const shortExpr = field.expr.length > 220 ? field.expr.slice(0, 217) + '...' : field.expr;
    lines.push(`| \`${field.key}\` | ${canBeNull ? 'yes' : 'no (always populated)'} | \`${shortExpr.replace(/\|/g, '\\|').replace(/\n/g, ' ')}\` |`);
  }
  lines.push('');

  lines.push('## Which modules contribute');
  lines.push('');
  lines.push('| Module | Contributes |');
  lines.push('|---|---|');
  lines.push('| `context/voiceMapping.ts` (`deriveVoiceProfile`, `deriveConfidence`, `deriveLastConsolidatedAt`) | `voice` (pre-workspace-override), `confidence`, `provenance.lastConsolidatedAt` |');
  lines.push('| `context/identitySynthesis.ts` (`deriveIdentityContribution`) | `identity` (pre-workspace-override) |');
  lines.push('| Workspace-declared `voiceConfiguration` / `identityConfiguration` (Knowledge, ADR-003 §2.4) | overrides applied on top of the two rows above, via `applyVoiceConfiguration` / `applyIdentityConfiguration` |');
  lines.push('| `IntelligenceProfile.knowledgeSummary` / `.reasoningSummary` / `.positioningSummary` (via `projectSynthesizedCollection`) | `knowledge`, `reasoning`, `positioning` |');
  lines.push('| _(not implemented)_ | `visualIdentity` — hard-coded `null` |');
  lines.push('');

  lines.push('## Null / fallback logic');
  lines.push('');
  lines.push(
    'A field is `null` whenever its upstream Profile field is `null` (a Subject with no ' +
    'confirmed Learnings/Knowledge yet) — this is a deliberate, documented "honest null" per this ' +
    'file\'s own header docblock, not an error state. `resolveCognitionContext` never throws for a ' +
    'new-subject case; it returns a complete `CognitionContext` shape with some sections `null`.'
  );
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'context_builder.generated.md'), generate(model));
  console.log('✅ .context/context_builder.generated.md');
}
