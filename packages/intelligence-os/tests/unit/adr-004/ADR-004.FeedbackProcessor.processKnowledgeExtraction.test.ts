/**
 * ADR-004.FeedbackProcessor.processKnowledgeExtraction.test.ts
 *
 * ADR-004 (Cognitive Consolidation) §3.2, §12.1 — the fourth
 * FeedbackProcessor entry point and its `intelligence.signal.extracted`
 * subscription filter.
 */

import { describe, it, expect, vi } from 'vitest';
import { FeedbackProcessor } from '../../../src/pipeline/FeedbackProcessor';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import { userSubject, workspaceSubject } from '../../../src/types/subject';
import type { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { ArtifactIntelligenceDomain } from '../../../src/domains/ArtifactIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../../../src/domains/KnowledgeIntelligenceDomain';

function makeProcessor() {
  const bus = new InProcessEventBus();
  const userDomain = {} as unknown as UserIntelligenceDomain;
  const artifactDomain = {} as unknown as ArtifactIntelligenceDomain;
  const knowledgeDomain = {} as unknown as KnowledgeIntelligenceDomain;
  const processor = new FeedbackProcessor(bus, userDomain, artifactDomain, knowledgeDomain);
  return { processor, bus };
}

describe('FeedbackProcessor.processKnowledgeExtraction()', () => {
  it('resolves a Workspace subject when payload.ownerType is workspace', async () => {
    const { processor } = makeProcessor();
    const shouldRebuildSpy = vi.spyOn(processor['profileBuilder'], 'shouldRebuildForSubjectFromKnowledge')
      .mockResolvedValue({ shouldRebuild: false, reason: 'debounced', newLearningsCount: 0 });

    await processor.processKnowledgeExtraction({
      userId: 'u1', entityId: 'asset-1', entityType: 'knowledge_asset',
      ownerType: 'workspace', workspaceId: 'ws-1', occurredAt: new Date().toISOString(),
    });

    expect(shouldRebuildSpy).toHaveBeenCalledWith(workspaceSubject('ws-1'), 'asset-1');
  });

  it('resolves a User subject when payload.ownerType is user (or absent)', async () => {
    const { processor } = makeProcessor();
    const shouldRebuildSpy = vi.spyOn(processor['profileBuilder'], 'shouldRebuildForSubjectFromKnowledge')
      .mockResolvedValue({ shouldRebuild: false, reason: 'debounced', newLearningsCount: 0 });

    await processor.processKnowledgeExtraction({
      userId: 'u1', entityId: 'asset-1', entityType: 'knowledge_asset',
      occurredAt: new Date().toISOString(),
    });

    expect(shouldRebuildSpy).toHaveBeenCalledWith(userSubject('u1'), 'asset-1');
  });

  it('calls rebuildForSubject and returns { rebuilt: true } when the trigger check says yes', async () => {
    const { processor } = makeProcessor();
    vi.spyOn(processor['profileBuilder'], 'shouldRebuildForSubjectFromKnowledge')
      .mockResolvedValue({ shouldRebuild: true, reason: 'new asset', newLearningsCount: 0 });
    const rebuildSpy = vi.spyOn(processor['profileBuilder'], 'rebuildForSubject')
      .mockResolvedValue({} as never);

    const result = await processor.processKnowledgeExtraction({
      userId: 'u1', entityId: 'asset-1', entityType: 'knowledge_asset',
      ownerType: 'workspace', workspaceId: 'ws-1', occurredAt: new Date().toISOString(),
    });

    expect(rebuildSpy).toHaveBeenCalledWith(workspaceSubject('ws-1'), ['knowledge']);
    expect(result).toEqual({ rebuilt: true });
  });

  it('returns { rebuilt: false } without calling rebuildForSubject when the trigger check says no', async () => {
    const { processor } = makeProcessor();
    vi.spyOn(processor['profileBuilder'], 'shouldRebuildForSubjectFromKnowledge')
      .mockResolvedValue({ shouldRebuild: false, reason: 'debounced', newLearningsCount: 0 });
    const rebuildSpy = vi.spyOn(processor['profileBuilder'], 'rebuildForSubject');

    const result = await processor.processKnowledgeExtraction({
      userId: 'u1', entityId: 'asset-1', entityType: 'knowledge_asset',
      occurredAt: new Date().toISOString(),
    });

    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ rebuilt: false });
  });

  it('never throws — returns { rebuilt: false } if the trigger check rejects', async () => {
    const { processor } = makeProcessor();
    vi.spyOn(processor['profileBuilder'], 'shouldRebuildForSubjectFromKnowledge')
      .mockRejectedValue(new Error('db unavailable'));

    const result = await processor.processKnowledgeExtraction({
      userId: 'u1', entityId: 'asset-1', entityType: 'knowledge_asset',
      occurredAt: new Date().toISOString(),
    });

    expect(result).toEqual({ rebuilt: false });
  });
});

describe('FeedbackProcessor.register() — intelligence.signal.extracted filter', () => {
  it('invokes processKnowledgeExtraction only for entityType === "knowledge_asset"', async () => {
    const { processor, bus } = makeProcessor();
    const spy = vi.spyOn(processor, 'processKnowledgeExtraction').mockResolvedValue({ rebuilt: false });
    processor.register();

    await bus.emit('intelligence.signal.extracted', {
      userId: 'u1', entityId: 'other-1', entityType: 'some_other_entity',
      occurredAt: new Date().toISOString(),
    });
    expect(spy).not.toHaveBeenCalled();

    await bus.emit('intelligence.signal.extracted', {
      userId: 'u1', entityId: 'asset-1', entityType: 'knowledge_asset',
      occurredAt: new Date().toISOString(),
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
