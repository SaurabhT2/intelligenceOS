# EPIC2_CONSUMER_ADOPTION_CHECKLIST.md
**What a consumer application (BrandOS or otherwise) needs to do — that this platform deliberately did not and could not do for it**

> This document exists because Epic 2's rules forbid implementing consumer-specific code, assuming access to a consumer's source, or modifying a consumer's repository. Every item below was identified during Epic 2 implementation as belonging on the other side of that line. None of them block the platform — `@intelligence-os/core` and `@intelligence-os/shared-types` are fully usable today without any of this. They block a *specific consumer* from being wired up, which is a different, later concern.
>
> Each item states what's needed, why it can't live in this repository, and what a consumer's engineer needs from this platform (already published) to do it.

---

## 1. Provider registration (E2-5)

**What's needed:** Register a provider implementing `IIntelligenceProvider` in your own dependency-injection container, under whatever key/token your application's convention uses.

**Why it's not here:** This platform has no DI container of its own to register into, and "your DI container" is by definition consumer-specific.

**What you need from this platform (already published):**
```ts
import { IntelligenceOS, IntelligenceOSProvider, type IIntelligenceProvider } from '@intelligence-os/core';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const provider: IIntelligenceProvider = new IntelligenceOSProvider(new IntelligenceOS({ supabase }));

// Register `provider` under your container's IIntelligenceProvider token.
```

---

## 2. CPL orchestrator / IdentityContributor wiring (E2-5)

**What's needed:** Wherever your application's content-production pipeline (CPL orchestrator, in the Roadmap's original naming) currently calls a legacy in-house intelligence implementation, swap that call for the registered `IIntelligenceProvider` from item 1.

**Why it's not here:** This requires editing your orchestrator's source code, which this platform doesn't have access to and isn't permitted to assume access to.

**What you need from this platform (already published):** The same `IIntelligenceProvider` interface and `IntelligenceOSProvider` adapter from item 1 — nothing additional. See `docs/EPIC2_PUBLIC_PLATFORM_SURFACE.md` for the full method list (`buildBlueprint`, `recordFeedbackEvent`, `ingestKnowledgeAsset`, `upsertProject`, `reviewLearning`, `getBrandSummary`).

---

## 3. `BrandOSLegacyIntelligenceProvider` (E2-3) — only needed if you want a feature-flagged rollout

**What's needed:** If you want to roll out Intelligence OS gradually rather than switching over all at once, write a class implementing `IIntelligenceProvider` that wraps your *existing* in-house intelligence code, and feature-flag between it and `IntelligenceOSProvider` at the registration point from item 1.

**Why it's not here:** This class's entire purpose is to wrap your legacy implementation. This platform has no visibility into what that legacy implementation is.

**What you need from this platform (already published):** Just the `IIntelligenceProvider` interface — write your wrapper against it the same way `IntelligenceOSProvider` does (see `packages/intelligence-os/src/compat/IntelligenceOSProvider.ts` in the published source for a 1:1 reference implementation of "thin adapter implementing this interface," even though yours will wrap different internals).

**If you don't need a gradual rollout:** skip this item entirely and register `IntelligenceOSProvider` directly in item 1.

---

## 4. Your own boundary rules: RULE-IOS-CPL-ONLY, RULE-IOS-OCL-NONE (E2-6)

**What's needed:** Two lint-style rules over *your own* repository:
- **RULE-IOS-CPL-ONLY**: `@intelligence-os/core` and `@intelligence-os/shared-types` should only be imported from your CPL (content-production) layer, not from arbitrary application code — keeps the integration surface narrow and auditable.
- **RULE-IOS-OCL-NONE**: your OCL (whatever your "outer" or presentation layer is called) should have zero imports of either package — Intelligence OS is a backend/orchestration concern, not something a UI layer should ever touch directly.

**Why it's not here:** These rules scan *your* folder structure for *your* layering convention. This platform's own `scripts/check-boundaries.mjs` (RULE-IOS-ISOLATION, RULE-SIT-ISOLATION) is the platform-side mirror of this same discipline — enforcing that this platform doesn't depend on you. Yours enforces the other direction. Both are needed; neither can substitute for the other; neither can be written by the other side.

**What you need from this platform (already published):** Nothing beyond knowing the two package names (`@intelligence-os/core`, `@intelligence-os/shared-types`) to grep for. `packages/intelligence-os/scripts/check-boundaries.mjs` in the published source is a reasonable starting template — same general shape (walk `.ts` files, regex-match import specifiers, allowlist/denylist, exit 1 on violation), pointed at your own directory structure and your own rule instead.

---

## 5. Runtime configuration

**What's needed:** Provide a Supabase project running the `intelligence` schema (`packages/intelligence-os/src/db/schema.sql` and its migrations in the published source), and a service-role `SupabaseClient` passed into `IntelligenceOSConfig`. Decide where in your secret management this service-role key lives — Intelligence OS never reads environment variables itself, so this is entirely your call to make.

**Why it's not here:** Where you run your database and how you manage secrets is infrastructure ownership that belongs to you, not to a published npm package.

**What you need from this platform (already published):** `src/db/schema.sql` and `src/db/migrations/` (apply these to your Supabase project before first use); `IntelligenceOSConfig`'s shape (`{ supabase: SupabaseClient; eventBus?: IntelligenceEventBus }`).

---

## 6. Event subscription (optional)

**What's needed:** If you want observability into Intelligence OS's pipeline (e.g. logging when a blueprint is built, or reacting to a learning being promoted), subscribe to the event bus.

**Why it's not here:** What you *do* in response to an event (log it, alert on it, feed it into your own metrics pipeline) is entirely your application's concern.

**What you need from this platform (already published):**
```ts
provider.underlying.eventBus.on('intelligence.blueprint.built', async (payload) => {
  // payload is typed as BlueprintBuiltPayload — { userId, entityId, entityType, occurredAt, processingMs, artifactType }
});
```
(`.underlying` is `IntelligenceOSProvider`'s escape hatch back to the concrete `IntelligenceOS` instance — `.eventBus` is deliberately not part of `IIntelligenceProvider` itself. If you registered the concrete `IntelligenceOS` instance directly instead of the provider wrapper, just use `.eventBus` on it directly.)

See `docs/EPIC2_PUBLIC_PLATFORM_SURFACE.md` for the full list of 14 event types and their 9 payload contracts.

---

## What you do *not* need to do

To be explicit about the boundary, since it's easy to over-assume work exists on your side: you do **not** need to fork, vendor, or patch either package; write your own copy of `ArtifactBlueprint`/`ArtifactRequest`/`FeedbackEvent`; reimplement blueprint assembly, the learning pipeline, or the knowledge pipeline; or grant this platform access to your source tree for it to function. `npm install @intelligence-os/core @intelligence-os/shared-types`, items 1 and 5 above, and you have a working integration — everything else in this checklist is incremental.
