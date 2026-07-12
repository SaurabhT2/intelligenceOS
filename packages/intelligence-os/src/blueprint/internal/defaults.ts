/**
 * defaults.ts
 *
 * System-wide constants and defaults for Blueprint Assembly.
 *
 * These apply when the Intelligence OS has no stored intelligence for a user
 * (new user, pre-onboarding) or when a specific dimension has no data.
 * Blueprint generation must always succeed — these defaults ensure it does.
 *
 * Authority ordering (Architecture Section 6.1):
 *   USER_CORRECTION          = 10  (highest)
 *   EXPLICIT_INSTRUCTION     = 9
 *   USER_ESTABLISHED_PATTERN = 8
 *   WORKSPACE_COMPLIANCE     = 7   (Immutability Rule: cannot be overridden)
 *   PROJECT_CONTEXT          = 6
 *   AUDIENCE_CALIBRATION     = 5
 *   ARCHETYPE_INTELLIGENCE   = 4
 *   UNIVERSAL_PATTERN        = 3
 *   SYSTEM_DEFAULT           = 2   (lowest)
 */

import type {
  VoiceDirectives,
  VocabularyDirectives,
  AudienceCalibration,
  NarrativeFrame,
  DepthSpecification,
} from '@intelligence-os/shared-types';

// ── Authority levels ──────────────────────────────────────────────────────────

export const AUTHORITY_LEVELS = {
  USER_CORRECTION:          10,
  EXPLICIT_INSTRUCTION:     9,
  USER_ESTABLISHED_PATTERN: 8,
  WORKSPACE_COMPLIANCE:     7,
  PROJECT_CONTEXT:          6,
  AUDIENCE_CALIBRATION:     5,
  ARCHETYPE_INTELLIGENCE:   4,
  UNIVERSAL_PATTERN:        3,
  SYSTEM_DEFAULT:           2,
} as const;

// ── Voice and vocabulary defaults ─────────────────────────────────────────────

export const DEFAULT_VOICE_DIRECTIVES: VoiceDirectives = {
  register:        'professional',
  tone:            ['clear', 'structured', 'direct'],
  sentenceRhythm:  'mixed',
  paragraphStyle:  'airy',
  avoidPatterns:   [],
};

export const DEFAULT_VOCABULARY_DIRECTIVES: VocabularyDirectives = {
  preferredTerms:  {},
  forbiddenTerms:  [],
  domainJargon:    [],
  proprietaryTerms: [],
};

export const DEFAULT_AUDIENCE_CALIBRATION: AudienceCalibration = {
  isNamedRelationship: false,
  audienceType:        'general',
  expertiseLevel:      'informed',
  communicationNorms:  {},
  knownSensitivities:  {},
  confidence:          0.1,
};

// ── Per-audience-type defaults ────────────────────────────────────────────────

export interface AudienceTypeDefaults {
  register:       VoiceDirectives['register'];
  expertiseLevel: AudienceCalibration['expertiseLevel'];
  tone:           string[];
  evidenceType:   'data' | 'narrative' | 'example' | 'mixed';
}

export const AUDIENCE_TYPE_DEFAULTS: Record<string, AudienceTypeDefaults> = {
  board: {
    register:       'formal',
    expertiseLevel: 'practitioner',
    tone:           ['concise', 'authoritative', 'accountable'],
    evidenceType:   'data',
  },
  investor: {
    register:       'professional',
    expertiseLevel: 'informed',
    tone:           ['transparent', 'confident', 'metrics-led'],
    evidenceType:   'data',
  },
  engineering: {
    register:       'technical',
    expertiseLevel: 'expert',
    tone:           ['precise', 'thorough', 'evidence-based'],
    evidenceType:   'data',
  },
  customer: {
    register:       'conversational',
    expertiseLevel: 'informed',
    tone:           ['clear', 'helpful', 'empathetic'],
    evidenceType:   'example',
  },
  general: {
    register:       'professional',
    expertiseLevel: 'informed',
    tone:           ['clear', 'structured'],
    evidenceType:   'mixed',
  },
};

