# BrandOS — Brand Intelligence Learning Framework

> **Historical specification document.** The 25-category learning taxonomy this system is built on. The taxonomy category values in `src/types/entities.ts` (`TaxonomyCategory`) are derived directly from §C of this document. §H (the exclusion framework) is the authoritative source for *why* the quarantine gate in `SignalExtractor.shouldQuarantine()` exists and what it must exclude. Treat this as load-bearing background for those two areas; all other current behaviour is described in `INTELLIGENCEOS_BOOTSTRAP.md`.

**Board-Level Design Document**
Lead Intelligence Architect | Confidential
Version 1.0

---

## Executive Summary

BrandOS is an AI-native operating system built to generate increasingly personalized, high-quality artifacts by developing a persistent, compounding model of each user. This document defines the complete intelligence acquisition strategy: what to learn, how to learn it, how to validate it, and how to prioritize it.

The framework is archetype-agnostic by design. It applies equally across 17+ professional archetypes — from Founders to Professors to Freelancers — identifying the universal intelligence model that underlies all of them while allowing for archetype-specific enrichment over time.

---

## Table of Contents

- [Section A — Complete Learning Taxonomy](#section-a--complete-learning-taxonomy)
- [Section B — User Archetype Intelligence](#section-b--user-archetype-intelligence)
- [Section C — Artifact Learning Framework](#section-c--artifact-learning-framework)
- [Section D — Prompt and Conversation Learning](#section-d--prompt-and-conversation-learning)
- [Section E — Generated Artifact Learning](#section-e--generated-artifact-learning)
- [Section F — Feedback and Decision Learning](#section-f--feedback-and-decision-learning)
- [Section G — Intelligence Value Hierarchy](#section-g--intelligence-value-hierarchy)
- [Section H — Dangerous or Low-Value Learning](#section-h--dangerous-or-low-value-learning)
- [Section I — Minimum Phase-1 Intelligence Model](#section-i--minimum-phase-1-intelligence-model)
- [Closing Design Principles](#closing-design-principles)

---

## Section A — Complete Learning Taxonomy

BrandOS should learn across 25 distinct intelligence categories. Each category represents a compounding asset: the more it is enriched, the greater its impact on artifact quality and personalization. Categories are ordered by expected impact priority.

| Category | Why It Matters | Example Extraction | Conf. Scoring | Stability | Validation | Artifact Impact |
|---|---|---|---|---|---|---|
| Professional Identity | Defines who the user is in their field. Shapes tone, vocabulary, and framing of every artifact. | Title, company, sector, career stage extracted from uploads and bios | High if verified via resume/profile; medium from prompts alone | **Permanent** | Cross-reference against multiple sources; re-validate on major uploads | Critical — wrong identity misaligns every output |
| Expertise Domains | Drives depth calibration. An expert requires no basics; a novice needs scaffolding. | "I'm a cardiologist" signals medical domain; code uploads signal engineering | High from certifications/publications; medium from self-claims | **Long-Term** | Triangulate across uploaded artifacts and conversation depth | Very high — controls depth, terminology, assumed knowledge |
| Skills Inventory | Granular capability map enabling relevant recommendations and gap identification. | Skills sections in resumes, tool mentions in code, methods cited in papers | High from demonstrated usage; low from self-reports alone | **Long-Term** | Observe demonstrated use in generated content and edits | High — prevents redundant suggestions; enables skill bridging |
| Communication Style | Determines the register, tone, and formality of every generated artifact. | Formal emails vs casual Slack messages; academic vs narrative prose | High after 10+ diverse samples | **Medium-Term** | Periodic style-drift detection; explicit style preference feedback | Very high — style mismatch is the #1 rejection reason |
| Writing Style | Captures idiosyncratic patterns: sentence rhythm, vocabulary preferences, structure habits. | Preferred paragraph length, use of Oxford comma, active vs passive voice | High after sufficient sample size | **Long-Term** | Automated stylometric scoring against generated artifacts | Very high — defines authenticity of ghost-written content |
| Strategic Thinking Patterns | Identifies how users reason: top-down/bottom-up, frameworks vs intuition, data vs narrative. | Framework-heavy strategy docs; narrative-led pitches; data-first analyses | Medium from few samples; high after repeated exposure | **Long-Term** | Compare structural preferences across multiple strategy artifacts | High — enables anticipation of preferred output architecture |
| Decision-Making Style | Maps risk tolerance, decisiveness, criteria weighting — shapes recommendations. | Rapid iteration vs deliberate planning; consensus-seeking vs autocratic language | Medium — inferred, rarely stated | **Long-Term** | Behavioral observation across decisions in conversations | High — decision support outputs calibrated to actual style |
| Goals & Objectives | Current and medium-term targets that define relevance for artifact generation. | "We need to close $2M ARR this year" — explicit goal extraction | High if stated; medium if inferred from context | **Medium-Term** | Re-confirm goals every 90 days or on context shift | Very high — irrelevant artifacts score zero regardless of quality |
| Constraints & Boundaries | What the user cannot do, will not do, or is limited by. Prevents out-of-bounds suggestions. | Budget limits, regulatory environments, team size, technology restrictions | High if stated; medium if inferred | **Medium-Term** | Explicit confirmation; re-validate when context changes | High — prevents recommendation of inapplicable solutions |
| Operating Principles | The values and non-negotiables that guide the user's professional behavior. | "We never compromise on privacy", "We are a remote-first team" | High from repeated emphatic statements | **Permanent** | Track consistency across conversations and decisions | High — aligns generated content with stated values |
| Knowledge Assets | Proprietary frameworks, models, IP, and institutional knowledge the user possesses. | Uploaded playbooks, proprietary diagrams, named methodologies | High from explicit uploads | **Permanent** | Track modification and reuse patterns | Critical — enables artifact generation that extends user's own IP |
| Intellectual Frameworks | Lenses and mental models the user applies: first principles, OODA loop, jobs-to-be-done, etc. | Repeated use of specific framework language across multiple conversations | Medium — requires pattern over time | **Long-Term** | Frequency and consistency tracking | High — outputs scaffolded to familiar frameworks land better |
| Stakeholder Map | Who the user serves, reports to, collaborates with, and competes against. | Mentions of investors, board, direct reports, clients, regulators | Medium from conversations; high from org charts / bios | **Medium-Term** | Re-validate quarterly or on role change | High — audience calibration for every external artifact |
| Audience Intelligence | Profiles of each audience the user creates content for: knowledge level, expectations, culture. | "My board is non-technical" vs "My investors want deep metrics" | Medium initially; high after audience-specific feedback | **Medium-Term** | Explicit feedback on audience-calibrated drafts | Very high — audience mismatch is fatal for communication artifacts |
| Tool & Technology Preferences | Software stack, preferred tools, workflow systems the user relies on. | Mentions of Notion, Figma, Slack, specific coding languages, cloud platforms | High from repeated mentions and uploads | **Medium-Term** | Tool-specific prompt patterns; file type uploads | Medium — improves integration suggestions and workflow alignment |
| Model Preferences | Preferred AI models, prompting styles, and output format expectations. | Explicit model comparisons, format requests, structure preferences | High from direct feedback | **Medium-Term** | Track format acceptance/rejection rates | Very high — direct quality multiplier |
| Success Metrics | How the user defines and measures success in their work. | "We measure success by NPS", "Revenue per employee", "Citation count" | High if stated; medium if inferred from domain | **Medium-Term** | Re-confirm on goal resets | High — enables outcome-oriented artifact framing |
| Temporal Patterns | When the user works, how urgency is expressed, deadlines and time horizons they operate in. | Timestamps of activity, deadline language, sprint vs annual planning vocabulary | Medium from behavioral data | **Medium-Term** | Observe activity rhythm over 30+ day window | Medium — enables deadline-aware and urgency-calibrated outputs |
| Emotional Register | The emotional undertone of professional communication the user defaults to. | Energetic optimism vs cautious pragmatism; inspirational vs analytical | Medium — inferred from writing samples | **Long-Term** | Drift detection across extended samples | Medium — tone alignment increases subjective quality scores |
| Learning & Curiosity Patterns | What the user seeks to learn, how they prefer to receive new information. | Questions asked, topics explored, tutorials requested, depth of exploration | Medium from behavioral patterns | **Long-Term** | Track inquiry type and follow-up depth | Medium — enables proactive knowledge scaffolding |
| Collaboration & Leadership Style | How the user works with others: directive, collaborative, facilitative, autonomous. | Mentions of team dynamics, delegation language, meeting facilitation patterns | Medium from indirect signals | **Long-Term** | Behavioral observation across team-related conversations | Medium — aligns artifact tone to leadership context |
| Cultural & Linguistic Context | Professional culture, language preferences, regional business norms the user operates within. | Vocabulary choices, formality norms, geographic market references | High from writing samples | **Permanent** | Triangulate against domain and geography | High — prevents cultural mismatch in external communications |
| Domain-Specific Vocabulary | Jargon, terminology, and specialized language the user uses and expects. | Field-specific acronyms, technical terms, proprietary naming conventions | High from writing samples and uploads | **Long-Term** | Track new terminology introductions | Very high — vocabulary alignment signals expertise and builds trust |
| Competitive Intelligence | The competitive landscape the user operates in, including rivals, alternatives, differentiators. | Mentions of competitors, market comparisons, differentiation claims | Medium — partial, fragmented | **Medium-Term** | Re-validate against market updates | High — sharpens strategic artifact relevance |
| Personal Brand Signal | The public-facing professional identity the user wants to project. | LinkedIn tone, thought leadership content, speaking topic patterns | High from profile and published content uploads | **Long-Term** | Cross-reference across public artifacts | High — ensures generated content reinforces desired brand |

---

## Section B — User Archetype Intelligence

BrandOS must identify and continuously refine its model of who the user is professionally. Archetypes are not static labels — they are working hypotheses that evolve as evidence accumulates. The system must support users who belong to multiple archetypes simultaneously.

### B.1 — Archetype Definitions

| Archetype | Key Signals | Typical Goals | Typical Artifacts | Conf. Indicators | Top Intelligence Categories |
|---|---|---|---|---|---|
| Founder | Product ownership language, startup terminology, fundraising vocabulary, equity/cap table references, investor updates | Build and scale a company, raise capital, recruit, achieve product-market fit | Pitch decks, executive summaries, investor memos, product roadmaps, GTM strategies | Consistent co-founder/CEO framing; funding stage mentions; equity references | Professional Identity, Goals, Stakeholder Map, Strategic Patterns, Knowledge Assets |
| CEO / Executive | Board/C-suite vocabulary, org-wide decision-making, operating metrics, stakeholder management language | Drive organizational performance, lead strategy, manage stakeholders, set culture | Board decks, OKRs, operating reviews, communications strategy, executive summaries | Consistent org-level framing; board/investor references; performance metric focus | Stakeholder Map, Success Metrics, Communication Style, Decision-Making Style |
| Product Leader | Roadmap language, user story vocabulary, prioritization frameworks, PM tool mentions | Define product vision, prioritize roadmap, align cross-functional teams | PRDs, roadmaps, user stories, competitive analyses, launch briefs | PM framework usage; roadmap requests; user research references | Strategic Patterns, Audience Intelligence, Goals, Frameworks |
| Engineering Leader | Technical architecture vocabulary, team scaling, system design language, delivery metrics | Deliver reliable systems, scale engineering teams, manage technical debt | Architecture docs, technical specs, engineering OKRs, system design docs | Architecture vocabulary; team structure references; delivery metric focus | Skills Inventory, Tool Preferences, Technical Domain Knowledge, Decision Style |
| Architect | System design patterns, scalability vocabulary, technology trade-off language, integration terminology | Design robust, scalable systems; evaluate technology choices; establish technical standards | Architecture diagrams, ADRs, technical specs, evaluation matrices | Deep technical vocabulary; comparative analysis requests; pattern references | Skills Inventory, Domain Knowledge, Tool Preferences, Frameworks |
| Consultant | Client-facing vocabulary, deliverable-oriented language, methodology references, billable framing | Deliver client value, develop IP, grow practice, manage engagement scope | Strategy decks, recommendations memos, project plans, frameworks, case studies | Client/engagement language; methodology references; deliverable framing | Audience Intelligence, Frameworks, Communication Style, Knowledge Assets |
| Researcher / Scientist | Citation vocabulary, hypothesis framing, methodology language, publication references, grant terminology | Advance knowledge, publish findings, secure funding, collaborate with peers | Research papers, literature reviews, grant proposals, experimental protocols, posters | Citation behavior; hypothesis language; methodology rigor focus | Expertise Domains, Domain Vocabulary, Knowledge Assets, Writing Style |
| Professor / Educator | Pedagogical vocabulary, curriculum language, student-facing framing, academic publication patterns | Educate students, conduct research, publish, engage the academic community | Syllabi, lectures, course materials, academic papers, textbooks, presentations | Academic vocabulary; student references; semester/course framing | Communication Style, Audience Intelligence, Domain Knowledge, Writing Style |
| Student | Assignment language, learning vocabulary, course references, grade/GPA mentions, deadline urgency | Learn, complete coursework, develop career prospects, build professional identity | Essays, research papers, resumes, cover letters, study guides, presentations | Academic framing; course/professor references; learning-oriented questions | Goals, Constraints, Expertise Domains (emerging), Writing Style |
| Job Seeker | Resume language, job search vocabulary, interview preparation requests, application framing | Land a role, showcase skills, negotiate offers, career transition | Resumes, cover letters, LinkedIn profiles, interview prep docs, portfolios | Resume uploads; job description references; salary/offer language | Professional Identity, Skills Inventory, Personal Brand, Goals |
| Writer / Creator | Narrative vocabulary, creative process language, publishing references, audience-building focus | Create and publish content, build audience, develop creative IP, monetize | Articles, books, scripts, blog posts, newsletters, social content, portfolios | Creative writing uploads; narrative structure requests; publication focus | Writing Style, Audience Intelligence, Personal Brand, Knowledge Assets |
| Investor | Portfolio vocabulary, investment thesis language, due diligence references, returns/metrics framing | Source deals, evaluate opportunities, support portfolio companies, generate returns | Investment memos, due diligence reports, portfolio reviews, LP updates | Investment thesis language; portfolio company references; returns focus | Strategic Patterns, Domain Knowledge, Decision Style, Stakeholder Map |
| Coach / Advisor | Client development vocabulary, coaching methodology language, transformation framing | Develop clients, build practice, create frameworks, generate referrals | Frameworks, session guides, program curricula, testimonials, proposals | Client development language; coaching methodology references; transformation framing | Frameworks, Communication Style, Audience Intelligence, Knowledge Assets |
| Freelancer | Project-based vocabulary, client management language, scope/rate references, portfolio focus | Win clients, deliver projects, manage income, build reputation | Portfolios, proposals, contracts, project briefs, invoices, case studies | Project/client framing; rate/scope language; deliverable focus | Skills Inventory, Audience Intelligence, Personal Brand, Constraints |
| Agency Operator | Client roster vocabulary, team management language, service line references, utilization framing | Grow client base, manage delivery, scale team, improve margins | Proposals, case studies, service decks, SOWs, reporting templates | Client roster language; team utilization focus; service line references | Stakeholder Map, Goals, Communication Style, Knowledge Assets |
| Enterprise Team Member | Corporate vocabulary, process/compliance language, cross-functional framing, internal stakeholder focus | Execute within organizational constraints, collaborate cross-functionally, advance career | Internal memos, project updates, presentations, process docs, reports | Corporate vocabulary; internal stakeholder references; process/compliance focus | Stakeholder Map, Constraints, Communication Style, Audience Intelligence |

### B.2 — Multi-Archetype, Evolution, and Universal Intelligence

#### Can users belong to multiple archetypes?

Yes. Multi-archetype membership is the norm, not the exception. A Founder is also typically a CEO, often a Product Leader, and sometimes an Investor. A Professor may be simultaneously a Researcher and a Consultant. BrandOS should model a primary archetype weighted by dominant signals and maintain secondary archetypes at lower confidence. The primary archetype drives default calibration; secondary archetypes inform edge-case enrichment.

#### How should archetypes evolve over time?

Archetype confidence should increase monotonically as consistent signals accumulate. A major career shift — indicated by signals such as a new resume upload, sustained change in vocabulary, new stakeholder references, or an explicit user statement — should trigger a re-evaluation event. The system should not resist archetype transitions; it should detect and adapt to them gracefully. Former archetype signals should be archived, not deleted, as they inform expertise history.

#### Which signals increase or decrease confidence?

| Signal Type | Direction | Magnitude |
|---|---|---|
| Consistent vocabulary across 10+ sessions | Increase | High |
| Uploaded artifact matching archetype | Increase | Very High |
| Explicit self-identification | Increase (provisional) | Medium (unverified) |
| Single isolated signal | Provisional hypothesis only | Very Low |
| Contradictory vocabulary pattern | Decrease or split | Medium |
| Major career change signals | Reset + re-evaluate | Very High |

#### Universal vs. Archetype-Specific Intelligence Categories

**Universal (All Archetypes)**

- Communication & Writing Style
- Goals & Objectives
- Professional Identity (basic)
- Constraints & Boundaries
- Operating Principles
- Domain Expertise Level
- Cultural & Linguistic Context
- Audience Intelligence (primary)

**Archetype-Specific**

- Competitive Intelligence (Investor, Founder, Consultant)
- Citation & Publication Patterns (Researcher, Professor)
- Portfolio & Client Roster (Freelancer, Agency)
- Investment Thesis (Investor)
- Coaching Methodology (Coach)
- Curriculum Design (Professor, Educator)
- Cap Table & Equity Framing (Founder, CEO)
- Technical Stack Depth (Engineer, Architect)

---

## Section C — Artifact Learning Framework

Uploaded artifacts are the highest-signal intelligence source available to BrandOS. Unlike prompt signals (which are fragmentary and context-dependent), artifacts represent intentional, structured work products that reveal professional identity, expertise, style, and methodology at high fidelity. BrandOS should treat every artifact upload as a high-value intelligence event.

| Artifact Type | What Can Be Learned | Confidence | Reliability | Longevity | Impact on Future Outputs |
|---|---|---|---|---|---|
| Resume | Professional Identity, career history, skills, tenure patterns, career trajectory, target roles, achievement framing style | High | Very High | Snapshot (dated) | Enables precise identity calibration, skill depth, achievement vocabulary |
| CV | Deep expertise, publication record, academic affiliations, research domains, methodological preferences, grant history | High | Very High | Long-Term | Expert-level domain calibration; academic writing style baseline |
| LinkedIn Profile | Public professional brand, endorsement patterns, professional network signals, thought leadership topics | High | High | Medium-Term | Brand alignment; audience calibration for public-facing content |
| Personal Website / Portfolio | Creative or professional IP, preferred presentation style, personal brand narrative, showcase priorities | High | High | Long-Term | Brand narrative; creative or professional voice calibration |
| Strategy Document | Strategic thinking patterns, frameworks used, time horizons, assumptions, risk framing, preferred structure | High | Very High | Long-Term | Enables strategy artifact co-creation at the user's depth and style |
| Business Plan | Business model preferences, financial framing, market understanding, opportunity narrative style | High | High | Medium-Term | Commercial artifact calibration; financial vocabulary; market framing |
| Research Paper | Domain expertise, citation style, hypothesis structure, methodology rigor, academic vocabulary, intellectual approach | High | Very High | Permanent | Deep domain knowledge extraction; academic writing style model |
| White Paper | Thought leadership positioning, argumentation style, evidence hierarchy, audience calibration | High | High | Long-Term | Professional authority framing; argumentation pattern model |
| Architecture Document | Technical depth, design philosophy, trade-off reasoning, preferred diagramming conventions, vocabulary | High | Very High | Long-Term | Technical artifact quality; system design vocabulary; pattern preferences |
| Source Code | Technology stack, coding conventions, problem-solving patterns, documentation style, abstraction preferences | High | Very High | Long-Term | Technical recommendation precision; stack-specific output generation |
| Product Requirements Document | Product thinking style, user-centricity, prioritization approach, acceptance criteria rigor | High | High | Medium-Term | PRD generation quality; product vocabulary calibration |
| Design Document | Visual communication preferences, information hierarchy intuitions, annotation style, audience assumptions | Medium | Medium | Medium-Term | Design brief generation; communication style for visual contexts |
| Meeting Notes | Decision-making patterns, stakeholder dynamics, action item style, discussion structure, recurring priorities | Medium | Medium | Temporary | Stakeholder map enrichment; decision context; recurring theme detection |
| Presentations | Communication hierarchy, visual storytelling preferences, slide structure habits, audience calibration signals | High | High | Long-Term | Presentation generation quality; structure and hierarchy calibration |
| Marketing Content | Brand voice, customer language, value proposition framing, persuasion style, customer vocabulary | High | High | Long-Term | Marketing artifact authenticity; brand voice calibration |
| Blog Posts | Public thought leadership voice, topic expertise, audience assumptions, narrative structure, opinion framing | High | High | Long-Term | Content artifact quality; public voice calibration; topic authority map |
| Books / Long-Form | Deep intellectual framework, sustained narrative voice, thematic priorities, argumentation style at scale | Very High | Very High | Permanent | Highest-quality voice model; enables long-form artifact generation at author depth |
| Technical Specifications | Precision vocabulary, completeness standards, assumption documentation, stakeholder calibration for technical audiences | High | Very High | Long-Term | Technical specification quality; precision calibration |
| Roadmaps | Time horizon preferences, planning granularity, dependency reasoning, prioritization criteria | High | High | Medium-Term | Roadmap generation; planning vocabulary; time horizon calibration |
| Project Plans | Operational planning style, risk anticipation, stakeholder communication patterns, milestone framing | Medium | High | Temporary | Operational artifact quality; planning vocabulary; risk framing |

### Additional Artifact Types

Beyond the core set, BrandOS should also support intelligence extraction from the following artifact types:

- **Email Archives** — communication style, stakeholder vocabulary, urgency calibration, relationship tone
- **Pitch Decks** — fundraising vocabulary, narrative structure, investor audience calibration, competitive framing
- **Case Studies** — achievement framing style, client communication patterns, outcome measurement vocabulary
- **Legal / Compliance Documents** — constraint identification, regulatory vocabulary, risk tolerance signals
- **Financial Models** — quantitative reasoning patterns, assumption documentation style, metric preferences
- **Grant Proposals** — funding vocabulary, impact framing, academic communication style calibration
- **Newsletters** — audience calibration, content cadence signals, thought leadership positioning
- **Social Content** — public persona signals, brevity preference, engagement style

---

## Section D — Prompt and Conversation Learning

Conversations are the continuous intelligence stream. Unlike static artifact uploads, conversations provide real-time signal updates that reflect the user's current context, goals, and constraints. BrandOS must distinguish between seven signal types — each with different storage, validation, and decay requirements.

### D.1 — Signal Type Taxonomy

| Signal Type | Definition | Storage | Decay |
|---|---|---|---|
| User Fact | Verifiable claim about the user's identity, history, or circumstances | Persistent (after validation) | Archived on contradiction |
| Confirmed Preference | Repeated or explicitly stated style/format/tone preference | Persistent | On explicit override only |
| Provisional Hypothesis | Single-signal inference requiring validation before storage | Temporary (90 days) | Discard if not confirmed |
| Goal / Intent | Current objective stated in conversation context | Medium-term (re-validate quarterly) | Decay on goal completion signal |
| Contextual Constraint | Limitation expressed for current task or project | Project-scoped | Discard on task completion |
| Temporary Request | One-off task instruction with no persistent signal value | Session-only | Discard immediately |
| Experiment / Exploration | User testing an idea, format, or approach — not a confirmed preference | Session-only | Discard unless pattern emerges |

### D.2 — Prompt Learning Examples

| Example Prompt | Potential Learnings | Confidence | Signal Type | Validation | Storage Rec. |
|---|---|---|---|---|---|
| *"Create a GTM strategy for my AI startup"* | Possible founder archetype; business ownership; strategic planning preference; AI domain familiarity | Medium | Hypothesis | Confirm via follow-up or artifact upload | Provisional hypothesis; upgrade to confirmed on resume/profile upload |
| *"Rewrite this for a non-technical board"* | Audience calibration preference; communication style signal; stakeholder map signal (board present) | High | Preference | Accept after consistent pattern across 3+ similar requests | Confirmed preference; store as audience calibration rule |
| *"Make it shorter and punchier"* | Conciseness preference; possibly executive communication context; anti-verbose style signal | High | Style Preference | Accept immediately; confirm after repeated pattern | Store as style preference; apply proactively to future drafts |
| *"Use the McKinsey MECE framework"* | Framework preference; consulting background signal; structured thinking style | Medium | Preference | Confirm via additional framework usage patterns | Store as framework preference; probe for additional frameworks |
| *"I have a PhD in molecular biology"* | Domain expertise; researcher/scientist archetype signal; academic writing style expected | High | User Fact | Verify against uploaded artifacts or publication history | High-confidence domain calibration after verification |
| *"My investors want to see the unit economics"* | Investor stakeholder present; financial framing required; business stage signal (funded startup) | High | Context Fact | Store with temporal tag; re-validate if context changes | Stakeholder map enrichment; financial vocabulary calibration |
| *"Can you write this like I would?"* | Voice replication request; high personalization mode trigger | N/A | Intent | Requires prior style model built from uploads | Triggers maximum personalization mode; requires sufficient voice model |
| *"Pretend you're a VC reviewing this pitch"* | Role-play request — temporary context, NOT a user fact | Low | Temporary Request | Do NOT store as user identity signal | Session-only; discard after task completion |
| *"What do you think about Web3?"* | Curiosity signal; may indicate Web3 interest or professional adjacent relevance | Low | Temporary Inquiry | Only store if followed by sustained engagement with topic | Provisional curiosity tag; escalate only on repeated engagement |
| *"My board is asking for a narrative-first approach"* | Stakeholder preference signal; communication style directive; board dynamics insight | High | Context Preference | Accept; store with stakeholder-specific tag | Audience calibration for board-facing artifacts |

---

## Section E — Generated Artifact Learning

Every artifact BrandOS generates is a controlled experiment. The user's response to that artifact — whether they accept, edit, reject, or extend it — is the most direct quality feedback signal available. BrandOS must monitor and learn from the delta between generated and accepted content.

### E.1 — Learnable Signals from Generated Artifacts

| Signal | What It Means | Action | Confidence |
|---|---|---|---|
| User edits executive summary consistently | Current executive summary model is miscalibrated | Extract delta; update style model | High after 3+ edits |
| User always shortens generated output | Length preference is shorter than current calibration | Reduce default length; confirm new baseline | High after 2+ consistent patterns |
| User deletes technical depth sections | Audience expertise level assumption is too high | Recalibrate expertise assumption downward | High after 2+ deletions |
| User always adds a framework section | Framework-oriented output is expected but not being generated | Add framework as default structural element | Very High |
| User rewrites conclusion every time | Conclusion framing model is wrong | Use user's rewritten conclusions as conclusion style model | High |
| User copies specific phrases verbatim | The copied phrase is exemplary output for that context | Archive phrase as style exemplar | Medium (single instance) |
| User accepts artifact without any edit | Current model is well-calibrated for this artifact type | Confirm and reinforce current model | High |
| User requests 3+ revisions on same artifact | Model gap — current understanding is insufficient for this context | Trigger model review; request explicit feedback | Very High |
| User applies artifact directly (deploys it) | Ultimate quality signal — artifact was deployment-ready | Archive as exemplar; reinforce all contributing model parameters | Very High |
| User rejects vocabulary or tone | Style or register model is wrong | Extract rejected vocabulary; update exclusion list | High after explicit rejection |
| User restructures artifact significantly | Structural thinking model is misaligned | Use restructured artifact as structural template | High |
| User ignores suggested next steps | Next-step framing is not resonating with user's workflow | Adjust proactive suggestion format | Medium after 3+ patterns |

### E.2 — Delta Learning Protocol

When a user edits a generated artifact, BrandOS should extract learnings across five dimensions:

- **Structural delta** — Did the user change the structure (sections, ordering, hierarchy)?
- **Length delta** — Did the user make the artifact significantly longer or shorter?
- **Vocabulary delta** — Did the user replace specific words or phrases with alternatives?
- **Tone delta** — Did the user shift the register (more formal, more casual, more authoritative)?
- **Substance delta** — Did the user add, remove, or change substantive content (facts, claims, data)?

Each delta type maps to a specific model dimension and should trigger targeted model updates rather than global recalibration.

---

## Section F — Feedback and Decision Learning

Feedback signals vary dramatically in their information value, reliability, and actionability. BrandOS must distinguish between high-signal and low-signal feedback, avoid over-indexing on noisy signals, and build a robust model from the most reliable evidence.

### F.1 — Feedback Signal Ranking

| Rank | Signal | Type | Confidence | Decay | Why Valuable |
|---|---|---|---|---|---|
| 1 | Explicit rejection with reason | Explicit | Very High | Permanent lesson | Most informative signal — specific, intentional, high cognitive effort from user |
| 2 | User rewrites a generated artifact | Implicit (edit) | Very High | Long-Term pattern | Delta between generated and edited content is a precise style/substance model |
| 3 | User accepts artifact without edit | Implicit | High | Confirms prior model | High-value validation signal — reduces hypothesis to confirmed preference |
| 4 | User applies artifact directly (uses it) | Implicit (behavioral) | Very High | Long-Term | Ultimate quality signal — artifact was good enough to deploy without modification |
| 5 | Explicit style preference stated | Explicit | High | Permanent | Direct, intentional — should be stored immediately as confirmed preference |
| 6 | User requests revision of same artifact 3+ times | Implicit (friction) | High | Pattern signal | Repeated revision is a model gap signal — current understanding is insufficient |
| 7 | User downgrades output quality rating | Explicit | High | Immediate action | Calibrated quality signal — requires model recalibration for that category |
| 8 | User copies a specific phrase or paragraph | Implicit (behavioral) | Medium | Style confirmation | Micro-level voice confirmation — the copied segment is exemplary output |
| 9 | User skips reading long sections | Implicit (behavioral) | Medium | Format signal | Length/density calibration signal — output is too long or too dense |
| 10 | User requests simpler language | Explicit | High | Immediate + Long-Term | Expertise miscalibration detected — current depth assumption is too high |
| 11 | User repeats a rejected structure | Implicit | Medium | Hypothesis only | Ambiguous — may indicate reconsideration rather than confusion; requires pattern |
| 12 | Session-end without artifact use | Implicit | Low | Temporary signal | Weak signal — may indicate task context rather than quality failure |

### F.2 — Feedback Learning Principles

| Principle | Description |
|---|---|
| **Explicit beats Implicit** | A stated preference always outranks an inferred one. When the user tells you directly, believe them over your behavioral model. |
| Pattern beats Incident | A single signal is a hypothesis. Three consistent signals of the same type are a confirmed learning. |
| Deployment beats Acceptance | An artifact the user sends to their board is higher quality than one they accepted but never used. |
| Specificity beats Valence | "I want it shorter" is more useful than "I didn't like this output." Specific feedback enables targeted model updates. |
| Recency beats History | A preference expressed last week outranks a preference inferred six months ago. Models should decay toward recency. |
| Context Tags Are Mandatory | Every learning must be tagged with the context in which it was observed. A preference for brevity in executive summaries may not apply to research papers. |

---

## Section G — Intelligence Value Hierarchy

Not all intelligence is equal. The following hierarchy ranks all 20 learning categories by their combined expected impact across the four key dimensions of BrandOS value. Priority is determined by the aggregate value delivered — categories that impact multiple dimensions simultaneously rank highest.

Rating scale: ★★★★★ = Critical Impact · ★★★★ = High · ★★★ = Meaningful · ★★ = Moderate · ★ = Low

| # | Category | Artifact Quality | Personalization | Strategic Reasoning | User Satisfaction | Why |
|---|---|---|---|---|---|---|
| 1 | Communication & Writing Style | ★★★★★ | ★★★★★ | ★★★ | ★★★★★ | The surface interface between BrandOS and the user. Style mismatch makes every artifact feel alien regardless of strategic quality. |
| 2 | Goals & Objectives | ★★★★★ | ★★★★ | ★★★★★ | ★★★★ | Without current goals, artifact relevance collapses. The highest-quality output for the wrong goal scores zero. |
| 3 | Professional Identity & Archetype | ★★★★ | ★★★★★ | ★★★★ | ★★★★★ | Calibrates depth, vocabulary, tone, and framing for the specific person, not a generic professional. |
| 4 | Domain Expertise & Knowledge | ★★★★★ | ★★★★ | ★★★★★ | ★★★★ | Prevents condescension and confusion. Experts receive expert artifacts; novices receive scaffolded ones. |
| 5 | Knowledge Assets & IP | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | Enables BrandOS to generate artifacts that extend the user's own thinking, not generic templates. |
| 6 | Stakeholder Map | ★★★★ | ★★★★ | ★★★★★ | ★★★★ | Every external artifact targets a specific audience. Stakeholder intelligence is the calibration key. |
| 7 | Strategic Thinking Patterns | ★★★★ | ★★★ | ★★★★★ | ★★★★ | Enables reasoning at the user's preferred altitude and with their preferred logic structure. |
| 8 | Decision-Making Style | ★★★ | ★★★★ | ★★★★ | ★★★★ | Decision support artifacts must align with how the user actually decides, not a rational-actor model. |
| 9 | Operating Principles & Values | ★★★ | ★★★★ | ★★★★ | ★★★★ | Prevents value-misaligned recommendations. High-quality but value-violating artifacts are rejected. |
| 10 | Audience Intelligence | ★★★★ | ★★★ | ★★★★ | ★★★★ | External artifact quality depends entirely on correct audience calibration. |
| 11 | Intellectual Frameworks | ★★★ | ★★★★ | ★★★★ | ★★★ | Framework alignment increases acceptance; framework mismatch signals unfamiliarity. |
| 12 | Success Metrics | ★★★ | ★★★ | ★★★★★ | ★★★ | Enables outcome-framed artifacts. Strategy without metric alignment is directionally incomplete. |
| 13 | Constraints & Boundaries | ★★★ | ★★★ | ★★★ | ★★★★ | Prevents out-of-bounds recommendations. Saves cycles on inapplicable suggestions. |
| 14 | Tool & Technology Preferences | ★★ | ★★★ | ★★ | ★★★ | Improves workflow integration suggestions. Secondary to identity and style signals. |
| 15 | Competitive Intelligence | ★★★ | ★★ | ★★★★ | ★★ | Sharpens strategy artifacts but is fragmented and rapidly outdates. |
| 16 | Temporal Patterns | ★★ | ★★★ | ★★ | ★★★ | Enables timing-aware outputs. Low-value in isolation but compounds with goals. |
| 17 | Cultural & Linguistic Context | ★★★ | ★★★ | ★★ | ★★★ | Prevents cultural misalignment in external-facing artifacts. |
| 18 | Emotional Register | ★★ | ★★★ | ★★ | ★★★ | Tone alignment is secondary to substance but affects subjective satisfaction. |
| 19 | Learning & Curiosity Patterns | ★★ | ★★★ | ★★ | ★★★ | Enables proactive knowledge enrichment. Long-term retention play. |
| 20 | Collaboration & Leadership Style | ★★ | ★★★ | ★★★ | ★★★ | Secondary signal relevant primarily to team and stakeholder artifacts. |

---

## Section H — Dangerous or Low-Value Learning

Intelligence quality is determined not only by what BrandOS learns, but by what it refuses to learn. Storing low-quality signals inflates model confidence incorrectly, introduces noise, and degrades artifact quality over time. The exclusion framework below defines clear boundaries.

| Information Type | Why Exclude / Limit | Disposition | Boundary Rule |
|---|---|---|---|
| One-off requests and experiments | Represents temporary task context, not a persistent preference or fact. Storing creates false model inflation. | Discard post-session | Only upgrade to persistent learning if pattern repeats 3+ times across different sessions |
| Role-play and hypothetical contexts | User adopts a persona for the task. Signals are inverted — they describe a character, not themselves. | Discard immediately | Never extract identity or preference signals from role-play instructions or hypothetical framings |
| Emotional state expressions | Momentary affect does not represent stable personality or professional preference. | Discard immediately | One-time emotional expressions must not influence professional identity or style models |
| Single-session instructions | May reflect task context, external requirements, or client preferences — not the user's own preferences. | Session-scoped only | Apply within session; do not carry forward unless confirmed as a persistent preference by user |
| Unverified self-reported expertise | Users overstate or understate expertise. Self-reports require behavioral confirmation. | Provisional hypothesis | Hold at low confidence until demonstrated via uploaded artifacts or conversation depth |
| Vague or ambiguous implicit signals | Thin evidence leads to false confidence. A single tangential mention is not a pattern. | Provisional hypothesis (low conf.) | Require 3+ consistent signals before elevating to confirmed learning |
| Client or third-party preferences stated in context | User may be describing a client's preference, not their own. Conflating them corrupts the personal model. | Tag as contextual, not personal | Always distinguish between "User prefers X" and "User's client prefers X" |
| Outdated facts without temporal context | Professional identity, goals, and constraints change. Stale facts produce stale recommendations. | Decay or archive with timestamp | All facts must carry acquisition date; facts older than defined thresholds require re-validation |
| Sensitive personal information | Health, family, personal finance, or relationship information is not relevant to professional artifact generation. | Never store | No personal life information should be extracted or retained — only professional context |
| Speculative market claims | User assertions about market size, competitive position, or trends may be aspirational, not factual. | Tag as user-stated, not verified | Clearly distinguish user-stated market beliefs from validated external data |
| Negative emotional reactions to BrandOS outputs | Negative reactions may reflect a bad session, not a model error. Premature recalibration introduces noise. | Log but do not immediately recalibrate | Require 2+ consistent negative signals on the same dimension before adjusting the model |
| High-frequency low-signal behavioral data | Click patterns, session timing, and superficial behavioral data add noise without improving model quality. | Discard or aggregate only | Only retain behavioral data that is directly tied to content acceptance or rejection decisions |

### H.1 — The Core Exclusion Principle

> **The Cost of False Learning**
>
> A confident but wrong model is more dangerous than no model at all. A BrandOS that "knows" the user prefers concise outputs — but learned this from a single role-play session — will produce persistently wrong artifacts while appearing calibrated. The exclusion framework exists to protect model integrity. When in doubt, BrandOS should hold a signal as a low-confidence hypothesis rather than escalate it to a persistent learning.

---

## Section I — Minimum Phase-1 Intelligence Model

BrandOS must be optimized for time-to-value. The goal is not to build a perfect intelligence model before delivering value — it is to deliver meaningful value from the first interaction, with quality compounding on every subsequent interaction. The Phase-1 model is therefore deliberately narrow and high-ROI.

### I.1 — Phase-Based Learning Roadmap

| Learning | Phase | Priority | ROI | Req? | Rationale |
|---|---|---|---|---|---|
| Professional Identity & Archetype | Phase 1 | P0 — Critical | Very High | **Mandatory** | Every other calibration depends on knowing who the user is. Must be established in session 1. |
| Communication & Writing Style | Phase 1 | P0 — Critical | Very High | **Mandatory** | Determines the surface quality of every artifact. Style mismatch is the #1 rejection cause. |
| Goals & Objectives (Current) | Phase 1 | P0 — Critical | Very High | **Mandatory** | Artifact relevance requires knowing what the user is trying to achieve right now. |
| Domain Expertise Level | Phase 1 | P0 — Critical | Very High | **Mandatory** | Depth calibration prevents condescension and confusion. Required for all artifact types. |
| Audience Intelligence (Primary) | Phase 1 | P1 — High | High | **Mandatory** | External artifact quality requires knowing who is reading, not just who is writing. |
| Constraints & Boundaries (Key) | Phase 1 | P1 — High | High | **Mandatory** | Prevents immediate out-of-bounds outputs. Budget, regulatory, team size minimums required. |
| Stakeholder Map (Primary) | Phase 1 | P1 — High | High | Recommended | Enables audience calibration for board, investor, customer, or team-facing artifacts. |
| Knowledge Assets (Uploaded) | Phase 1 | P1 — High | Very High | Recommended | Uploaded artifacts are the richest single signal source. Prioritize extraction. |
| Operating Principles (Core) | Phase 1 | P2 — Medium | Medium | Recommended | Prevents value misalignment in strategic recommendations. |
| Strategic Thinking Patterns | Phase 2 | P1 — High | High | Recommended | Enables higher-quality strategic artifacts but requires sufficient data to extract reliably. |
| Decision-Making Style | Phase 2 | P1 — High | High | Optional | Enriches decision support but requires behavioral observation over time. |
| Intellectual Frameworks | Phase 2 | P2 — Medium | Medium | Optional | Framework alignment is a multiplier, not a foundation. Can wait for Phase 2. |
| Success Metrics (Full) | Phase 2 | P2 — Medium | Medium | Optional | Metric framing improves strategic outputs but requires goal context first. |
| Competitive Intelligence | Phase 2 | P2 — Medium | Medium | Optional | Sharpens strategy artifacts but is fragmented and requires sustained enrichment. |
| Tool & Technology Preferences | Phase 2 | P3 — Lower | Medium | Optional | Workflow integration suggestions are a secondary quality lever. |
| Temporal & Behavioral Patterns | Phase 3 | P3 — Lower | Low-Medium | Optional | Longitudinal signal; requires 60+ day observation window for reliable extraction. |
| Emotional Register | Phase 3 | P3 — Lower | Low-Medium | Optional | Tone refinement at the micro level; builds on strong style model from Phase 1. |
| Learning & Curiosity Patterns | Phase 3 | P3 — Lower | Low | Optional | Long-term retention play; low immediate ROI. |
| Collaboration & Leadership Style | Phase 3 | P3 — Lower | Low-Medium | Optional | Contextual enrichment for team-facing artifacts; secondary priority. |

### I.2 — The Phase-1 Intelligence Core

**What to Learn First (Phase 1 Core)**

- Professional Identity & Primary Archetype
- Communication & Writing Style (basic)
- Current Primary Goals (1–3)
- Domain Expertise Level
- Primary Audience Intelligence
- Key Constraints (budget, team, tech stack)
- Primary Stakeholders
- Uploaded Artifact Extraction (immediate)

**What Can Wait (Phase 2+)**

- Strategic Thinking Patterns (requires depth)
- Decision-Making Style (requires observation)
- Intellectual Framework Map (requires pattern)
- Competitive Intelligence (fragmented)
- Full Success Metric Model
- Temporal & Behavioral Patterns (requires time)
- Emotional Register Calibration
- Collaboration & Leadership Style

### I.3 — GTM-Ready Intelligence Stack

For a BrandOS GTM release, the minimum viable intelligence model that delivers demonstrably superior artifact quality requires only six confirmed learnings. These six alone account for the majority of user-perceived quality gains:

| GTM Priority | Learning | Acquisition Method | Expected Quality Lift |
|---|---|---|---|
| 1 | Professional Identity + Archetype | Session 1 onboarding prompt + optional profile upload | +45% relevance score vs. generic |
| 2 | Communication & Writing Style | 2–3 writing samples or prior artifacts (first upload) | +60% acceptance rate vs. default style |
| 3 | Current Primary Goal | Explicit onboarding question or first conversation extraction | +70% artifact relevance vs. no goal model |
| 4 | Domain Expertise Level | Resume upload or depth calibration in first session | +35% depth calibration vs. default assumption |
| 5 | Primary Audience | First artifact request context extraction | +40% external artifact quality vs. generic audience |
| 6 | Knowledge Assets (first upload) | First artifact upload event | +80% artifact authenticity vs. no IP context |

---

## Closing Design Principles

| Principle | Statement |
|---|---|
| **Intelligence Over Information** | BrandOS does not store information. It stores validated intelligence. The distinction is the difference between a filing cabinet and a thinking partner. |
| Confidence Is a First-Class Attribute | Every stored learning must carry a confidence level. Low-confidence hypotheses must be clearly distinguished from confirmed learnings. No learning should be treated as fact without sufficient validation. |
| Decay Is a Feature | All learnings except Permanent categories must have decay mechanisms. A professional identity model built from three-year-old signals is a liability, not an asset. |
| Context Is Non-Negotiable | A preference for brevity in executive summaries does not imply a preference for brevity in research papers. Every learning must be tagged with the context in which it was observed. |
| User Correction Is Sacred | When a user explicitly corrects BrandOS, that correction is the highest-quality signal in the system. It must be acted on immediately and stored with maximum confidence. |
| Value Compounds | The first artifact BrandOS generates will be good. The hundredth will be exceptional. The learning framework must be designed for compounding returns, not for immediate perfection. |
| Archetype-Agnostic, Person-Specific | The framework is universal by design. The model it builds is individual by output. Every user receives a model built for them, not for their archetype. |

---

*BrandOS Brand Intelligence Learning Framework · Confidential · Board-Level Design Document*
