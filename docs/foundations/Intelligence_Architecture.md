# BrandOS Intelligence Architecture
### The Operating Model Above the Learning Taxonomy

> **Historical specification document.** Pre-implementation architectural design document. The intelligence model described here is the direct ancestor of IntelligenceOS's six-domain architecture. "Status: Proposed" reflects the document's state at authoring time; the architecture has since been implemented. For current state, see `INTELLIGENCEOS_BOOTSTRAP.md`. For the phase-by-phase activation model referenced throughout IntelligenceOS code comments, see `foundations/BrandOS_Intelligence_Contracts.md` §J.

**Document Class:** Board-Level Architectural Design  
**Status:** Proposed — For Review  
**Scope:** Intelligence Organization & Consumption Model  
**Assumes:** BrandOS Learning Taxonomy (Sections A–I) is approved and complete

---

> **Design Axiom:** The taxonomy defines *what* BrandOS learns.  
> This document defines *how* that intelligence is organized, governed, and consumed  
> to produce compounding artifact quality over time.

---

## Table of Contents

- [Section A — Intelligence Domains](#section-a--intelligence-domains)
- [Section B — Domain Boundaries](#section-b--domain-boundaries)
- [Section C — Project Intelligence](#section-c--project-intelligence)
- [Section D — Artifact Intelligence](#section-d--artifact-intelligence)
- [Section E — Relationship Intelligence](#section-e--relationship-intelligence)
- [Section F — Workspace Intelligence](#section-f--workspace-intelligence)
- [Section G — Intelligence Flow Model](#section-g--intelligence-flow-model)
- [Section H — Intelligence Consumption Model](#section-h--intelligence-consumption-model)
- [Section I — Intelligence Conflict Resolution](#section-i--intelligence-conflict-resolution)
- [Section J — Intelligence Lifecycle](#section-j--intelligence-lifecycle)
- [Section K — Minimum GTM Intelligence Model](#section-k--minimum-gtm-intelligence-model)
- [Section L — Final Recommendation](#section-l--final-recommendation)

---

# Section A — Intelligence Domains

## A.1 — First-Principles Domain Analysis

The taxonomy answers: *What should BrandOS learn about a user?*  
The architecture must answer a different question: *How should learned intelligence be organized so that it compounds across time, context, and artifact types?*

Domain identification is not organizational preference. It is structural necessity. A domain exists when a coherent set of intelligence has **shared purpose, shared decay characteristics, shared ownership, and shared impact on artifact quality** — and when its absence would measurably degrade output.

From first principles, BrandOS operates across five irreducibly distinct intelligence contexts:

1. The **person** who uses the system
2. The **project** they are executing
3. The **artifacts** they create and receive
4. The **people** they communicate with
5. The **organization** they operate within

Each context generates intelligence that cannot be meaningfully collapsed into another without information loss.

---

## A.2 — Domain Definitions

### Domain 1: User Intelligence

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Build and maintain a persistent, high-confidence model of the individual user that improves every artifact they generate for the rest of their BrandOS lifetime. |
| **Core Questions Answered** | Who is this person? How do they think? How do they write? What do they value? What are their goals? What are their constraints? |
| **Typical Learnings** | Professional identity, writing style, expertise depth, goals, constraints, operating principles, intellectual frameworks, cultural/linguistic context, stakeholder relationships, personal brand signal |
| **Stability** | Mixed — identity and style are long-term or permanent; goals and constraints are medium-term |
| **Importance** | Foundational — all other domains inherit from User Intelligence as their baseline |
| **Impact on Artifact Quality** | Critical. Without User Intelligence, every artifact is generic. With it, every artifact is personalized from the first word. |

**Why it exists:** A user is not a session. They are not a prompt. They are a professional with a history, an identity, a voice, and a set of goals that persist across every interaction. User Intelligence is the bedrock model that prevents BrandOS from starting from zero every time.

---

### Domain 2: Project Intelligence

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Model the specific initiative, engagement, or program that a user is currently executing so that all artifacts generated within that context are coherent, consistent, and progressively more useful. |
| **Core Questions Answered** | What are they building? For whom? With what constraints? At what stage? Toward what milestones? With what stakeholders? |
| **Typical Learnings** | Project type, lifecycle stage, goals, constraints, stakeholders, vocabulary, assets, methodologies, success criteria, project-specific audience profiles |
| **Stability** | Bounded — active during project lifecycle; archived on completion |
| **Importance** | Very High — for knowledge workers, most high-value artifacts exist in project contexts |
| **Impact on Artifact Quality** | Very High. A board update generated with project context is categorically different from one generated without it. |

**Why it exists:** Users do not generate artifacts in a vacuum. They generate them for a specific purpose, in a specific context, within a specific initiative. Project Intelligence is the context layer that transforms generic output into situationally relevant, strategically coherent artifacts.

---

### Domain 3: Artifact Intelligence

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Build a compounding intelligence model about artifact types themselves — their optimal structures, successful patterns, preferred formats, and proven narrative flows — so that each new artifact generated is informed by the full history of what has worked before. |
| **Core Questions Answered** | What structure works best for this user and this artifact type? What depth, length, and format? What has been accepted, edited, or rejected? |
| **Typical Learnings** | Preferred structures per artifact type, narrative flows, section ordering preferences, depth calibrations, length baselines, accepted exemplars, rejected patterns |
| **Stability** | Long-term (evolves slowly with consistent feedback) |
| **Importance** | High — directly drives quality differentiation |
| **Impact on Artifact Quality** | Very High. This is the only domain that directly models the output rather than the person or context. |

**Why it exists:** BrandOS is not a chat system. It is an artifact generation system. If it cannot learn from its own outputs — across users, across time — it cannot compound quality. Artifact Intelligence is how BrandOS gets better at its core function.

---

### Domain 4: Relationship Intelligence

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Model the specific people and organizations that appear in the user's professional world so that artifacts directed at them are precisely calibrated to their expectations, knowledge level, communication norms, and relationship context. |
| **Core Questions Answered** | Who is this artifact going to? What do they know? What do they expect? What language do they use? What decisions are they making? |
| **Typical Learnings** | Audience profiles (role, expertise, communication preferences), relationship type (investor, board, client, employee, partner), prior interaction context, known sensitivities |
| **Stability** | Medium-term — relationship context evolves as relationships evolve |
| **Importance** | High — especially for external communication artifacts |
| **Impact on Artifact Quality** | High. An investor memo written with investor-specific intelligence is categorically better than one written for a generic sophisticated audience. |

**Why it exists:** External artifacts are not written for the user — they are written for someone else. Without Relationship Intelligence, BrandOS cannot calibrate tone, depth, vocabulary, or framing to the actual recipient. Audience mismatch is one of the most common failure modes in professional communication.

---

### Domain 5: Workspace Intelligence

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Model the organizational or collaborative context within which the user operates — shared methodologies, shared vocabularies, shared assets, shared standards — so that artifacts generated within that context are coherent with the organization's identity and practices. |
| **Core Questions Answered** | What standards and conventions govern outputs here? What terminology is shared? What frameworks are canonical? What has this organization already produced? |
| **Typical Learnings** | Organizational vocabulary, canonical frameworks, shared asset library, formatting standards, brand voice guidelines, regulatory or legal constraints that apply to all users |
| **Stability** | Relatively stable — organizational standards evolve slowly |
| **Importance** | Medium-High — becomes critical at team and enterprise scale |
| **Impact on Artifact Quality** | High in team contexts. Ensures artifacts generated by any user within the workspace are consistent with organizational standards. |

**Why it exists:** Individuals operate within institutions. Organizations have standards, vocabularies, and identities that transcend any individual user. Workspace Intelligence prevents artifacts from being inconsistent with the organizational context they will inhabit.

---

## A.3 — Domain Summary Table

| Domain | Primary Owner | Decay Profile | GTM Priority | Artifact Quality Impact |
|--------|--------------|---------------|--------------|------------------------|
| User Intelligence | Individual User | Mixed (Permanent → Medium-Term) | Mandatory (P1) | Critical |
| Project Intelligence | Project + User | Bounded by project lifecycle | Mandatory (P1) | Very High |
| Artifact Intelligence | System (cross-user) | Long-term with reinforcement | Mandatory (P1) | Very High |
| Relationship Intelligence | User + Project | Medium-term | High (P2) | High |
| Workspace Intelligence | Organization | Slow decay | Team/Enterprise (P2+) | High at scale |

---

# Section B — Domain Boundaries

## B.1 — What Belongs in Each Domain

### User Intelligence — Owns

- Professional identity, expertise, and skills inventory
- Communication and writing style (voice, tone, register, vocabulary)
- Goals and objectives (personal and career)
- Constraints and operating principles
- Intellectual frameworks and mental models
- Personal brand signal
- Cross-project preferences (artifacts, formats, depth)
- Cultural and linguistic context
- Temporal and behavioral patterns
- Emotional register

### User Intelligence — Never Owns

- Project-specific goals or stakeholders (Project Intelligence)
- Audience profiles for specific recipients (Relationship Intelligence)
- Organizational standards (Workspace Intelligence)
- Artifact-type performance history (Artifact Intelligence)
- Competitor intelligence that belongs to a project, not the person

---

### Project Intelligence — Owns

- Project-specific vocabulary and terminology
- Project goals, milestones, and constraints
- Project stakeholder map
- Project-specific assets (decks, documents, frameworks produced within the project)
- Project lifecycle state
- Project-specific audience profiles
- Prior artifacts produced for the project
- Project-specific success criteria

### Project Intelligence — Never Owns

- User's general writing style (User Intelligence)
- Organizational standards (Workspace Intelligence)
- Profiles of recurring relationships not specific to this project (Relationship Intelligence)
- Artifact structure templates (Artifact Intelligence)

---

### Artifact Intelligence — Owns

- Per-artifact-type structure templates and preferred patterns
- Successful structural exemplars (accepted artifacts)
- Rejection patterns (what structures get edited or deleted)
- Length and depth baselines per artifact type and user
- Narrative flow preferences per artifact type
- Section ordering preferences
- Cross-user artifact quality patterns (aggregated, anonymized)

### Artifact Intelligence — Never Owns

- Who the artifact was written for (Relationship Intelligence)
- Why it was written — the project context (Project Intelligence)
- The user's general writing style (User Intelligence)
- Organizational conventions (Workspace Intelligence)

---

### Relationship Intelligence — Owns

- Profiles of specific audiences and stakeholders (named individuals or organizations)
- Audience expertise level, communication preferences, decision-making context
- Relationship type (investor, client, board, employee, partner, recruiter)
- Prior communication history with that audience
- Known sensitivities, preferences, or requirements
- The difference between how the user writes for themselves vs. how they write for this audience

### Relationship Intelligence — Never Owns

- The user's general writing style (User Intelligence)
- The project context for which communication is being generated (Project Intelligence)
- Generic audience categories — only specific, named, or meaningfully distinct audiences
- Artifact structure templates (Artifact Intelligence)

---

### Workspace Intelligence — Owns

- Organizational vocabulary and brand voice
- Canonical frameworks and methodologies
- Shared asset library (logos, templates, approved decks)
- Formatting and visual standards
- Legal, regulatory, or compliance constraints that apply to all users
- Shared team context (active projects, team members, shared goals)

### Workspace Intelligence — Never Owns

- Individual user preferences (User Intelligence)
- Project-specific details (Project Intelligence)
- Specific relationship profiles (Relationship Intelligence)
- Artifact performance data at user level (Artifact Intelligence)

---

## B.2 — Conflict Zones and Ownership Resolution

```
CONFLICT ZONE MAP

┌─────────────────────────────────────────────────────────────┐
│ CONFLICT TYPE              │ RESOLUTION OWNER               │
├────────────────────────────┼────────────────────────────────┤
│ User style vs. Workspace   │ Workspace wins for external     │
│ brand voice                │ artifacts; User wins internally │
├────────────────────────────┼────────────────────────────────┤
│ Project goal vs. User      │ Project goal governs artifact   │
│ long-term goal             │ context; User goal governs      │
│                            │ overall framing                 │
├────────────────────────────┼────────────────────────────────┤
│ Audience (Relationship)    │ Relationship Intelligence wins  │
│ vs. User tone preference   │ for recipient-specific content  │
├────────────────────────────┼────────────────────────────────┤
│ Artifact template          │ User+Project context enriches   │
│ vs. User structure pref.   │ template; template provides     │
│                            │ structure baseline only         │
├────────────────────────────┼────────────────────────────────┤
│ Project-specific           │ Project vocabulary overrides    │
│ vocabulary vs. User vocab  │ within project scope            │
└────────────────────────────┴────────────────────────────────┘
```

**Governing principle:** Context specificity wins. The more specific the intelligence to the current task, the higher its authority over that task.

---

# Section C — Project Intelligence

## C.1 — Projects as First-Class Entities

Projects must be first-class entities in BrandOS. The argument is direct:

Most high-value professional work is organized as projects. Users do not produce isolated artifacts — they produce **streams of related artifacts in service of a coherent initiative**. A board update, a product spec, an investor memo, and a team communication all produced for the same startup are not independent artifacts. They are artifacts within a shared context, requiring shared vocabulary, consistent positioning, shared stakeholder knowledge, and coherent narrative across documents.

Without Project Intelligence, each artifact is generated as if the others do not exist. With it, BrandOS can be the only system that treats an artifact as what it actually is: one chapter in a larger story.

---

## C.2 — What Should Be Learned About Projects

### Project Identity

| Intelligence Item | Description | Acquisition |
|------------------|-------------|-------------|
| Project Type | Startup, consulting engagement, book, product, research program, career transition, business initiative, course | First description or explicit creation |
| Project Name | Official or working name | Explicit |
| Project Stage | Ideation → Scoping → Execution → Completion → Archived | Inferred from context + explicit events |
| Primary Objective | The single most important outcome the project must deliver | Extracted from first project artifact or explicit statement |
| Success Criteria | How success will be measured | Explicit statements, KPI documents, OKR uploads |

### Project Context

| Intelligence Item | Description |
|------------------|-------------|
| Audience Map | Who does this project ultimately serve or communicate to? |
| Stakeholder Map | Who has influence over, or dependency on, this project? |
| Constraints | Budget, timeline, team size, technology, regulatory |
| Competitive Context | What are the alternatives or threats this project navigates? |
| Domain | Industry, market, or field the project operates in |

### Project Assets

| Asset Type | Example |
|-----------|---------|
| Source Documents | Strategy decks, briefs, research reports |
| Prior Artifacts | Documents generated by BrandOS for this project |
| Vocabulary | Project-specific terms, branded language, proprietary names |
| Frameworks | Methodologies, models, or approaches canonical to this project |
| Templates | Approved output formats for this project's artifacts |

---

## C.3 — Project Intelligence vs. User Intelligence

```
COMPARISON: USER VS. PROJECT INTELLIGENCE

┌──────────────────────────────┬──────────────────────────────┐
│ USER INTELLIGENCE            │ PROJECT INTELLIGENCE          │
├──────────────────────────────┼──────────────────────────────┤
│ Persists across all projects │ Scoped to project lifetime    │
│ Who the person always is     │ What they are doing right now │
│ Voice and style              │ Vocabulary and positioning    │
│ Long-term goals              │ Project-specific milestones   │
│ All audiences over time      │ Project-specific audiences    │
│ Values and principles        │ Project-specific constraints  │
│ Expertise and knowledge      │ Project-specific IP and assets│
│ Survives project completion  │ Archived on completion        │
└──────────────────────────────┴──────────────────────────────┘
```

The critical distinction: User Intelligence describes who someone **is**. Project Intelligence describes what they are **doing**. Both are required to generate an artifact that is simultaneously authentic and relevant.

---

## C.4 — Project Lifecycle States

```
PROJECT LIFECYCLE

  SCOPING ──▶ ACTIVE ──▶ WINDING DOWN ──▶ COMPLETE ──▶ ARCHIVED
     │            │              │               │            │
  Define       Generate        Wrap-up         Debrief     Access
  scope,       artifacts,      artifacts,      learning    only —
  upload       update          final           extraction  no new
  assets       context         reports         + closure   artifacts
```

| State | BrandOS Behavior | Intelligence Activity |
|-------|-----------------|----------------------|
| **Scoping** | Extract project identity; initialize project model | Rapid learning; low confidence initial |
| **Active** | Full project context loaded for every artifact | Continuous reinforcement and enrichment |
| **Winding Down** | Decrease update frequency; flag outdated context | Confidence decay begins |
| **Complete** | Archive all project intelligence | Extract transferable learnings to User domain |
| **Archived** | Available for reference; no active consumption | Dormant; query-accessible |

---

## C.5 — Why Project Intelligence Becomes the Most Important Domain

At launch, User Intelligence is the most important domain because it is the foundation. But as BrandOS matures, Project Intelligence will likely become the highest-leverage domain for the following reason:

**Most artifact quality failures are not style failures — they are context failures.**

When a user says "this missed the mark," the most common reason is not that the tone was wrong or the structure was bad. It is that the artifact did not reflect the specific situation, the specific audience, and the specific stage of the specific initiative.

User Intelligence solves style. Project Intelligence solves relevance. And in professional artifact generation, relevance is the higher bar.

Furthermore, projects provide the **coherence layer** that transforms individual high-quality artifacts into a portfolio of strategically aligned work — which is the long-term value proposition of BrandOS.

---

# Section D — Artifact Intelligence

## D.1 — Why Artifact Intelligence Is Structurally Distinct

The taxonomy defines what BrandOS learns *from* artifacts (uploaded documents as signal sources). Artifact Intelligence is different: it is what BrandOS learns *about artifact types themselves* — patterns of structure, depth, narrative, and format that produce consistently high-quality outputs for a given user.

This is the domain that enables BrandOS to get better at being BrandOS.

---

## D.2 — Reusable Artifact Intelligence: The Pattern Library

For each artifact type, BrandOS should build a pattern model containing the following intelligence:

### Structural Intelligence

| Pattern | Description |
|---------|-------------|
| **Canonical Sections** | The sections this user expects for this artifact type (e.g., a board update always includes: Financial Summary, Product Progress, Operational Highlights, Asks) |
| **Section Ordering** | The sequence in which sections appear |
| **Section Depth** | How deeply each section is typically developed |
| **Hierarchy Depth** | Single-level, multi-level, or deeply nested structure |
| **Opening Pattern** | How this user begins this artifact type (executive summary, situation framing, narrative hook, data first) |
| **Closing Pattern** | How this user ends it (call to action, synthesis, open question, recommendation) |

### Narrative Intelligence

| Pattern | Description |
|---------|-------------|
| **Narrative Frame** | Problem-solution, situation-complication-resolution, data-insight-recommendation, chronological, thesis-first |
| **Argument Architecture** | Inductive, deductive, or analogical reasoning structure |
| **Evidence Style** | Data-primary, narrative-primary, example-primary, authority-primary |
| **Tension Pattern** | Does this user name challenges directly, soften them, or reframe them as opportunities? |

### Style Intelligence

| Pattern | Description |
|---------|-------------|
| **Output Length Baseline** | Typical word count for this artifact type |
| **Information Density** | Tightly packed vs. explanatory and spacious |
| **Vocabulary Register** | Technical, executive, narrative, academic |
| **Visual Pattern** | Heavy tables, bullet-dominant, prose-dominant, diagram-rich |
| **Sentence Rhythm** | Short and punchy, long and complex, varied |

---

## D.3 — Artifact Type Pattern Matrix

| Artifact Type | Canonical Sections | Narrative Frame | Default Depth | Output Style |
|--------------|-------------------|-----------------|---------------|--------------|
| Board Update | Financial, Product, Ops, Asks | Situation → Progress → Request | Medium-High | Executive / Table-heavy |
| Investor Memo | Thesis, Market, Product, Team, Traction, Use of Funds | Thesis-first / Data-backed | High | Formal / Evidence-primary |
| Strategy Document | Context, Insight, Options, Recommendation, Next Steps | Problem-Insight-Resolution | High | Analytical / Framework-rich |
| Architecture Proposal | Problem, Requirements, Proposed Design, Trade-offs, Recommendation | Technical / Requirements-driven | Very High | Technical / Diagram-rich |
| Research Paper | Abstract, Background, Method, Findings, Discussion, Conclusion | Chronological / Inductive | Very High | Academic / Citation-dense |
| LinkedIn Post | Hook, Insight, Story/Evidence, Call to Action | Narrative / Conversational | Low-Medium | Conversational / Tight |
| Executive Memo | Purpose, Background, Analysis, Recommendation | Bottom-line-up-front | Medium | Formal / Concise |
| Product Roadmap | Vision, Themes, Phases/Milestones, Dependencies | Strategic / Temporal | Medium-High | Visual / Table-primary |

---

## D.4 — How Successful Artifacts Improve Future Artifacts

### The Artifact Reinforcement Loop

```
ARTIFACT REINFORCEMENT CYCLE

  Artifact Generated
         │
         ▼
  User Response Captured
  (Accept / Edit / Reject / Deploy)
         │
         ├── ACCEPTED WITHOUT EDIT ──▶ Reinforce all contributing parameters
         │
         ├── EDITED ──────────────────▶ Extract delta (structure/length/vocab/tone/substance)
         │                              Update specific parameters
         │
         ├── REJECTED ────────────────▶ Flag as negative exemplar
         │                              Decrement confidence in contributing parameters
         │
         └── DEPLOYED ────────────────▶ Archive as gold standard exemplar
                                        Maximum reinforcement signal
```

### The Compounding Effect

The value of Artifact Intelligence compounds because each artifact accepted or deployed provides signal not just for the next similar artifact, but for the entire pattern model. After 10 accepted board updates, BrandOS does not just have 10 examples — it has a calibrated structural model, a calibrated depth model, a calibrated vocabulary model, and a calibrated narrative model — all validated by real deployment.

This is the mechanism by which BrandOS becomes genuinely better over time, not merely more informed.

---

## D.5 — Cross-User Artifact Intelligence

Beyond individual user patterns, BrandOS can build anonymized, aggregated intelligence about what structures work across users for a given artifact type. This serves as the **default starting model** before sufficient individual data exists, and as a **quality floor** that prevents early outputs from being poor.

```
ARTIFACT INTELLIGENCE LAYERING

  Layer 3 (Most Specific)  │ User + Project Specific Pattern
                            │ e.g., "Board updates for Series A startup"
                           ─┤
  Layer 2 (Archetype-level) │ User Archetype Pattern
                            │ e.g., "Board updates for Founders"
                           ─┤
  Layer 1 (Universal)       │ Cross-user Artifact Pattern
                            │ e.g., "Board update best practices"
```

As individual data accumulates, Layer 3 increasingly overrides Layers 1 and 2.

---

# Section E — Relationship Intelligence

## E.1 — The Case for Relationship Intelligence

Users do not create artifacts for themselves. They create them for people. Every external artifact is an act of communication aimed at a specific audience with specific expectations, specific knowledge, and specific decision context.

Without Relationship Intelligence, BrandOS can only estimate the audience from general cues. With it, BrandOS knows exactly who the document is going to, what they know, what they need to believe, and how they prefer to receive information.

---

## E.2 — Audience Intelligence vs. Relationship Intelligence

This is the critical distinction the taxonomy alludes to but the architecture must define precisely.

```
AUDIENCE vs. RELATIONSHIP INTELLIGENCE

┌─────────────────────────────────────┬────────────────────────────────────────┐
│ AUDIENCE INTELLIGENCE               │ RELATIONSHIP INTELLIGENCE               │
├─────────────────────────────────────┼────────────────────────────────────────┤
│ A profile of a type of audience     │ A profile of a specific person or group │
│ e.g., "board members in general"    │ e.g., "our specific board"             │
│                                     │                                        │
│ Generic calibration                 │ Specific calibration                   │
│ ("boards want concise updates")     │ ("our board asks for detailed financials│
│                                     │ and hates slides without speaker notes")│
│                                     │                                        │
│ Lives in: User Intelligence         │ Lives in: Relationship Intelligence     │
│ (Audience Intelligence category)    │                                        │
│                                     │                                        │
│ Applies to: artifact type globally  │ Applies to: specific recipient context  │
│                                     │                                        │
│ Acquired: quickly, at onboarding    │ Acquired: through interaction history  │
│                                     │ and explicit user description          │
└─────────────────────────────────────┴────────────────────────────────────────┘
```

---

## E.3 — Relationship Types and What to Learn

| Relationship Type | Key Learnings | Artifact Impact |
|------------------|---------------|----------------|
| **Board** | Formality preference, technical sophistication, key metrics they track, sensitivities, prior meeting context | Board updates, governance documents, board decks |
| **Investors** | Investment thesis alignment, preferred evidence type, stage-specific expectations, known concerns, communication frequency preference | Investor memos, pitch materials, fund updates |
| **Enterprise Customers** | Industry, decision-making structure, procurement constraints, success metrics, contractual language, technical depth | Proposals, case studies, business reviews, SOWs |
| **Direct Reports / Team** | Communication style expectations, level of autonomy, need for context vs. directive, trust level | Internal memos, team updates, project briefs |
| **Executive Leadership** | Brevity preference, data vs. narrative orientation, decision-making style, strategic priorities | Executive memos, escalation documents, briefings |
| **Partners** | Mutual interest framing, sensitivity to exclusivity and competitive tension, collaboration expectations | Partnership briefs, joint proposals, term sheets |
| **Recruiting Candidates** | Level of seniority, functional area, information need at each stage, cultural fit signals | Job descriptions, offer communications, interview briefs |
| **Regulators / Legal** | Formal language requirements, documentation standards, precise terminology, citation norms | Compliance documents, regulatory filings, legal briefs |
| **Media / Press** | On-record vs. off-record calibration, story angle, preferred narrative | Press releases, media briefs, interview preparation |

---

## E.4 — Relationship Intelligence Lifecycle

Relationship Intelligence is among the most volatile domain types. It must decay and refresh more actively than User Intelligence because relationships evolve — an investor who was skeptical becomes a champion; a board member whose interests were technical becomes focused on governance.

| Lifecycle Event | Intelligence Action |
|----------------|---------------------|
| Relationship introduced | Initialize profile from user description and any available context |
| Artifact sent to relationship | Capture outcome (response, feedback, edit, no response) |
| Explicit user description update | Override existing model with new user-provided intelligence |
| Extended inactivity with relationship | Decay confidence in currency of profile |
| Relationship type changes | Re-evaluate entire profile; archive prior model |
| Negative outcome with relationship | Flag and review current calibration model |

---

# Section F — Workspace Intelligence

## F.1 — What Belongs at Workspace Level

Workspace Intelligence exists at the intersection of organization and individual. It governs what is shared and what is standardized — the constants that any user in the workspace can rely on and any artifact generated in the workspace must reflect.

### Workspace-Level Intelligence

| Category | Description | Examples |
|----------|-------------|---------|
| **Organizational Identity** | How the organization describes itself, its mission, and its positioning | Company boilerplate, mission statement, value proposition |
| **Brand Voice** | Organizational communication standards — tone, formality, vocabulary | Voice guidelines, approved adjectives, tone dos/don'ts |
| **Canonical Vocabulary** | Terms and language that are official and must be used consistently | Product names, service names, internal terminology, approved acronyms |
| **Shared Frameworks** | Methodologies and models the organization uses | Named approaches, proprietary frameworks, owned methodologies |
| **Shared Asset Library** | Documents, templates, and materials available to all users | Approved pitch decks, one-pagers, approved case studies, templates |
| **Regulatory / Legal Constraints** | Requirements that apply to all workspace users | Compliance language, required disclaimers, jurisdiction-specific requirements |
| **Quality Standards** | Output standards that govern all artifacts | Formatting rules, citation standards, approval requirements |

---

## F.2 — Domain Allocation: The Three-Level Stack

```
WORKSPACE / PROJECT / USER DOMAIN ALLOCATION

┌────────────────────────────────────────────────────────────┐
│ WORKSPACE LEVEL                                            │
│  Brand Voice · Canonical Vocabulary · Shared Frameworks    │
│  Asset Library · Regulatory Constraints · Quality Standards│
└───────────────────────────┬────────────────────────────────┘
                             │ inherits from
┌───────────────────────────▼────────────────────────────────┐
│ PROJECT LEVEL                                              │
│  Project Goals · Project Stakeholders · Project Vocabulary │
│  Project Assets · Project Lifecycle State                  │
│  Project-Specific Audience Profiles                        │
└───────────────────────────┬────────────────────────────────┘
                             │ inherits from
┌───────────────────────────▼────────────────────────────────┐
│ USER LEVEL                                                 │
│  Writing Style · Expertise · Personal Goals · Frameworks   │
│  Personal Brand · Cross-Project Preferences               │
│  Communication Preferences · Intellectual Models           │
└────────────────────────────────────────────────────────────┘
```

**The inheritance rule:** Lower levels inherit from higher levels but can override within their scope. A user's writing style modifies the workspace brand voice; it does not replace it for external artifacts.

---

## F.3 — Duplication Prevention Rules

| Intelligence Item | MUST NOT duplicate at |
|------------------|----------------------|
| Organizational brand voice | User or Project level — reference Workspace, do not copy |
| User writing style | Workspace or Project level — it belongs to the individual |
| Project-specific vocabulary | User or Workspace level — it is project-scoped |
| Relationship profiles | Project level only if project-specific; User level if cross-project |
| Artifact structure templates | Workspace for default templates; Artifact Intelligence for user-calibrated variations |

---

# Section G — Intelligence Flow Model

## G.1 — The Flow Architecture

Before modeling specific artifact types, the general architecture of intelligence consultation must be defined.

```
INTELLIGENCE FLOW: GENERAL MODEL

USER REQUEST RECEIVED
         │
         ▼
  ┌──────────────────┐
  │ 1. INTENT PARSE  │ ─── What artifact type? What context?
  └──────┬───────────┘      What audience? What project?
         │
         ▼
  ┌──────────────────┐
  │ 2. CONTEXT LOAD  │ ─── Which intelligence domains are relevant?
  └──────┬───────────┘      Initialize domain consultation queue.
         │
         ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 3. DOMAIN CONSULTATION (PARALLEL)                        │
  │                                                          │
  │  Workspace ──▶ Project ──▶ User ──▶ Relationship ──▶    │
  │  Intelligence   Intelligence  Intelligence  Intelligence  │
  │                                                          │
  │                     ▼                                    │
  │             Artifact Intelligence                        │
  │             (structure + pattern)                        │
  └──────────────────────────┬───────────────────────────────┘
         │
         ▼
  ┌──────────────────┐
  │ 4. CONFLICT      │ ─── Apply resolution framework (Section I)
  │    RESOLUTION    │
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────┐
  │ 5. BLUEPRINT     │ ─── Structure + narrative + depth decisions
  │    ASSEMBLY      │
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────┐
  │ 6. GENERATION    │ ─── Artifact generated with intelligence applied
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────┐
  │ 7. FEEDBACK      │ ─── Capture response; update relevant domains
  │    CAPTURE       │
  └──────────────────┘
```

---

## G.2 — Artifact-Specific Intelligence Flow Analysis

### Board Update

| Flow Stage | Domain | Intelligence Applied | Priority |
|-----------|--------|---------------------|----------|
| Structure | Artifact Intelligence | Board update canonical sections for this user | 1 |
| Audience | Relationship Intelligence | This specific board's preferences and sophistication | 2 |
| Context | Project Intelligence | Current project/company state, milestones, challenges | 3 |
| Voice | User Intelligence | Executive register, vocabulary, framing style | 4 |
| Standards | Workspace Intelligence | Organizational formatting and compliance requirements | 5 |

**Conflict scenario:** User prefers narrative prose; board relationship intelligence indicates this board wants data tables. **Resolution:** Relationship Intelligence wins for external recipient-facing content. Board update structure uses data-primary format with user's narrative voice applied within sections.

---

### Strategy Document

| Flow Stage | Domain | Intelligence Applied | Priority |
|-----------|--------|---------------------|----------|
| Structure | Artifact Intelligence | Strategy doc pattern: Context/Insight/Options/Rec | 1 |
| Context | Project Intelligence | Strategic context, constraints, goals | 2 |
| Frameworks | User Intelligence | Preferred analytical frameworks, reasoning style | 3 |
| Vocabulary | Project Intelligence | Project-specific terminology | 4 |
| Depth | User Intelligence | Expertise level, preferred depth | 5 |

**Conflict scenario:** Project requires detailed options analysis; user prefers concise outputs. **Resolution:** Project scope drives length minimum; User Intelligence drives economy of language within required depth. The document is complete but written concisely.

---

### Architecture Proposal

| Flow Stage | Domain | Intelligence Applied | Priority |
|-----------|--------|---------------------|----------|
| Structure | Artifact Intelligence | Technical doc pattern: Requirements/Design/Trade-offs | 1 |
| Technical Depth | User Intelligence | Engineering expertise level, stack preferences | 2 |
| Context | Project Intelligence | System requirements, constraints, prior decisions | 3 |
| Audience | Relationship Intelligence | Technical sophistication of reviewer/stakeholders | 4 |
| Standards | Workspace Intelligence | Documentation standards, approved tools/stack | 5 |

---

### Research Paper

| Flow Stage | Domain | Intelligence Applied | Priority |
|-----------|--------|---------------------|----------|
| Structure | Artifact Intelligence | Academic structure: Abstract/Method/Findings/Discussion | 1 |
| Domain Expertise | User Intelligence | Research domain, citation style, methodology vocabulary | 2 |
| Context | Project Intelligence | Research program context, prior work, scope | 3 |
| Audience | Relationship Intelligence | Publication audience, reviewer expectations | 4 |
| Vocabulary | User Intelligence | Domain-specific terminology and jargon library | 5 |

---

### LinkedIn Post

| Flow Stage | Domain | Intelligence Applied | Priority |
|-----------|--------|---------------------|----------|
| Voice | User Intelligence | Personal brand signal, public persona vocabulary | 1 |
| Narrative | Artifact Intelligence | LinkedIn post structure: Hook/Insight/Evidence/CTA | 2 |
| Topic | Project Intelligence | Current initiative or insight worth sharing | 3 |
| Audience | Relationship Intelligence | General professional network; known follower context | 4 |
| Standards | Workspace Intelligence | If company-affiliated, brand voice compliance | 5 |

---

### Investor Update

| Flow Stage | Domain | Intelligence Applied | Priority |
|-----------|--------|---------------------|----------|
| Audience | Relationship Intelligence | Specific investor preferences, known concerns, history | 1 |
| Context | Project Intelligence | Company stage, metrics, milestones, challenges | 2 |
| Structure | Artifact Intelligence | Investor update canonical sections | 3 |
| Voice | User Intelligence | Founder communication style, confidence register | 4 |
| Standards | Workspace Intelligence | Legal constraints, approved disclosures | 5 |

---

### Product Roadmap

| Flow Stage | Domain | Intelligence Applied | Priority |
|-----------|--------|---------------------|----------|
| Context | Project Intelligence | Product vision, current status, strategic themes | 1 |
| Structure | Artifact Intelligence | Roadmap format: themes/phases/milestones | 2 |
| Audience | Relationship Intelligence | Internal team vs. investor vs. customer version | 3 |
| Depth | User Intelligence | Product thinking style, level of technical detail | 4 |
| Standards | Workspace Intelligence | Approved roadmap templates, visual standards | 5 |

---

### Executive Memo

| Flow Stage | Domain | Intelligence Applied | Priority |
|-----------|--------|---------------------|----------|
| Format | Artifact Intelligence | Bottom-line-up-front, concise format | 1 |
| Audience | Relationship Intelligence | Specific executive's priorities and communication style | 2 |
| Context | Project Intelligence | Specific decision, issue, or recommendation being escalated | 3 |
| Voice | User Intelligence | Formality level, vocabulary register | 4 |
| Standards | Workspace Intelligence | Internal memo standards, approval requirements | 5 |

---

# Section H — Intelligence Consumption Model

## H.1 — From Stored Intelligence to Generated Artifact

The path from raw stored intelligence to a high-quality generated artifact passes through eight transformation stages. Each domain participates in each stage with different weights.

---

## H.2 — The Eight Transformation Stages

### Stage 1: Context Assembly

*Purpose: Load all relevant intelligence for this specific request.*

| Domain | Contribution to Context Assembly |
|--------|----------------------------------|
| User Intelligence | Load user model (style, expertise, goals, frameworks, voice) |
| Project Intelligence | Load active project model if applicable |
| Artifact Intelligence | Load pattern model for requested artifact type |
| Relationship Intelligence | Load audience/recipient profile if artifact has named recipient |
| Workspace Intelligence | Load organizational standards and shared assets |

**Output:** A fully assembled intelligence context package for this request.

---

### Stage 2: Prompt Construction

*Purpose: Translate loaded intelligence into a precise artifact generation specification.*

| Domain | Contribution to Prompt Construction |
|--------|-------------------------------------|
| User Intelligence | Write in this user's voice; apply expertise calibration; apply goals framing |
| Project Intelligence | Ground in this project's current state and context |
| Artifact Intelligence | Apply canonical structure for this artifact type |
| Relationship Intelligence | Calibrate for this specific recipient |
| Workspace Intelligence | Apply organizational vocabulary and compliance requirements |

**Output:** A structured, intelligence-enriched generation prompt that is not a generic instruction but a precise specification.

---

### Stage 3: Planning

*Purpose: Determine what the artifact needs to accomplish before generating it.*

| Domain | Contribution to Planning |
|--------|--------------------------|
| Project Intelligence | What decisions or actions must this artifact enable? |
| User Intelligence | What is the user's underlying goal beyond the artifact itself? |
| Relationship Intelligence | What does the recipient need to believe, feel, or decide? |
| Artifact Intelligence | What is the proven structure for achieving this outcome with this artifact type? |

**Output:** A purpose-driven artifact plan — not just "generate a board update" but "generate a board update that secures approval for the Q3 budget increase by demonstrating traction and addressing the board's known concern about burn rate."

---

### Stage 4: Blueprint Generation

*Purpose: Construct the artifact's structural skeleton before filling content.*

| Domain | Contribution to Blueprint |
|--------|---------------------------|
| Artifact Intelligence | Canonical section list, ordering, depth guidelines |
| Project Intelligence | Section content prompts specific to project state |
| User Intelligence | Depth per section, structural preferences |
| Relationship Intelligence | Emphasis adjustments based on recipient priorities |

**Output:** A complete artifact blueprint — sections, subsections, estimated depth, narrative frame, opening and closing pattern.

---

### Stage 5: Structure Selection

*Purpose: Finalize the specific structural form from the blueprint options.*

```
STRUCTURE SELECTION DECISION TREE

Is there a confirmed, accepted structural template for this user + artifact type?
    YES ──▶ Use it (User-calibrated Artifact Intelligence)
    NO
    │
    ▼
Is there a strong archetype-level pattern for this artifact type?
    YES ──▶ Apply archetype pattern with User Intelligence modifications
    NO
    │
    ▼
Apply universal artifact pattern (Layer 1 Artifact Intelligence)
    + User style intelligence modifications
```

---

### Stage 6: Narrative Design

*Purpose: Select the narrative frame and determine how the content will flow.*

| Domain | Contribution to Narrative Design |
|--------|----------------------------------|
| User Intelligence | Preferred narrative frame (thesis-first, data-first, story-led) |
| Artifact Intelligence | Proven narrative frame for this artifact type |
| Relationship Intelligence | Recipient's preferred argument structure |
| Project Intelligence | The story the project tells at this stage |

**Output:** Narrative frame, argument structure, evidence strategy, opening hook, closing approach.

---

### Stage 7: Personalization

*Purpose: Ensure every element of the artifact reflects the specific user and context — not a generic version.*

Personalization is not a finishing pass — it is the continuous application of intelligence throughout generation. The markers of successful personalization:

| Personalization Marker | Intelligence Source |
|-----------------------|---------------------|
| Vocabulary feels native to the user | User Intelligence (vocabulary model) |
| Depth matches user's expertise level | User Intelligence (expertise domain) |
| Structure matches user's known preferences | Artifact Intelligence (user-calibrated) |
| Content reflects current project reality | Project Intelligence |
| Tone calibrated to recipient | Relationship Intelligence |
| Vocabulary consistent with organization | Workspace Intelligence |

---

### Stage 8: Quality Evaluation

*Purpose: Before delivery, evaluate the generated artifact against intelligence-derived quality criteria.*

| Quality Dimension | Evaluated Against |
|------------------|-------------------|
| Structural accuracy | Artifact Intelligence (pattern match) |
| Contextual relevance | Project Intelligence (current state alignment) |
| Voice authenticity | User Intelligence (style match) |
| Audience calibration | Relationship Intelligence (recipient fit) |
| Organizational compliance | Workspace Intelligence (standards adherence) |
| Goal alignment | User + Project Intelligence (purpose match) |

**Output:** A quality score across dimensions with flags for any dimension below threshold. Low-scoring dimensions trigger targeted revision before delivery.

---

## H.3 — Full Intelligence Consumption Path (Summary)

```
STORED INTELLIGENCE → ARTIFACT GENERATION

  Raw Learnings (Taxonomy)
        │
        ▼
  ┌─────────────────────────┐
  │ Domain Stores           │ ←── User / Project / Artifact /
  │ (Structured, Validated) │     Relationship / Workspace
  └──────────┬──────────────┘
             │
             ▼
  ┌─────────────────────────┐
  │ Context Assembly        │ ←── All relevant domains loaded
  └──────────┬──────────────┘
             │
             ▼
  ┌─────────────────────────┐
  │ Prompt Construction     │ ←── Intelligence → Specification
  └──────────┬──────────────┘
             │
             ▼
  ┌─────────────────────────┐
  │ Planning + Blueprint    │ ←── Purpose + Structure
  └──────────┬──────────────┘
             │
             ▼
  ┌─────────────────────────┐
  │ Generation with         │ ←── Personalization throughout
  │ Personalization         │
  └──────────┬──────────────┘
             │
             ▼
  ┌─────────────────────────┐
  │ Quality Evaluation      │ ←── Intelligence-derived criteria
  └──────────┬──────────────┘
             │
             ▼
  ARTIFACT DELIVERED
        │
        ▼
  Feedback Captured → Intelligence Updated → Next Artifact Better
```

---

# Section I — Intelligence Conflict Resolution

## I.1 — Why Conflicts Are Inevitable

Conflicts between intelligence domains are not edge cases. They are structural features of a system that models multiple layers of context simultaneously. A user who prefers brevity operating within a workspace that requires comprehensive documentation, generating an artifact for a board that wants detailed financials — this is not an unusual case. It is a typical professional situation.

The resolution framework must be explicit, consistent, and predictable.

---

## I.2 — Precedence Hierarchy

```
CONFLICT PRECEDENCE HIERARCHY
(Higher = greater authority in conflict)

  ┌─────────────────────────────────────────────────────────┐
  │ LEVEL 5: EXPLICIT USER OVERRIDE (In-Session)            │
  │ "Make this shorter than usual"                          │
  │ "Write this formally even though we usually don't"      │
  │ Highest authority — always honored immediately          │
  └────────────────────────────────────────────────────────┘
                          ▲ wins over
  ┌─────────────────────────────────────────────────────────┐
  │ LEVEL 4: CONFIRMED RECIPIENT REQUIREMENT                │
  │ Specific named relationship intelligence                │
  │ e.g., "This board requires detailed financial tables"   │
  │ Overrides user style for recipient-facing artifacts     │
  └────────────────────────────────────────────────────────┘
                          ▲ wins over
  ┌─────────────────────────────────────────────────────────┐
  │ LEVEL 3: PROJECT SCOPE REQUIREMENT                      │
  │ e.g., "This engagement requires comprehensive docs"     │
  │ Overrides general user preferences for artifacts        │
  │ within this project's scope                             │
  └────────────────────────────────────────────────────────┘
                          ▲ wins over
  ┌─────────────────────────────────────────────────────────┐
  │ LEVEL 2: WORKSPACE STANDARD                             │
  │ Organizational requirements for all workspace users     │
  │ e.g., legal disclaimers, brand compliance               │
  └────────────────────────────────────────────────────────┘
                          ▲ wins over
  ┌─────────────────────────────────────────────────────────┐
  │ LEVEL 1: USER GENERAL PREFERENCE                        │
  │ Long-term learned style, format, and depth preferences  │
  │ Default when no higher-level conflict exists            │
  └────────────────────────────────────────────────────────┘
```

---

## I.3 — Formal Conflict Resolution Rules

### Rule 1: The Scope Rule
*The most specific intelligence to the current task wins within its scope.*

A project-specific vocabulary overrides the user's general vocabulary — but only within artifacts generated for that project. The user's general vocabulary remains unchanged.

### Rule 2: The Recipient Rule
*When the artifact leaves the user's hands, the recipient's needs govern format and structure.*

The user's style governs voice and language. The recipient's intelligence governs structure, depth, and emphasis. These are not in conflict — they operate at different levels.

### Rule 3: The Additive Rule
*Where possible, conflicts should be resolved additively rather than by substitution.*

Example: User prefers concise outputs; project requires detailed documentation.  
**Wrong resolution:** Generate detailed documentation ignoring user preference.  
**Right resolution:** Generate comprehensive documentation written with the economy and precision of the user's concise style. The document is complete; every sentence earns its place.

### Rule 4: The Transparency Rule
*When a conflict requires a significant departure from user preference, surface it.*

"This board update follows a more detailed structure than your usual style because your board relationship profile indicates they require comprehensive financial disclosure. I've maintained your executive prose style throughout."

This keeps the user informed and enables override if desired.

### Rule 5: The Immutability Rule
*Workspace-level compliance requirements (legal, regulatory, brand) cannot be overridden by user preference or project scope.*

These are non-negotiable constraints. They are applied after all other intelligence — they are the final pass before delivery, not a preference in competition.

---

## I.4 — Resolution Decision Table

| Conflict Type | Rule Applied | Resolution |
|--------------|--------------|-----------|
| User prefers concise / Project requires detail | Additive Rule | Complete but economically written |
| User tone informal / Workspace requires formal | Scope Rule (Workspace wins for external) | Formal register applied; user vocabulary retained |
| User depth shallow / Recipient needs deep | Recipient Rule | Full depth; user's accessible writing style |
| User structure preferred / Artifact type has different canonical | Additive Rule | Canonical structure with user's structural preferences within sections |
| User requests override / All other signals | Explicit Override | Honored immediately; note the departure |
| Workspace compliance requirement conflicts with anything | Immutability Rule | Compliance applied without exception |

---

## I.5 — Escalation Rules

When a conflict cannot be resolved automatically without unacceptable trade-offs:

1. BrandOS generates with the most defensible resolution applied
2. Surfaces the conflict explicitly to the user
3. Presents the trade-off clearly
4. Offers alternatives
5. Waits for user direction before finalizing

This prevents BrandOS from silently making significant decisions that the user would want to make themselves.

---

# Section J — Intelligence Lifecycle

## J.1 — Lifecycle Stages (All Domains)

Every piece of intelligence in BrandOS passes through a defined lifecycle:

```
INTELLIGENCE LIFECYCLE

  CREATION ──▶ VALIDATION ──▶ GROWTH ──▶ REINFORCEMENT
                                                │
                                                ▼
                           ARCHIVAL ◀── DECAY ◀── ACTIVE

  (Archived intelligence is accessible but not actively consumed
   in artifact generation without explicit retrieval)
```

---

## J.2 — Lifecycle by Domain

### User Intelligence Lifecycle

| Stage | Trigger | Action |
|-------|---------|--------|
| **Creation** | First session, onboarding, first upload | Initialize user model with Phase 1 core learnings |
| **Validation** | Second and third corroborating signals | Escalate from Provisional Hypothesis to Confirmed Learning |
| **Growth** | Continuous artifact interaction, upload events, conversation patterns | Add depth and nuance to existing model dimensions |
| **Reinforcement** | User accepts artifacts without edit; explicit positive signals | Increase confidence scores on contributing parameters |
| **Decay** | Time without corroborating signals; context shift signals; major career events | Reduce confidence; flag for re-validation |
| **Archival** | User explicitly overrides a long-held preference; career/role change confirmed | Archive superseded model; retain for reference |
| **Retirement** | Data that no longer reflects the user at any confidence level | Remove from active model; accessible only via explicit retrieval |

**Special case — Permanent categories:** Professional identity core, operating principles, and knowledge assets are not subject to standard decay. They require explicit user action or strong contradictory evidence to modify.

---

### Project Intelligence Lifecycle

| Stage | Trigger | Action |
|-------|---------|--------|
| **Creation** | User creates project or first artifact explicitly linked to a project | Initialize project model |
| **Validation** | Second and third confirming signals about project context | Escalate project parameters to Confirmed |
| **Growth** | Each artifact generated for the project; each user description update | Enrich project model with new context and assets |
| **Reinforcement** | Successful artifacts within the project | Reinforce project vocabulary, audience calibrations |
| **Decay** | Project enters Winding Down phase; no new artifacts for >60 days | Begin confidence decay on dynamic parameters |
| **Archival** | Project marked complete; user confirms closure | Transfer transferable learnings to User domain; archive project model |
| **Retirement** | Archived project with no queries in >18 months | Move to cold storage; not actively loaded into context |

---

### Artifact Intelligence Lifecycle

| Stage | Trigger | Action |
|-------|---------|--------|
| **Creation** | First artifact of a type generated for a user | Initialize pattern model from universal baseline (Layer 1) |
| **Validation** | Second accepted artifact of same type | Begin user-specific pattern formation |
| **Growth** | Each artifact generation event of this type | Refine and deepen pattern model |
| **Reinforcement** | Accepted without edit; deployed artifacts | Strong reinforcement of current pattern |
| **Decay** | User's editing patterns shift; new structural preferences emerge | Detect drift; begin updating pattern model |
| **Archival** | Old pattern model superseded by new confirmed pattern | Archive; retain for reference and potential rollback |
| **Retirement** | Artifact type no longer generated by user | Remove from active loading; retain in archive |

---

### Relationship Intelligence Lifecycle

| Stage | Trigger | Action |
|-------|---------|--------|
| **Creation** | First mention of a named audience or relationship | Initialize relationship profile |
| **Validation** | Second description or artifact outcome confirming profile | Escalate to Confirmed profile |
| **Growth** | Each artifact sent to this relationship; each user description update | Enrich profile with new detail |
| **Reinforcement** | Positive outcomes from artifacts calibrated to this relationship | Reinforce calibration model |
| **Decay** | No contact with relationship for >90 days | Flag currency of profile; confidence reduces |
| **Archival** | Relationship ends or changes fundamentally | Archive prior profile; create new profile for new relationship state |

---

### Workspace Intelligence Lifecycle

Workspace Intelligence is the most stable domain. It changes infrequently and deliberately.

| Stage | Trigger | Action |
|-------|---------|--------|
| **Creation** | Workspace initialized; first admin configuration | Establish organizational standards, vocabulary, assets |
| **Validation** | Admin confirmation; used in artifact without correction | Confirm as active workspace standard |
| **Growth** | New shared assets added; vocabulary updated; new frameworks adopted | Append to workspace model |
| **Reinforcement** | Artifacts compliant with workspace standards are deployed | Reinforce current standards |
| **Decay** | Standard is inconsistently applied; user overrides frequently | Flag for admin review |
| **Archival** | Standard officially updated or replaced | Archive prior standard; deploy new standard |

---

## J.3 — How Intelligence Evolves Over Years

```
INTELLIGENCE MATURATION CURVE

Year 0-3 months: CALIBRATION PHASE
  • Rapid learning; high hypothesis rate
  • Wide confidence bands
  • Frequent updates per session
  • Artifact quality: Meaningfully better than generic

Month 3-12: STABILIZATION PHASE
  • Core model confirmed across dimensions
  • Slow growth with refinement
  • Narrowing confidence intervals
  • Artifact quality: Significantly personalized

Year 1-3: COMPOUNDING PHASE
  • Stable core model; nuanced refinement only
  • Project and relationship models deeply developed
  • Artifact quality: Genuine ghost-writing quality
  • System anticipates needs before explicit request

Year 3+: INSTITUTIONAL PHASE
  • BrandOS has modeled the user more comprehensively
    than any individual tool or colleague
  • Artifact quality: Indistinguishable from the user's
    own best work
  • Intelligence is a genuine strategic asset
```

---

# Section K — Minimum GTM Intelligence Model

## K.1 — The GTM Design Constraint

BrandOS must ship. The question is not "what is the ideal architecture?" The question is "what is the smallest architecture that creates a meaningful and defensible quality advantage over any alternative?"

The answer must satisfy three criteria simultaneously:
1. Dramatically better artifact quality than anything a user can get without it
2. Sufficient to demonstrate the compounding value proposition
3. Architecturally clean enough to extend without rework

---

## K.2 — Domain Classification for GTM

| Domain | GTM Status | Rationale |
|--------|-----------|-----------|
| **User Intelligence** | Mandatory — P1 | Without it, nothing is personalized |
| **Project Intelligence** | Mandatory — P1 | Without it, nothing is contextually relevant |
| **Artifact Intelligence** | Mandatory — P1 | Without it, structures are generic |
| **Relationship Intelligence** | High — P2 | Significant quality lift for external artifacts; deferrable at launch |
| **Workspace Intelligence** | Team/Enterprise — P2+ | Not required for individual user GTM; required for team launch |

---

## K.3 — Mandatory Domains: Minimum Viable Intelligence

### User Intelligence — GTM Minimum

The minimum viable User Intelligence model that creates a defensible quality advantage:

| Learning | Tier | Why Mandatory |
|---------|------|---------------|
| Professional Identity + Primary Archetype | Core | Misidentify this and every output is misaligned |
| Communication & Writing Style | Core | Style mismatch is the most common rejection reason |
| Primary Current Goal (1-3) | Core | Without goals, relevance is impossible |
| Domain Expertise Level | Core | Depth miscalibration degrades every artifact |
| Primary Audience Profile | Core | No artifact exists without an intended reader |
| Knowledge Assets (first upload) | Core | Unlocks authenticity and proprietary content |

Everything else in User Intelligence is Phase 2 enrichment.

### Project Intelligence — GTM Minimum

| Learning | Tier | Why Mandatory |
|---------|------|---------------|
| Project Type and Name | Core | Context layer for all artifacts |
| Primary Project Goal | Core | Relevance anchor |
| Current Project Stage | Core | Stage-appropriate output calibration |
| Project-Specific Vocabulary | Core | Authenticity signal |
| Key Stakeholders (top 2-3) | Core | Audience calibration |
| Uploaded Project Assets | Core | Proprietary content grounding |

### Artifact Intelligence — GTM Minimum

For GTM, Artifact Intelligence must cover the 5-7 artifact types that will be most commonly requested at launch. For each type, the minimum viable pattern model:

- Canonical section list (Phase 1)
- Default depth calibration (Phase 1)
- Length baseline (Phase 1)
- Narrative frame options (Phase 1)
- Structural exemplars from accepted artifacts (accumulates with use)

---

## K.4 — Optional Domains at GTM

| Domain | Recommendation |
|--------|---------------|
| **Relationship Intelligence** | Launch with Audience Intelligence (User domain) as substitute; migrate to full Relationship Intelligence in P2 when named relationship profiles become feasible |
| **Workspace Intelligence** | Launch with single-user workspace only; team workspace in P2 |

---

## K.5 — Deferred Domains

| Intelligence | Why Deferred | When to Activate |
|-------------|-------------|-----------------|
| Cross-user aggregated Artifact Intelligence | Requires sufficient user base to be meaningful | Scale milestone (>10K active users) |
| Multi-archetype user modeling | Complexity without proportionate early-stage value | Phase 2 |
| Temporal / behavioral patterns | Requires >30 days of behavioral data | Phase 2, 90 days post-launch |
| Full Relationship Intelligence (named profiles) | Requires interaction history to be useful | Phase 2 |
| Emotional register calibration | Subtle; requires significant sample | Phase 2 |
| Workspace multi-user intelligence | Requires team product | Team product launch |

---

## K.6 — GTM Quality Expectation

With the mandatory P1 architecture active, BrandOS should deliver:

| Artifact Quality Dimension | Expected GTM Lift |
|---------------------------|------------------|
| Relevance to user goals | +70% vs. generic generation |
| Voice and style match | +60% acceptance rate vs. default |
| Context accuracy | +80% project-grounded accuracy |
| Structure quality | +45% vs. uncalibrated templates |
| Overall: Artifacts requiring major revision | Reduced from ~80% to ~20% |

---

# Section L — Final Recommendation

## L.1 — The Board-Level Answer

> *"If BrandOS could only build 20% of the intelligence architecture initially, which 20% would create 80% of the artifact quality improvement?"*

The answer is precise and non-negotiable.

---

## L.2 — The Critical 20%

```
THE INTELLIGENCE FOUNDATION THAT CREATES 80% OF ARTIFACT QUALITY

┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. USER VOICE MODEL                                            │
│     Writing style + vocabulary + expertise level                │
│     Acquired from: 2-3 writing samples at onboarding           │
│     Expected impact: Eliminates style mismatch completely       │
│                                                                 │
│  2. USER GOAL MODEL                                             │
│     Current primary goals (1-3) + project context              │
│     Acquired from: Onboarding question + first project setup    │
│     Expected impact: Eliminates relevance failures              │
│                                                                 │
│  3. ARTIFACT STRUCTURE INTELLIGENCE                             │
│     Canonical pattern models for top 7 artifact types          │
│     Acquired from: Pre-built at launch + first acceptance cycle │
│     Expected impact: Eliminates structural guesswork             │
│                                                                 │
│  4. PROJECT CONTEXT LAYER                                       │
│     Project vocabulary + goals + stage + assets                 │
│     Acquired from: First project setup + asset uploads          │
│     Expected impact: Transforms output from generic to specific  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

These four together represent less than 20% of the full intelligence architecture by volume. They represent approximately 80% of the user-perceived quality gap between BrandOS and any alternative.

---

## L.3 — The Priority Argument

The remaining 80% of the architecture — Relationship Intelligence, full Workspace Intelligence, cross-user aggregated patterns, temporal models, emotional register calibration — generates real incremental value. But it generates incremental value on top of an already dramatically differentiated product.

**The strategic error to avoid:** Building the sophisticated 80% of the architecture before the foundational 20% is complete. An emotionally calibrated output that misunderstands the user's goals is not better. It is more impressively wrong.

**The strategic imperative:** Ship the foundational 20% first. Ship it well. Let it compound. Then extend.

---

## L.4 — The Compounding Argument

The intelligence architecture is not valuable because of what it knows at launch. It is valuable because of what it learns over time.

```
COMPOUNDING INTELLIGENCE VALUE

  Session 1: Knows voice + goals + project context
             → Dramatically better than generic
  
  Month 3:   Knows voice + goals + project + artifact patterns
             → Artifacts require minimal revision
  
  Year 1:    Full User Intelligence + Project history +
             Artifact pattern library + Audience profiles
             → Ghost-writing quality output
  
  Year 3:    All of the above + relationship intelligence +
             cross-project pattern recognition +
             anticipatory artifact generation
             → The user's professional intelligence partner
```

The architecture is not a feature. It is a flywheel. Each interaction makes the next one better. The only question is: **where does the flywheel start?**

It starts with voice, goals, structure, and context.

---

## L.5 — Governing Design Principles for the Architecture

These five principles should govern every subsequent architectural decision:

| Principle | Implication |
|-----------|-------------|
| **Intelligence, not information** | Every stored item must be validated and actionable — not merely stored. The filing cabinet is not the model. |
| **Specificity compounds** | Generic intelligence adds noise. Specific, confident intelligence compounds. Every architecture decision should optimize for specificity over coverage. |
| **The artifact is the output** | All intelligence exists to serve artifact generation. Evaluate every domain, every learning, and every conflict resolution rule through this lens. |
| **Conflict resolution must be transparent** | When intelligence domains conflict, users must understand why a departure from their preference occurred. Opacity erodes trust. |
| **The first artifact sets the expectation** | The quality of the first artifact a user receives defines their baseline expectation of BrandOS. The GTM architecture must make the first artifact excellent, not merely good. |

---

## L.6 — Final Architecture Summary

```
BRANDOS INTELLIGENCE OPERATING MODEL

┌──────────────────────────────────────────────────────────────┐
│                     WORKSPACE LAYER                          │
│   Standards · Brand Voice · Shared Assets · Compliance       │
└────────────────────────────┬─────────────────────────────────┘
                             │ context
┌────────────────────────────▼─────────────────────────────────┐
│  USER INTELLIGENCE         │  PROJECT INTELLIGENCE            │
│  Voice · Goals · Identity  │  Context · Vocabulary · Assets  │
│  Frameworks · Expertise    │  Stakeholders · Stage · Goals    │
└──────────────┬─────────────┴──────────────────┬──────────────┘
               │ calibrates                      │ grounds
┌──────────────▼─────────────────────────────────▼──────────────┐
│                  ARTIFACT INTELLIGENCE                         │
│     Structure Patterns · Exemplars · Narrative Models          │
│     User-Calibrated Templates · Rejection Patterns            │
└──────────────────────────────┬────────────────────────────────┘
                               │ enriched by
┌──────────────────────────────▼────────────────────────────────┐
│                 RELATIONSHIP INTELLIGENCE                      │
│   Audience Profiles · Recipient Preferences · History         │
└──────────────────────────────┬────────────────────────────────┘
                               │ produces
                    ┌──────────▼──────────┐
                    │  ARTIFACT GENERATED  │
                    │  with compounding    │
                    │  intelligence        │
                    └──────────┬──────────┘
                               │ feedback
                    ┌──────────▼──────────┐
                    │  ALL DOMAINS        │
                    │  UPDATED            │
                    │  → Next artifact    │
                    │    is better        │
                    └─────────────────────┘
```

This is the intelligence operating model for BrandOS.

Its purpose is not to remember. Its purpose is to generate — and to generate increasingly well, for increasingly long.

---

*BrandOS Intelligence Architecture · Confidential · Board-Level Design Document*  
*Architecture Layer above: BrandOS Brand Intelligence Learning Framework*
