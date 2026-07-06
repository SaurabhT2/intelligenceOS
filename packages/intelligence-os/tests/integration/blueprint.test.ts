/**
 * blueprint.test.ts
 *
 * Integration harness for Sprint 1 Blueprint Assembly.
 *
 * Tests the full BlueprintBuilder pipeline with mocked domain stores.
 * All domain mock methods return vi.fn() so individual tests can override
 * them to inject specific intelligence scenarios.
 *
 * Key acceptance criteria (Sprint 1):
 *   1. buildBlueprint() no longer throws PhaseNotImplementedError
 *   2. Returns a fully populated ArtifactBlueprint for any valid request
 *   3. New user (no intelligence) → valid blueprint with system defaults
 *   4. User with profile → blueprint uses profile intelligence
 *   5. persistBlueprint() is called
 *   6. intelligence.blueprint.built event is emitted
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlueprintBuilder } from '../../src/blueprint/BlueprintBuilder';
import { InProcessEventBus } from '../../src/events/IntelligenceEventBus';
import { PhaseNotImplementedError } from '../../src/errors';
import type {
  IntelligenceProfile,
  Archetype,
  ArtifactPattern,
} from '../../src/types/entities';
import type { ArtifactRequest } from '@intelligence-os/shared-types';

// ── Domain mock factory ───────────────────────────────────────────────────────

function createMockDomains() {
  return {
    user: {
      getCurrentProfile:         vi.fn().mockResolvedValue(null),
      getCurrentArchetype:       vi.fn().mockResolvedValue(null),
      getActiveLearnings:        vi.fn().mockResolvedValue([]),
      getGenericAudienceProfile: vi.fn().mockResolvedValue(null),
    },
    project: {
      getProject: vi.fn().mockResolvedValue(null),
    },
    artifact: {
      getPattern:        vi.fn().mockResolvedValue(null),
      persistBlueprint:  vi.fn().mockResolvedValue(undefined),
    },
    knowledge: {
      getAssets: vi.fn().mockResolvedValue([]),
    },
    workspace: {
      getContext:            vi.fn().mockResolvedValue(null),
      getWorkspaceLearnings: vi.fn().mockResolvedValue([]),
    },
  };
}

const BOARD_REQUEST: ArtifactRequest = {
  userId:       'u1',
  artifactType: 'board_update',
  audienceRef:  { audienceType: 'board' },
};

const NEW_USER_REQUEST: ArtifactRequest = {
  userId:       'new-user-uuid',
  artifactType: 'linkedin_post',
};

// Sample profile with voice data
const SAMPLE_PROFILE: IntelligenceProfile = {
  id:                  'prof-1',
  userId:              'u1',
  version:             2,
  isCurrent:           true,
  compositeConfidence: 0.65,
  archetypePrimary:    'founder',
  archetypeConfidence: 0.88,
  voiceSummary: {
    register:       'conversational',
    tone:           ['direct', 'honest'],
    sentenceRhythm: 'short',
    paragraphStyle: 'airy',
  },
  vocabularySnapshot: {
    preferredTerms: { burn: 'cash consumption' },
    forbiddenTerms: ['leverage', 'synergy'],
    domainJargon:   ['ARR', 'CAC'],
    proprietaryTerms: [],
  },
  goalSummary:         null,
  constraintSummary:   null,
  preferenceSummary:   null,
  expertiseDomains:    null,
  createdAt:           new Date(),
  updatedAt:           new Date(),
};

const FOUNDER_ARCHETYPE: Archetype = {
  id:              'arch-1',
  userId:          'u1',
  archetypeType:   'founder',
  confidence:      0.88,
  isPrimary:       true,
  evidenceSummary: null,
  createdAt:       new Date(),
  updatedAt:       new Date(),
};

const BOARD_PATTERN: ArtifactPattern = {
  id:           'pat-board',
  artifactType: 'board_update',
  patternLevel: 'universal',
  userId:       null,
  archetypeType: null,
  confidence:   0.5,
  sections: {
    sections: [
      { id: 'exec_summary',     title: 'Executive Summary',  purpose: 'Key metric',  depthLevel: 'summary'  },
      { id: 'metrics_progress', title: 'Metrics & Progress', purpose: 'KPIs vs targets with data', depthLevel: 'standard' },
      { id: 'decisions_needed', title: 'Decisions Needed',   purpose: 'Board input',  depthLevel: 'standard' },
      { id: 'risks',            title: 'Risks',              purpose: 'Top risks',    depthLevel: 'standard' },
      { id: 'next_period',      title: 'Next Period Plan',   purpose: 'Commitments',  depthLevel: 'summary'  },
    ],
  },
  narrativeModel:         { frame: 'headline-first' },
  lengthBaseline:         null,
  toneModel:              null,
  exemplarCount:          0,
  knownRejectionTriggers: [],
  createdAt:              new Date(),
  updatedAt:              new Date(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBuilder(domains = createMockDomains(), bus?: InProcessEventBus) {
  const eventBus = bus ?? new InProcessEventBus();
  const builder  = new BlueprintBuilder(domains as any, eventBus);
  return { builder, domains, eventBus };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('BlueprintBuilder — Sprint 1 acceptance criteria', () => {

  it('does NOT throw PhaseNotImplementedError', async () => {
    const { builder } = makeBuilder();
    await expect(builder.build(BOARD_REQUEST)).resolves.not.toThrow();
    const result = await builder.build(BOARD_REQUEST);
    expect(result).not.toBeInstanceOf(PhaseNotImplementedError);
  });

  it('returns an ArtifactBlueprint object with all required fields', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(BOARD_REQUEST);

    // Required fields from ArtifactBlueprint interface
    expect(blueprint.id).toBeTruthy();
    expect(blueprint.userId).toBe('u1');
    expect(blueprint.artifactType).toBe('board_update');
    expect(Array.isArray(blueprint.sections)).toBe(true);
    expect(blueprint.sections.length).toBeGreaterThan(0);
    expect(blueprint.narrativeFrame).toBeDefined();
    expect(blueprint.narrativeFrame.opening).toBeTruthy();
    expect(blueprint.narrativeFrame.argumentStructure).toBeTruthy();
    expect(blueprint.depthSpec).toBeDefined();
    expect(blueprint.depthSpec.level).toMatch(/^(summary|standard|deep)$/);
    expect(blueprint.voiceDirectives).toBeDefined();
    expect(blueprint.voiceDirectives.register).toBeTruthy();
    expect(Array.isArray(blueprint.voiceDirectives.tone)).toBe(true);
    expect(blueprint.vocabularyDirectives).toBeDefined();
    expect(blueprint.audienceCalibration).toBeDefined();
    expect(Array.isArray(blueprint.complianceRequirements)).toBe(true);
    expect(Array.isArray(blueprint.conflictsDetected)).toBe(true);
    expect(Array.isArray(blueprint.conflictsResolved)).toBe(true);
    expect(blueprint.createdAt).toBeInstanceOf(Date);
    // Epic 2 / E2-1-T1
    expect(typeof blueprint.degraded).toBe('boolean');
    expect(typeof blueprint.confidenceScore).toBe('number');
    expect(blueprint.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(blueprint.confidenceScore).toBeLessThanOrEqual(1);
    expect(typeof blueprint.buildDurationMs).toBe('number');
    expect(blueprint.buildDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('blueprint.id is a valid UUID', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('BlueprintBuilder — new user (zero intelligence)', () => {

  it('succeeds for a brand-new user with no stored intelligence', async () => {
    const { builder } = makeBuilder();
    await expect(builder.build(NEW_USER_REQUEST)).resolves.toBeDefined();
  });

  it('returns fallback sections when no pattern exists', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(NEW_USER_REQUEST);
    // linkedin_post has a seeded pattern in prod, but here mock returns null
    expect(blueprint.sections.length).toBeGreaterThanOrEqual(1);
    expect(blueprint.sections[0]!.id).toBeTruthy();
  });

  it('returns system default audience calibration when no audienceRef', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(NEW_USER_REQUEST);
    expect(blueprint.audienceCalibration.audienceType).toBe('general');
    expect(blueprint.audienceCalibration.confidence).toBe(0.1);
  });

  it('sets intelligenceProfileVersion to 0 for new user', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(NEW_USER_REQUEST);
    expect(blueprint.intelligenceProfileVersion).toBe(0);
  });

  it('returns zero conflicts for a new user', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(NEW_USER_REQUEST);
    expect(blueprint.conflictsDetected).toHaveLength(0);
    expect(blueprint.conflictsResolved).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('BlueprintBuilder — user with profile', () => {

  let domains: ReturnType<typeof createMockDomains>;
  beforeEach(() => {
    domains = createMockDomains();
    domains.user.getCurrentProfile.mockResolvedValue(SAMPLE_PROFILE);
    domains.user.getCurrentArchetype.mockResolvedValue(FOUNDER_ARCHETYPE);
    domains.artifact.getPattern.mockResolvedValue(BOARD_PATTERN);
  });

  it('uses sections from pattern when pattern is available', async () => {
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.sections).toHaveLength(5);
    expect(blueprint.sections[0]!.id).toBe('exec_summary');
  });

  it('sets intelligenceProfileVersion from profile', async () => {
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.intelligenceProfileVersion).toBe(2);
  });

  it('applies RECIPIENT rule: board audience → formal register (not conversational from profile)', async () => {
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    // Profile has 'conversational'; board audience requires 'formal' (RECIPIENT rule)
    expect(blueprint.voiceDirectives.register).toBe('formal');
  });

  it('merges user tone with board audience tone', async () => {
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.voiceDirectives.tone).toContain('direct');   // from profile
    expect(blueprint.voiceDirectives.tone.length).toBeGreaterThan(1);
  });

  it('includes user forbiddenTerms in vocabularyDirectives', async () => {
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.vocabularyDirectives.forbiddenTerms).toContain('leverage');
    expect(blueprint.vocabularyDirectives.forbiddenTerms).toContain('synergy');
  });

  it('detects a REGISTER conflict between conversational profile and board audience', async () => {
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    const registerConflict = blueprint.conflictsDetected.find(c => c.conflictType === 'REGISTER');
    expect(registerConflict).toBeDefined();
    const resolution = blueprint.conflictsResolved.find(r => r.conflictId === registerConflict!.id);
    expect(resolution!.rule).toBe('RECIPIENT');
    expect(resolution!.winner).toBe('audience');
  });

  it('adds transparency note for significant register departure', async () => {
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    const resolutionWithTransparency = blueprint.conflictsResolved.find(r => r.transparency !== null);
    expect(resolutionWithTransparency).toBeDefined();
    expect(resolutionWithTransparency!.transparency).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('BlueprintBuilder — narrative frame', () => {

  it('returns board-specific frame for board_update + board audience', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.narrativeFrame.opening).toContain('Lead with');
  });

  it('returns linkedin_post frame for general audience', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build({ userId: 'u1', artifactType: 'linkedin_post' });
    expect(blueprint.narrativeFrame.opening).toContain('pattern interrupt');
  });

  it('returns a valid frame for unknown artifact types', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build({ userId: 'u1', artifactType: 'custom_weekly_report' });
    expect(blueprint.narrativeFrame.opening).toBeTruthy();
    expect(blueprint.narrativeFrame.argumentStructure).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('BlueprintBuilder — persistence and events', () => {

  it('calls persistBlueprint with the assembled blueprint', async () => {
    const domains = createMockDomains();
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(domains.artifact.persistBlueprint).toHaveBeenCalledOnce();
    const persisted = domains.artifact.persistBlueprint.mock.calls[0]![0];
    expect(persisted.id).toBe(blueprint.id);
    expect(persisted.userId).toBe('u1');
  });

  it('emits intelligence.blueprint.built event', async () => {
    const bus     = new InProcessEventBus();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.on('intelligence.blueprint.built', handler);
    const { builder } = makeBuilder(createMockDomains(), bus);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(handler).toHaveBeenCalledOnce();
    const payload = handler.mock.calls[0]![0] as { entityId: string; artifactType: string };
    expect(payload.entityId).toBe(blueprint.id);
    expect(payload.artifactType).toBe('board_update');
  });

  it('returns blueprint even when persistBlueprint fails', async () => {
    const domains = createMockDomains();
    domains.artifact.persistBlueprint.mockRejectedValue(new Error('DB down'));
    const { builder } = makeBuilder(domains);
    // Should not throw — persistence failure is fire-and-forget
    await expect(builder.build(BOARD_REQUEST)).resolves.toBeDefined();
  });

  it('returns blueprint even when event emission fails', async () => {
    const bus = new InProcessEventBus();
    bus.on('intelligence.blueprint.built', vi.fn().mockRejectedValue(new Error('event fail')));
    const { builder } = makeBuilder(createMockDomains(), bus);
    await expect(builder.build(BOARD_REQUEST)).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('BlueprintBuilder — project context', () => {

  it('sets blueprint.projectId from resolved project when project found', async () => {
    const domains = createMockDomains();
    domains.project.getProject.mockResolvedValue({
      id: 'proj-uuid', userId: 'u1', workspaceId: null, brandosProjectId: null,
      name: 'Q3 Launch', projectType: null, lifecycleState: 'ACTIVE',
      goals: [], constraints: [], vocabularyModel: {}, stakeholders: [],
      successCriteria: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build({ ...BOARD_REQUEST, projectId: 'proj-uuid' });
    expect(blueprint.projectId).toBe('proj-uuid');
  });

  it('uses ACTIVE lifecycle to influence depthSpec (practitioner + ACTIVE → standard)', async () => {
    const domains = createMockDomains();
    domains.project.getProject.mockResolvedValue({
      id: 'proj-1', userId: 'u1', workspaceId: null, brandosProjectId: null,
      name: 'Q3', projectType: null, lifecycleState: 'ACTIVE',
      goals: [], constraints: [], vocabularyModel: {}, stakeholders: [],
      successCriteria: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build({ ...BOARD_REQUEST, projectId: 'proj-1' });
    // board audience = practitioner expertise + ACTIVE → standard
    expect(blueprint.depthSpec.level).toBe('standard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('BlueprintBuilder — workspace compliance', () => {

  it('extracts complianceRequirements from workspace context', async () => {
    const domains = createMockDomains();
    domains.workspace.getContext.mockResolvedValue({
      workspaceId: 'ws-1',
      complianceConstraints: [
        {
          type:        'register',
          requirement: 'formal',
          description: 'All external communications must use formal register.',
          mandatory:   true,
        },
      ],
    });
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build({ ...BOARD_REQUEST, workspaceId: 'ws-1' });
    expect(blueprint.complianceRequirements).toHaveLength(1);
    expect(blueprint.complianceRequirements[0]!.isMandatory).toBe(true);
    expect(blueprint.complianceRequirements[0]!.description).toContain('formal register');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

// E1-2 Phase C acceptance criterion:
//   "A blueprint built for two different users in the same workspace shares
//    the workspace brand voice layer."

describe('BlueprintBuilder — workspace brand voice (E1-2 Phase C)', () => {

  const SHARED_WORKSPACE_ID = 'ws-shared';

  // Workspace learning fixture: a workspace_intelligence Learning carrying brand
  // voice signals. taxonomyCategory 'communication_style' is one of the three
  // voice-relevant categories NarrativePlanner filters for.
  const WORKSPACE_BRAND_LEARNING = {
    id:                  'wl-brand-1',
    userId:              null,
    workspaceId:         SHARED_WORKSPACE_ID,
    projectId:           null,
    domain:              'workspace_intelligence',
    taxonomyCategory:    'communication_style',
    stabilityClass:      'long_term',
    state:               'ACTIVE',
    confidence:          0.85,
    contextScope:        'global',
    contextArtifactType: null,
    contextProjectId:    null,
    contextAudienceType: null,
    content: {
      tone:           ['visionary', 'grounded'],
      sentenceRhythm: 'short',
      preferredTerms: { 'clients': 'partners' },
      forbiddenTerms: ['synergy'],
    },
    sourceSummary:   {},
    decayRate:       null,
    lastConfirmedAt: null,
    decayStartedAt:  null,
    archivedAt:      null,
    createdAt:       new Date(),
    updatedAt:       new Date(),
  };

  it('fetches workspace learnings when workspaceId is present', async () => {
    const domains = createMockDomains();
    domains.workspace.getWorkspaceLearnings.mockResolvedValue([WORKSPACE_BRAND_LEARNING]);
    const { builder } = makeBuilder(domains);

    await builder.build({ ...BOARD_REQUEST, workspaceId: SHARED_WORKSPACE_ID });

    expect(domains.workspace.getWorkspaceLearnings).toHaveBeenCalledWith(
      SHARED_WORKSPACE_ID,
      'workspace_intelligence',
    );
  });

  it('does NOT fetch workspace learnings when workspaceId is absent', async () => {
    const domains = createMockDomains();
    const { builder } = makeBuilder(domains);

    await builder.build(BOARD_REQUEST); // no workspaceId

    expect(domains.workspace.getWorkspaceLearnings).not.toHaveBeenCalled();
  });

  it('workspace tone signals appear in blueprint voiceDirectives', async () => {
    const domains = createMockDomains();
    domains.workspace.getWorkspaceLearnings.mockResolvedValue([WORKSPACE_BRAND_LEARNING]);
    const { builder } = makeBuilder(domains);

    const blueprint = await builder.build({ ...BOARD_REQUEST, workspaceId: SHARED_WORKSPACE_ID });

    expect(blueprint.voiceDirectives.tone).toContain('visionary');
    expect(blueprint.voiceDirectives.tone).toContain('grounded');
  });

  it('workspace forbiddenTerms appear in blueprint vocabularyDirectives', async () => {
    const domains = createMockDomains();
    domains.workspace.getWorkspaceLearnings.mockResolvedValue([WORKSPACE_BRAND_LEARNING]);
    const { builder } = makeBuilder(domains);

    const blueprint = await builder.build({ ...BOARD_REQUEST, workspaceId: SHARED_WORKSPACE_ID });

    // content.forbiddenTerms → vocabularyDirectives.forbiddenTerms (vocabulary path)
    // content.avoidPatterns  → voiceDirectives.avoidPatterns        (voice path)
    expect(blueprint.vocabularyDirectives.forbiddenTerms).toContain('synergy');
  });

  it('two users in the same workspace share workspace brand voice layer', async () => {
    const domains1 = createMockDomains();
    const domains2 = createMockDomains();
    domains1.workspace.getWorkspaceLearnings.mockResolvedValue([WORKSPACE_BRAND_LEARNING]);
    domains2.workspace.getWorkspaceLearnings.mockResolvedValue([WORKSPACE_BRAND_LEARNING]);
    // User 1 has a profile; user 2 has no profile
    domains1.user.getCurrentProfile.mockResolvedValue(SAMPLE_PROFILE);

    const { builder: builder1 } = makeBuilder(domains1);
    const { builder: builder2 } = makeBuilder(domains2);

    const blueprint1 = await builder1.build({
      userId:       'user-1',
      artifactType: 'board_update',
      audienceRef:  { audienceType: 'board' },
      workspaceId:  SHARED_WORKSPACE_ID,
    });
    const blueprint2 = await builder2.build({
      userId:       'user-2',
      artifactType: 'board_update',
      audienceRef:  { audienceType: 'board' },
      workspaceId:  SHARED_WORKSPACE_ID,
    });

    // Both blueprints must carry the workspace tone signals
    expect(blueprint1.voiceDirectives.tone).toContain('visionary');
    expect(blueprint2.voiceDirectives.tone).toContain('visionary');

    // Both must carry the workspace preferred term
    expect(blueprint1.vocabularyDirectives.preferredTerms['clients']).toBe('partners');
    expect(blueprint2.vocabularyDirectives.preferredTerms['clients']).toBe('partners');

    // Both must carry the workspace forbidden term in vocabularyDirectives
    // (content.forbiddenTerms routes to vocabulary, not voice avoidPatterns)
    expect(blueprint1.vocabularyDirectives.forbiddenTerms).toContain('synergy');
    expect(blueprint2.vocabularyDirectives.forbiddenTerms).toContain('synergy');
  });

  it('blueprint succeeds and omits workspace voice when workspace fetch fails', async () => {
    const domains = createMockDomains();
    domains.workspace.getWorkspaceLearnings.mockRejectedValue(new Error('Supabase timeout'));
    const { builder } = makeBuilder(domains);

    // Must not throw — degrades gracefully to no workspace voice
    const blueprint = await builder.build({ ...BOARD_REQUEST, workspaceId: SHARED_WORKSPACE_ID });
    expect(blueprint).toBeDefined();
    expect(blueprint.voiceDirectives).toBeDefined();
    // Epic 2 / E2-1-T1: a genuine fetch failure must surface as degraded.
    expect(blueprint.degraded).toBe(true);
  });
});

