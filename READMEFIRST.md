# READMEFIRST.md

**This file is the mandatory entry point for every AI coding assistant that
accesses this repository** — Claude, ChatGPT, Codex, Cursor, Windsurf,
Gemini, Kimi, or any future AI development assistant.

This is not a project README. It is not architecture documentation. It is
not implementation documentation. Its only job is to teach you — the AI
agent — how to understand and navigate this repository efficiently,
*before* you do anything else.

---

## 1. What this repository is

This repository contains an AI-native **Context Generation Framework**.
It continuously analyzes the repository's source code and produces an
**Architecture Knowledge Graph** — the canonical architectural
representation of this codebase.

Every other piece of generated documentation is *derived from that graph*.
The graph itself is derived from source. Source code remains the
implementation authority; the graph is how you reach it quickly instead of
rediscovering it by hand.

### Architecture flow

```
Repository Source Code
        ↓
   Static Analysis
        ↓
Architecture Knowledge Graph
        ↓
Generated Context Artifacts
        ↓
    AI Consumption   ← you are here
```

You are meant to enter this flow at the bottom, not the top. Understand the
architecture through the generated graph — don't reconstruct it by scanning
the repository from scratch.

---

## 2. Generated artifacts

Three files, all under `.context/`, all machine-produced, none hand-edited:

**`.context/architecture.generated.json`**
The canonical, machine-readable Architecture Knowledge Graph. Primary
source for architectural reasoning: nodes, edges, domains, pipelines,
APIs, contracts, dependencies, behavior contracts, runtime topology, and
every relationship between them.

**`.context/architecture.generated.md`**
A human-readable architecture guide generated *from* the graph above —
structured overview, table of contents, one section per subsystem. Useful
for reading; never the source of truth. If it and the JSON graph disagree,
the JSON graph wins (and that disagreement itself is a bug in the
generator, worth flagging).

**`.context/context_refresh_summary.generated.md`**
Small. A repository-health summary: fingerprint, corpus statistics,
detected gaps, and how to regenerate. Read this first, every time — it
tells you in seconds whether the graph is current and what's already
known to be missing, before you spend a single tool call rediscovering it.

---

## 3. How the graph is generated — and why you don't do it

**AI agents do not generate the graph.** It's produced automatically by
the engineering pipeline, deterministically, from source:

```
Developer changes code
        ↓
   pnpm context:generate
        ↓
Architecture Knowledge Graph updated
        ↓
  Generated artifacts updated
        ↓
       Commit
        ↓
        Push
```

The graph is always committed alongside the source that produced it — it
is not a build-time-only artifact you regenerate and discard. `pnpm build`
runs `context:generate` first, automatically.

### CI verification

```
pnpm context:generate
        ↓
git diff --exit-code .context
        ↓
PASS if generated artifacts are current
FAIL if generated artifacts are stale
```

This guarantees every revision of this repository carries an Architecture
Knowledge Graph that's synchronized with its implementation. If CI fails
here, someone changed source without regenerating context — run
`pnpm context:generate` and commit the result.

---

## 4. Recommended read order

1. **This file.**
2. `.context/context_refresh_summary.generated.md` — is the graph current? What's already a known gap?
3. `.context/architecture.generated.json` — load the graph. This is where architectural reasoning happens.
4. `.context/architecture.generated.md` — only if you need a human-readable narrative overview of a subsystem.
5. **Source code** — only to verify an implementation detail, or when the graph is missing information you need. Repository-wide exploration is never the default strategy; it's what you do after the graph has told you exactly where to look.

## 5. Recommended workflow for any engineering task

```
Understand repository
        ↓
Read architecture summary
        ↓
Load Architecture Knowledge Graph
        ↓
Trace architectural relationships
        ↓
Inspect implementation
        ↓
Modify source
        ↓
Regenerate context
        ↓
Run tests
        ↓
Commit
```

---

## 6. Available commands

| Command | Does |
|---|---|
| `pnpm context:generate` | Regenerates the Architecture Knowledge Graph and all derived artifacts. |
| `pnpm context:check` | Regenerates, then fails if anything under `.context/` doesn't match what's committed. |
| `pnpm trace <component>` | Traces architectural relationships from a component — e.g. `pnpm trace knowledge`, `pnpm trace identity`, `pnpm trace ContextBuilder`. |
| `pnpm impact <component>` | Dependency-impact analysis — e.g. `pnpm impact ProfileBuilder`, `pnpm impact ContextBuilder`. |

---

## 7. Engineering rules

- Never manually edit a generated artifact (anything under `.context/`).
- Never treat generated markdown as the source of truth — the JSON graph is; source code is the implementation authority behind that.
- Always regenerate context (`pnpm context:generate`) after a structural repository change, before committing.
- Always verify implementation before stating an architectural conclusion as fact — the graph tells you where to look, not a substitute for looking.
- Generated artifacts accelerate understanding; they do not replace source-code verification.

---

## 8. When the framework should evolve

**Requires evolving the Context Generation Framework itself** (its
extraction logic, graph schema, or generators under `scripts/context/`):
a new architectural domain, a new pipeline, a new runtime model, a new
persistence model, a new graph relationship type, a new architectural
abstraction, a new execution model.

**Does not require framework evolution** (just re-run
`pnpm context:generate` — the existing extraction already handles it):
method renames, variable renames, logging improvements, dependency
injection changes, refactoring, performance optimization, validation
improvements, or other internal implementation changes that don't alter
the architecture's shape.

If you're unsure which category a change falls into: if
`pnpm context:generate` produces a correct, complete graph without any
generator code change, it was the second category.

---

## Final principle

The objective is not to explore the repository. The objective is to
understand the repository's architecture as quickly and accurately as
possible.

Always consume the generated Architecture Knowledge Graph before exploring
source code. Use source code to verify architectural conclusions, not to
discover them. The Architecture Knowledge Graph is the primary
architectural navigation model for this repository.
