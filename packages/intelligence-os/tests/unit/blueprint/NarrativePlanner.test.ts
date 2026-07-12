/**
 * NarrativePlanner.test.ts
 */
import { describe, it, expect } from 'vitest';
import { NarrativePlanner } from '../../../src/blueprint/NarrativePlanner';
import { DEFAULT_VOICE_DIRECTIVES } from '../../../src/blueprint/internal/defaults';
import { EMPTY_PROJECT_CONTEXT } from '../../../src/blueprint/ProjectContextBuilder';
import type { IntelligenceProfile, Archetype, KnowledgeAsset } from '../../../src/types/entities';
import type { AudienceCalibration } from '@intelligence-os/shared-types';
import type { ProjectContext } from '../../../src/blueprint/ProjectContextBuilder';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BOARD_AUDIENCE: AudienceCalibration = {
  isNamedRelationship: false,
  audienceType:        'board',
  expertiseLevel:      'practitioner',
  communicationNorms:  {},
  knownSensitivities:  {},
  confidence:          0.7,
};

const ENGINEERING_AUDIENCE: AudienceCalibration = {
  isNamedRelationship: false,
  audienceType:        'engineering',
  expertiseLevel:      'expert',
  communicationNorms:  {},
  knownSensitivities:  {},
  confidence:          0.5,
};

const GENERAL_AUDIENCE: AudienceCalibration = {
  ...BOARD_AUDIENCE,
  audienceType:  'general',
  expertiseLevel: 'informed',
  confidence:    0.1,
};

