# @intelligence-os/playground

A **scaffold**, not a functioning application yet.

## Purpose

Future interactive testing of IntelligenceOS — a place for a developer to
poke at the platform's public surface (`IntelligenceOS`,
`CognitionProvider`, the domain APIs) without spinning up `apps/api`'s
full HTTP layer or writing throwaway scripts outside the workspace.

## Current state

`src/index.ts` only imports `IntelligenceOS` from `@intelligence-os/core`
and logs that it resolved — enough to confirm this app is correctly wired
into the workspace as a consumer of the platform package. It intentionally
does not implement any interactive experience yet.

## Future direction (not implemented here)

Candidate shapes for what this becomes, left open rather than decided
prematurely:

- A local CLI REPL for calling `IntelligenceOS` methods directly against a
  test Supabase project.
- A lightweight local web UI for inspecting a workspace's accumulated
  `CognitionContext` / `CognitionSummary` during development.

Whichever direction is chosen, it should keep depending on
`@intelligence-os/core` the same way `apps/api` and `apps/demo` do —
through the package's public entry point only.
