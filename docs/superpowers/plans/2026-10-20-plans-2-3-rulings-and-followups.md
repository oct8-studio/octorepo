# Plans 2 & 3 — rulings and follow-ups

Decisions made during autonomous execution (2026-10-19/20), each with what it costs if wrong, and the minor items deferred by reviews. None block PR #2 / PR #3.

## Rulings
- Ruling P3-R1: Task 1 (MCP) runs in parallel with Plan 2 plugin tasks since it touches only cli/mcp/options/package.json — cost: a lockfile merge.
- Ruling P3-R2: generated backend env schema lives at src/generated/env.ts (tool-owned, refreshed by add app/add service) and is built from the registry's ServicePlugin.env() keys passed through AppContext — so services added later are validated without touching user code — cost: main.ts import path changes.
- Ruling P3-R3: keep 'gateway' reserved (spec's future microservices layout generates a gateway app); api-platform preset's hono app is named 'edge' instead — cost: preset naming differs from plan text.
- Ruling P3-R4: npm gets 0.3.0 only (after PR #2 then PR #3 merge); CHANGELOG marks 0.2.0 'not published separately; included in 0.3.0' and upgrade notes cover 0.1.x → 0.3.0 — one publish/OTP for the user — cost if wrong: re-add a 0.2.0 publish.
- | T6 Nuxt env | plan says useRuntimeConfig + NUXT_ override vs contract "<UPPER>_URL server-side" | Ruling P2-R1 |
- | T8 Astro env | plan says import.meta.env/process.env | Ruling P2-R2 |
- Ruling P2-R1: Nuxt server code reads `process.env.<UPPER>_URL` directly in a server API route/`useAsyncData` server path (compose sets `<UPPER>_URL`, not `NUXT_`-prefixed) — keeps the one SSR env contract — cost if wrong: Nuxt-specific env var naming later.
- Ruling P2-R2: Astro reads `process.env.<UPPER>_URL` at request time (not import.meta.env, which is inlined at build) — runtime config like other SSR apps — cost: none.
- Ruling P2-R3 (execution): user asked for parallel subagents and a finished product without check-ins; T1 alone, then T2–T11 in parallel worktrees (10 agents), then T12, T13 — cost if wrong: merge conflicts handled by controller.
- Ruling P2-R4: `nitro` pinned to its npm `latest` prerelease (3.0.260903-beta) — official production server for TanStack Start/SolidStart 2 with no stable release; exact-version test widened to allow a prerelease suffix — cost if wrong: bump when stable ships.
- Ruling P2-R5: Plugin tasks T2–T11 dispatched in parallel with Task 1's review — interfaces are additive and verified byte-identical; review fixes to T1 (if any) are rebased in by the controller.
- Ruling P2-R6: ui-solid ships source-only under the `solid` export condition (no tsdown build) — standard for Solid libs because compiled output differs server/browser; R8 exception for the solid family — cost: non-vite consumers can't import it.
- Ruling P2-R7: GitHub CI on PR #2 is the binding Docker/compose gate for Plan 2 (local OrbStack hung; not restarted to protect the user's other stacks) — local --no-docker failures (3 nx combos, env stalls) that pass in CI are treated as environment issues.

## Deferred follow-ups
- Task 1: complete (commits 66efa77..9ff3658, review clean; minors: deprecated @types/koa__router + vinxi keys kept; registry imports engine/ui)
- Task 4 (koa): complete (0916fe5, review clean; minor: no error middleware so 500s lose CORS headers)
- Task 2 (fastify): complete (a8e9bcb, review clean; minor: hand-maintained openapi route list can drift)
- Task 9 (tanstack-start): complete (f1f77c1, review clean; minors: consider .server module for api; flaky one-off plain#test — watch in e2e)
- Task 12: complete (dede7f4..dab6e91, review approved conditional on fixture-families CI green). Minors → Task 13: README Astro dev loads .env; assertNonRoot root:<gid> + inspect exit code; anchor `build` ignore to apps/*/build; dockerignore add **/build **/.solid **/.data; release note: old repos keep `turbo run dev` without --concurrency (R17).
- Task 2 (agents.md): complete (075652f, review clean). Minors → Task 7: idempotency test, no-trailing-newline tail byte, typecheck command in AGENTS.md, CLAUDE.md for older repos on add, quiet option for library callers.
- Task 5: fix round 1/5 (3 addressed; efbb7a2). Task 5: complete. Minor: CORS_ORIGINS not via validated env.
- Task 6 (presets): complete (a883383..e3cd672, review clean). Minors routed to Task 7: preset dropped from manifest on add app/add service; bare stack.preset not expanded (document or strip); MCP create with preset should default monorepoTool to turbo like CLI.
- add app/add service: service-name collision error should say to rename the app (repos that already have an app named like a service are blocked until renamed).
- CORS_ORIGINS still read from process.env in backend app.ts rather than the validated env.
