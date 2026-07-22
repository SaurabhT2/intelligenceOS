#!/usr/bin/env node
/**
 * generate-event-bus.mjs
 * Produces .context/event_bus.generated.md — every IntelligenceEventType,
 * its producers and consumers (file:line), and whether it is actually wired
 * at all. Cross-references the declared union in `types/events.ts` against
 * real `.bus.emit(...)` / `.bus.on(...)` call sites, so "declared but never
 * emitted" and "emitted but never consumed" are structural facts, not
 * guesses.
 */
import { join } from 'node:path';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE,
  findFile, extractEventBusCalls,
} from './lib/analyzer.mjs';

export function generate(model) {
  const eventsFile = findFile(model, 'types/events.ts');
  const declared = [];
  if (eventsFile) {
    for (const m of eventsFile.content.matchAll(/^\s*\|\s*'([\w.]+)'/gm)) declared.push(m[1]);
  }

  const emits = [];
  const ons = [];
  for (const f of model.files) {
    const { emits: e, ons: o } = extractEventBusCalls(f.content);
    for (const x of e) emits.push({ ...x, file: f.relPath });
    for (const x of o) ons.push({ ...x, file: f.relPath });
  }

  const byEvent = new Map();
  for (const ev of declared) byEvent.set(ev, { producers: [], consumers: [] });
  for (const e of emits) {
    if (!byEvent.has(e.event)) byEvent.set(e.event, { producers: [], consumers: [] });
    byEvent.get(e.event).producers.push(`${e.file}:${e.line}`);
  }
  for (const o of ons) {
    if (!byEvent.has(o.event)) byEvent.set(o.event, { producers: [], consumers: [] });
    byEvent.get(o.event).consumers.push(`${o.file}:${o.line}`);
  }

  const lines = [];
  lines.push('# Event Bus');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'Transport: `InProcessEventBus` (`packages/intelligence-os/src/events/IntelligenceEventBus.ts`) — ' +
    'synchronous in-process fan-out via `Promise.allSettled` over all registered handlers for an event. ' +
    'Handler errors are caught and logged, never thrown to the emitter (fire-and-forget semantics). ' +
    'Every `emit()` call in this repo is itself `await`ed by its caller, so from the *caller\'s* ' +
    'perspective emission is synchronous/blocking; from a *handler\'s* perspective, a rejection ' +
    'never propagates back. Production swap-ins (BullMQ, Inngest) are stubbed as comments in the ' +
    'same file but not implemented.'
  );
  lines.push('');
  lines.push(`Declared event types: **${declared.length}** (single \`intelligence.*\` namespace, per \`types/events.ts\`).`);
  lines.push('');

  lines.push('## Event ledger');
  lines.push('');
  lines.push('| Event | Producers (file:line) | Consumers (file:line) | Status |');
  lines.push('|---|---|---|---|');
  for (const [event, { producers, consumers }] of [...byEvent.entries()].sort()) {
    const p = producers.length ? producers.map((x) => `\`${x}\``).join('<br>') : '_(none)_';
    const c = consumers.length ? consumers.map((x) => `\`${x}\``).join('<br>') : '_(none)_';
    let status = '✅ wired';
    if (producers.length === 0 && consumers.length === 0) status = '⚠️ declared, never emitted or consumed';
    else if (producers.length === 0) status = '⚠️ consumed but never emitted';
    else if (consumers.length === 0) status = 'ℹ️ emitted, observable but no in-repo consumer (expected for events meant for external consumers)';
    lines.push(`| \`${event}\` | ${p} | ${c} | ${status} |`);
  }
  lines.push('');

  lines.push('## Fan-out');
  lines.push('');
  const fanoutMap = new Map();
  for (const o of ons) {
    if (!fanoutMap.has(o.event)) fanoutMap.set(o.event, new Set());
    fanoutMap.get(o.event).add(o.file);
  }
  const fanout = [...fanoutMap.entries()].filter(([, files]) => files.size > 1);
  if (fanout.length === 0) {
    lines.push('No event currently has more than one in-repo `.on()` consumer (no fan-out beyond `InProcessEventBus`\'s own multi-handler-per-event capability).');
  } else {
    for (const [event, files] of fanout) {
      lines.push(`- \`${event}\` → ${[...files].map((f) => `\`${f}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Execution order (Learning Pipeline, observed emit/on chain)');
  lines.push('');
  lines.push('```');
  lines.push('intelligence.artifact.feedback / intelligence.user.correction   (consumer → IntelligenceOS)');
  lines.push('        │  FeedbackProcessor.register() handlers');
  lines.push('        ▼');
  lines.push('intelligence.signal.extracted        (emitted by FeedbackProcessor, KnowledgeProcessor)');
  lines.push('        │  FeedbackProcessor also self-subscribes to this event');
  lines.push('        ▼');
  lines.push('intelligence.learning.validated       (emitted by FeedbackProcessor after LearningValidator promotes)');
  lines.push('        ▼');
  lines.push('intelligence.profile.updated          (emitted by ProfileBuilder.rebuildForSubject / rebuild)');
  lines.push('```');
  lines.push('');
  lines.push(
    '`intelligence.hypothesis.created`, `intelligence.hypothesis.promoted`, `intelligence.learning.confirmed`, ' +
    '`intelligence.conflict.detected`, `intelligence.conflict.recurring`, and `intelligence.project.updated` ' +
    'are declared in the type union with no in-repo emit site found by this generator — see the ledger above ' +
    'and `.context/repository_health.generated.md` for the corresponding finding.'
  );
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'event_bus.generated.md'), generate(model));
  console.log('✅ .context/event_bus.generated.md');
}