// ── Archetype → voice tendency ────────────────────────────────────────────────
// Applied when no profile voiceSummary exists (ARCHETYPE_INTELLIGENCE level).

export const ARCHETYPE_VOICE_DEFAULTS: Partial<Record<string, Partial<VoiceDirectives>>> = {
  founder:              { register: 'professional', tone: ['direct', 'visionary', 'honest'],          sentenceRhythm: 'short'  },
  ceo_executive:        { register: 'formal',        tone: ['authoritative', 'decisive'],              sentenceRhythm: 'mixed'  },
  product_leader:       { register: 'professional', tone: ['user-focused', 'clear', 'outcome-led'],   sentenceRhythm: 'mixed'  },
  engineering_leader:   { register: 'technical',    tone: ['precise', 'systematic', 'evidence-based'],sentenceRhythm: 'long'   },
  architect:            { register: 'technical',    tone: ['thorough', 'precise', 'structured'],       sentenceRhythm: 'long'   },
  consultant:           { register: 'professional', tone: ['persuasive', 'structured'],               sentenceRhythm: 'mixed'  },
  researcher_scientist: { register: 'technical',    tone: ['rigorous', 'precise', 'evidence-based'],  sentenceRhythm: 'long'   },
  professor_educator:   { register: 'professional', tone: ['clear', 'methodical', 'accessible'],      sentenceRhythm: 'mixed'  },
  writer_creator:       { register: 'conversational',tone: ['engaging', 'authentic', 'distinctive'], sentenceRhythm: 'short'  },
  investor:             { register: 'formal',        tone: ['analytical', 'decisive', 'data-led'],    sentenceRhythm: 'mixed'  },
  coach_advisor:        { register: 'conversational',tone: ['empathetic', 'encouraging', 'actionable'],sentenceRhythm: 'short' },
  freelancer:           { register: 'professional', tone: ['clear', 'results-focused'],               sentenceRhythm: 'short'  },
};

// ── Narrative frame lookup ────────────────────────────────────────────────────
// (artifactType → audienceType → NarrativeFrame)
// These are content directives for the generation layer, not generated prose.
// They guide WHAT to say and HOW to structure it, not the prose itself.