const FOUNDER_PROFILE: IntelligenceProfile = {
  id:                  'prof-1',
  userId:              'u1',
  workspaceId:         null,
  subjectType:         'user',
  version:             3,
  isCurrent:           true,
  compositeConfidence: 0.75,
  archetypePrimary:    'founder',
  archetypeConfidence: 0.90,
  voiceSummary: {
    register:       'conversational',
    tone:           ['direct', 'honest'],
    sentenceRhythm: 'short',
    paragraphStyle: 'airy',
    avoidPatterns:  [],
  },
  vocabularySnapshot: {
    preferredTerms: { 'growth rate': 'net revenue retention', 'burn': 'cash consumption' },
    forbiddenTerms: ['leverage', 'synergy', 'pivot'],
    domainJargon:   ['ARR', 'CAC', 'LTV'],
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
  confidence:      0.90,
  isPrimary:       true,
  evidenceSummary: null,
  createdAt:       new Date(),
  updatedAt:       new Date(),
};

const PROJECT_VOCAB_CONTEXT: ProjectContext = {
  ...EMPTY_PROJECT_CONTEXT,
  vocabularyModel: {
    preferredTerms: { 'users': 'customers', 'growth rate': 'GRR' }, // 'growth rate' overrides user
    forbiddenTerms: ['legacy', 'solution'],
  },
};

const ASSET_WITH_VOCAB: KnowledgeAsset = {
  id:                  'ka-1',
  ownerType:           'user',
  userId:              'u1',
  projectId:           null,
  workspaceId:         null,
  assetType:           'playbook',
  title:               'Sales Playbook',
  sourceFileRef:       null,
  extractedVocabulary: { proprietaryTerms: ['RevRide™', 'ChurnGuard'], forbiddenTerms: [] },
  extractedPatterns:   null,
  extractedFrameworks: null,
  extractedVisualFeatures: null,
  confidence:          0.9,
  version:             1,
  isCurrent:           true,
  createdAt:           new Date(),
  updatedAt:           new Date(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NarrativePlanner', () => {
  const planner = new NarrativePlanner();

  // ── Narrative frame ───────────────────────────────────────────────────────

  describe('narrativeFrame', () => {
    it('returns board-specific frame for board_update + board audience', () => {
      const { narrativeFrame } = planner.plan('board_update', null, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(narrativeFrame.opening).toContain('Lead with');
      expect(narrativeFrame.argumentStructure).toBeDefined();
    });

    it('returns engineering-specific frame for architecture_proposal + engineering audience', () => {
      const { narrativeFrame } = planner.plan('architecture_proposal', null, null, ENGINEERING_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(narrativeFrame.opening.toLowerCase()).toContain('problem');
    });

    it('returns a frame for unknown artifact types (never null)', () => {
      const { narrativeFrame } = planner.plan('custom_doc_type', null, null, GENERAL_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(narrativeFrame.opening).toBeTruthy();
      expect(narrativeFrame.argumentStructure).toBeTruthy();
    });

    it('returns linkedin_post frame for general audience', () => {
      const { narrativeFrame } = planner.plan('linkedin_post', null, null, GENERAL_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(narrativeFrame.opening).toContain('pattern interrupt');
    });
  });

  // ── Voice directives ──────────────────────────────────────────────────────

  describe('voiceDirectives — register (RECIPIENT rule)', () => {
    it('uses audience register regardless of user register', () => {
      // User has 'conversational', board expects 'formal'
      const { voiceDirectives } = planner.plan('board_update', FOUNDER_PROFILE, FOUNDER_ARCHETYPE, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(voiceDirectives.register).toBe('formal'); // board wins
    });

    it('uses technical register for engineering audience', () => {
      const { voiceDirectives } = planner.plan('architecture_proposal', null, null, ENGINEERING_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(voiceDirectives.register).toBe('technical');
    });
  });

  describe('voiceDirectives — tone merging', () => {
    it('merges user tone with audience tone', () => {
      const { voiceDirectives } = planner.plan('board_update', FOUNDER_PROFILE, FOUNDER_ARCHETYPE, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      // Should contain user tone ('direct', 'honest') AND board audience tone
      expect(voiceDirectives.tone).toContain('direct');
      expect(voiceDirectives.tone.length).toBeGreaterThan(1);
    });

    it('does not exceed 5 tone items', () => {
      const { voiceDirectives } = planner.plan('board_update', FOUNDER_PROFILE, FOUNDER_ARCHETYPE, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(voiceDirectives.tone.length).toBeLessThanOrEqual(5);
    });

    it('returns audience tone when no profile or archetype', () => {
      const { voiceDirectives } = planner.plan('board_update', null, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      const boardDefaults = ['concise', 'authoritative', 'accountable'];
      expect(voiceDirectives.tone.some(t => boardDefaults.includes(t))).toBe(true);
    });
  });

  describe('voiceDirectives — rhythm and style', () => {
    it('uses profile sentenceRhythm when available', () => {
      const { voiceDirectives } = planner.plan('board_update', FOUNDER_PROFILE, FOUNDER_ARCHETYPE, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(voiceDirectives.sentenceRhythm).toBe('short'); // from profile
    });

    it('falls back to archetype rhythm when no profile', () => {
      const { voiceDirectives } = planner.plan('board_update', null, FOUNDER_ARCHETYPE, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(voiceDirectives.sentenceRhythm).toBe('short'); // founder default
    });

    it('falls back to system default when no profile and no archetype', () => {
      const { voiceDirectives } = planner.plan('board_update', null, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(voiceDirectives.sentenceRhythm).toBe(DEFAULT_VOICE_DIRECTIVES.sentenceRhythm);
    });

    it('uses profile avoidPatterns as avoidPatterns', () => {
      const { voiceDirectives } = planner.plan('board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(voiceDirectives.avoidPatterns).toContain('leverage');
      expect(voiceDirectives.avoidPatterns).toContain('synergy');
    });
  });

  // ── Vocabulary directives ─────────────────────────────────────────────────

  describe('vocabularyDirectives', () => {
    it('includes user preferredTerms', () => {
      const { vocabularyDirectives } = planner.plan('board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(vocabularyDirectives.preferredTerms['burn']).toBe('cash consumption');
    });

    it('project preferredTerms override user preferredTerms for same key', () => {
      const { vocabularyDirectives } = planner.plan('board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, PROJECT_VOCAB_CONTEXT);
      // 'growth rate' → project says 'GRR', user says 'net revenue retention'
      expect(vocabularyDirectives.preferredTerms['growth rate']).toBe('GRR');
    });

    it('unions user and project forbiddenTerms', () => {
      const { vocabularyDirectives } = planner.plan('board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, PROJECT_VOCAB_CONTEXT);
      expect(vocabularyDirectives.forbiddenTerms).toContain('leverage');   // user
      expect(vocabularyDirectives.forbiddenTerms).toContain('legacy');     // project
    });

    it('includes domain jargon from profile', () => {
      const { vocabularyDirectives } = planner.plan('board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(vocabularyDirectives.domainJargon).toContain('ARR');
    });

    it('extracts proprietaryTerms from knowledge assets', () => {
      const ctx: ProjectContext = { ...EMPTY_PROJECT_CONTEXT, knowledgeAssets: [ASSET_WITH_VOCAB] };
      const { vocabularyDirectives } = planner.plan('board_update', null, null, BOARD_AUDIENCE, ctx);
      expect(vocabularyDirectives.proprietaryTerms).toContain('RevRide™');
      expect(vocabularyDirectives.proprietaryTerms).toContain('ChurnGuard');
    });

    it('deduplicates proprietaryTerms across multiple assets', () => {
      const ctx: ProjectContext = {
        ...EMPTY_PROJECT_CONTEXT,
        knowledgeAssets: [ASSET_WITH_VOCAB, ASSET_WITH_VOCAB], // same asset twice
      };
      const { vocabularyDirectives } = planner.plan('board_update', null, null, BOARD_AUDIENCE, ctx);
      const count = vocabularyDirectives.proprietaryTerms.filter(t => t === 'RevRide™').length;
      expect(count).toBe(1);
    });

    it('returns empty vocabulary when no profile and no project vocab', () => {
      const { vocabularyDirectives } = planner.plan('board_update', null, null, GENERAL_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      expect(vocabularyDirectives.forbiddenTerms).toEqual([]);
      expect(vocabularyDirectives.domainJargon).toEqual([]);
      expect(vocabularyDirectives.proprietaryTerms).toEqual([]);
    });
  });

  // ── E1-2 Phase C: Workspace brand voice layer ─────────────────────────────
  //
  // Acceptance criterion: "a blueprint built for two different users in the
  // same workspace shares the workspace brand voice layer."
  // Resolution hierarchy: workspace brand > user voice > archetype > system default.

  describe('workspace voice layer (E1-2 Phase C)', () => {
    // Fixture: a workspace Learning carrying brand voice signals.
    // domain: 'workspace_intelligence' — all workspace learnings use this domain.
    // taxonomyCategory: 'communication_style' — one of the voice-relevant categories
    //   that NarrativePlanner's extractWorkspaceVoice() filters for.
    const WORKSPACE_VOICE_LEARNING: import('../../../src/types/entities').Learning = {
      id:                  'wl-1',
      userId:              null,  // workspace-owned; no user owner
      workspaceId:         'ws-acme',
      subjectType:         'workspace',
      projectId:           null,
      domain:              'workspace_intelligence',
      taxonomyCategory:    'communication_style',
      stabilityClass:      'long_term',
      state:               'ACTIVE',
      confidence:          0.8,
      contextScope:        'global',
      contextArtifactType: null,
      contextProjectId:    null,
      contextAudienceType: null,
      content: {
        tone:            ['bold', 'innovative'],
        sentenceRhythm:  'short',
        paragraphStyle:  'airy',
        avoidPatterns:   ['enterprise-grade', 'best-in-class'],
        preferredTerms:  { 'users': 'members', 'customers': 'community' },
        forbiddenTerms:  ['disrupt'],
      },
      sourceSummary:   {},
      decayRate:       null,
      lastConfirmedAt: null,
      decayStartedAt:  null,
      archivedAt:      null,
      createdAt:       new Date(),
      updatedAt:       new Date(),
    };

    it('workspace tone appears in voice directives when workspace learnings present', () => {
      const { voiceDirectives } = planner.plan(
        'board_update', null, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT,
        [WORKSPACE_VOICE_LEARNING],
      );
      expect(voiceDirectives.tone).toContain('bold');
      expect(voiceDirectives.tone).toContain('innovative');
    });

    it('workspace tone takes precedence — appears before user tone in merged list', () => {
      // Both workspace ('bold') and user ('direct') appear; workspace appears first
      const { voiceDirectives } = planner.plan(
        'board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT,
        [WORKSPACE_VOICE_LEARNING],
      );
      const boldIndex   = voiceDirectives.tone.indexOf('bold');
      const directIndex = voiceDirectives.tone.indexOf('direct');
      expect(boldIndex).toBeGreaterThanOrEqual(0);
      expect(directIndex).toBeGreaterThanOrEqual(0);
      expect(boldIndex).toBeLessThan(directIndex);
    });

    it('workspace sentenceRhythm overrides user sentenceRhythm', () => {
      // FOUNDER_PROFILE has sentenceRhythm: 'short' — same as workspace here, so
      // use a profile with 'long' to confirm workspace wins.
      const LONG_RHYTHM_PROFILE = {
        ...FOUNDER_PROFILE,
        voiceSummary: { ...FOUNDER_PROFILE.voiceSummary, sentenceRhythm: 'long' },
      };
      const { voiceDirectives } = planner.plan(
        'board_update', LONG_RHYTHM_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT,
        [WORKSPACE_VOICE_LEARNING],
      );
      expect(voiceDirectives.sentenceRhythm).toBe('short'); // workspace wins
    });

    it('workspace avoidPatterns are included in voiceDirectives', () => {
      const { voiceDirectives } = planner.plan(
        'board_update', null, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT,
        [WORKSPACE_VOICE_LEARNING],
      );
      expect(voiceDirectives.avoidPatterns).toContain('enterprise-grade');
      expect(voiceDirectives.avoidPatterns).toContain('best-in-class');
    });

    it('workspace avoidPatterns are unioned with user avoidPatterns', () => {
      const { voiceDirectives } = planner.plan(
        'board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT,
        [WORKSPACE_VOICE_LEARNING],
      );
      expect(voiceDirectives.avoidPatterns).toContain('enterprise-grade'); // workspace
      expect(voiceDirectives.avoidPatterns).toContain('leverage');          // user
    });

    it('workspace preferredTerms override user preferredTerms for same key', () => {
      // User has 'users' → 'customers equivalent'; workspace has 'users' → 'members'
      const { vocabularyDirectives } = planner.plan(
        'board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT,
        [WORKSPACE_VOICE_LEARNING],
      );
      expect(vocabularyDirectives.preferredTerms['users']).toBe('members'); // workspace wins
    });

    it('workspace forbiddenTerms are unioned with user and project forbiddenTerms', () => {
      const { vocabularyDirectives } = planner.plan(
        'board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, PROJECT_VOCAB_CONTEXT,
        [WORKSPACE_VOICE_LEARNING],
      );
      expect(vocabularyDirectives.forbiddenTerms).toContain('disrupt');  // workspace
      expect(vocabularyDirectives.forbiddenTerms).toContain('leverage'); // user
      expect(vocabularyDirectives.forbiddenTerms).toContain('legacy');   // project
    });

    it('two different users with same workspace learnings receive identical workspace voice', () => {
      const plan1 = planner.plan('board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT, [WORKSPACE_VOICE_LEARNING]);
      const plan2 = planner.plan('board_update', null,           null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT, [WORKSPACE_VOICE_LEARNING]);
      // Both should contain the workspace tone signals
      expect(plan1.voiceDirectives.tone).toContain('bold');
      expect(plan2.voiceDirectives.tone).toContain('bold');
      // Both should have the workspace preferred term
      expect(plan1.vocabularyDirectives.preferredTerms['users']).toBe('members');
      expect(plan2.vocabularyDirectives.preferredTerms['users']).toBe('members');
    });

    it('no workspace learnings → falls back to existing behaviour, no error', () => {
      // Omitting workspace learnings (default []) must not change existing behaviour
      const withoutWorkspace = planner.plan('board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT);
      const withEmpty        = planner.plan('board_update', FOUNDER_PROFILE, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT, []);
      expect(withoutWorkspace.voiceDirectives).toEqual(withEmpty.voiceDirectives);
      expect(withoutWorkspace.vocabularyDirectives).toEqual(withEmpty.vocabularyDirectives);
    });

    it('non-voice-taxonomy learnings are ignored for voice resolution', () => {
      // taxonomyCategory 'professional_identity' is not in VOICE_TAXONOMY_CATEGORIES
      // so its content should not influence voice directives.
      const NON_VOICE_LEARNING: import('../../../src/types/entities').Learning = {
        ...WORKSPACE_VOICE_LEARNING,
        id:               'wl-2',
        domain:           'workspace_intelligence',
        taxonomyCategory: 'professional_identity',
        content: { tone: ['stealthy'], sentenceRhythm: 'long' },
      };
      const { voiceDirectives } = planner.plan(
        'board_update', null, null, BOARD_AUDIENCE, EMPTY_PROJECT_CONTEXT,
        [NON_VOICE_LEARNING],
      );
      // 'stealthy' should NOT appear — its taxonomyCategory is not voice-relevant
      expect(voiceDirectives.tone).not.toContain('stealthy');
    });
  });
});