export const NARRATIVE_FRAME_LOOKUP: Record<string, Record<string, NarrativeFrame>> = {
  board_update: {
    board: {
      opening:           'Lead with the single most important metric or decision outcome. State it plainly in the first sentence.',
      argumentStructure: 'Headline metric or outcome → KPIs vs targets → key decisions made → risks and mitigations → what you need from the board.',
      closing:           'End with a specific, time-bound ask or the key decision required.',
    },
    investor: {
      opening:           'Open with the most significant business signal from the period.',
      argumentStructure: 'Signal → progress against plan → capital implications → next period outlook → ask if any.',
    },
    general: {
      opening:           'Open with the key outcome or metric that defines the period.',
      argumentStructure: 'Headline → progress → decisions → risks → next steps.',
    },
  },
  investor_update: {
    investor: {
      opening:           'Open with the metric investors care most about right now — revenue, growth, or the leading indicator you have agreed to track together.',
      argumentStructure: 'Signal metric → top 2–3 wins → key challenges and what you are doing about them → team or product news → next period milestones → specific ask if any.',
      closing:           'End with either a specific ask or a clear forward signal that shows momentum.',
    },
    board: {
      opening:           'Lead with the financial signal — revenue, burn, or runway — depending on where the company is in its journey.',
      argumentStructure: 'Financial signal → operational highlights → risks and mitigations → next milestones → governance items.',
      closing:           'End with governance items or decisions required.',
    },
    general: {
      opening:           'Open with the most important signal from the period.',
      argumentStructure: 'Signal → context → wins → challenges → outlook.',
    },
  },
  strategy_document: {
    board: {
      opening:           'Open with the strategic question this document answers and why it matters now.',
      argumentStructure: 'Strategic question → situation analysis → options considered (with trade-offs explicit) → recommended path with evidence → execution plan → risks and mitigations.',
      closing:           'End with the decision required and the consequences of delay.',
    },
    engineering: {
      opening:           'Open with the technical problem this strategy addresses and the constraints that make it hard.',
      argumentStructure: 'Problem → requirements → options with trade-offs → recommendation → execution plan → dependencies and open questions.',
      closing:           'End with open questions and the criteria for re-evaluating this decision.',
    },
    investor: {
      opening:           'Open with the market opportunity or competitive pressure that makes this strategy necessary.',
      argumentStructure: 'Market context → strategic choice → why this path → what we need to execute it → expected returns.',
    },
    general: {
      opening:           'Open with the problem or opportunity that makes this strategy necessary.',
      argumentStructure: 'Context → analysis → recommendation → plan → risks.',
    },
  },
  architecture_proposal: {
    engineering: {
      opening:           'Open with the specific problem the current architecture creates — what breaks, scales poorly, or is operationally painful.',
      argumentStructure: 'Problem statement → functional and non-functional requirements → proposed design with rationale → alternatives considered and why rejected → trade-offs and known limitations → migration path.',
      closing:           'End with the open questions that need resolution before implementation begins.',
    },
    board: {
      opening:           'Open with the business risk or constraint that makes this architectural change necessary.',
      argumentStructure: 'Business impact → what we are changing and why → cost and timeline estimate → risks → what we need from you.',
      closing:           'End with the specific ask — approval, budget, or a timeline decision.',
    },
    general: {
      opening:           'Open with the problem this architecture solves and why it matters.',
      argumentStructure: 'Problem → design → trade-offs → plan.',
    },
  },
  linkedin_post: {
    general: {
      opening:           'Open with a pattern interrupt — a counterintuitive claim, a specific surprising number, or a question that challenges a common assumption. The first line must earn the scroll stop.',
      argumentStructure: 'Pattern interrupt → context that earns the claim → the insight or lesson → practical implication or invitation to reflect.',
      closing:           'End with an implicit invitation — a question, a provocative statement, or simply letting the insight land. Avoid explicit calls to action.',
    },
    customer: {
      opening:           'Open with a specific moment or observation your audience will recognise from their own experience.',
      argumentStructure: 'Recognisable moment → the insight this reveals → practical implication → reflection or invitation.',
    },
    investor: {
      opening:           'Open with a specific market insight or contrarian data point.',
      argumentStructure: 'Insight or data point → what most people miss → the implication → your perspective.',
    },
  },
};

/**
 * Returns the best available NarrativeFrame for the given artifact type
 * and audience type. Always returns a frame — never null.
 */
export function getNarrativeFrame(
  artifactType: string,
  audienceType: string | undefined,
): NarrativeFrame {
  const typeFrames = NARRATIVE_FRAME_LOOKUP[artifactType];
  if (typeFrames) {
    const audience = audienceType ?? 'general';
    return (
      typeFrames[audience] ??
      typeFrames['general'] ?? {
        opening:           `Open with the key point that makes this ${artifactType.replace(/_/g, ' ')} necessary.`,
        argumentStructure: 'Context → key point → evidence or rationale → conclusion or ask.',
      }
    );
  }
  // Unknown artifact type — generic fallback
  return {
    opening:           `Open with the key point that makes this ${artifactType.replace(/_/g, ' ')} necessary.`,
    argumentStructure: 'Context → key point → evidence or rationale → conclusion or ask.',
  };
}

// ── Fallback sections ─────────────────────────────────────────────────────────
// Used by StructurePlanner when no ArtifactPattern exists for the requested type.

export const FALLBACK_SECTIONS = [
  {
    id:         'context',
    title:      'Context',
    purpose:    'Establish the situation and why this document exists.',
    depthLevel: 'standard' as const,
  },
  {
    id:         'main_content',
    title:      'Main Content',
    purpose:    'The core argument, information, or proposal.',
    depthLevel: 'standard' as const,
  },
  {
    id:         'next_steps',
    title:      'Next Steps',
    purpose:    'What happens next, what is needed, or what the reader should take away.',
    depthLevel: 'summary' as const,
  },
] as const;

// ── Depth specification ───────────────────────────────────────────────────────

export const DEFAULT_DEPTH_SPEC: DepthSpecification = {
  level: 'standard',
};
