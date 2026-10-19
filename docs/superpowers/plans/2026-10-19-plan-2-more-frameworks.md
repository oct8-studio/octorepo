# Plan 2 — More Frameworks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Fastify, Hono and Koa backends and Vue+Vite, Nuxt, SvelteKit, Astro, TanStack Start, React Router (framework mode) and SolidStart frontends to octorepo — each wired to the typed REST clients, Dockerized, and proven by the e2e matrix — then release 0.2.0.

**Architecture:** Plan 1's plugin system already carries this: each framework is a folder under `src/plugins/<kind>/<id>/` with `index.ts` + `files/**/*.tpl`. Task 1 removes the two places that still special-case React/Next (UI package selection, server-side env wiring) by adding `uiFamily` and `rendering` to `FrameworkPlugin` and a UI-package registry, and adds every new dependency version up front. Tasks 2–11 are independent plugin folders (parallel). Task 12 registers everything, grows the e2e matrix, updates docs and runs the full matrix.

**Tech Stack:** as Plan 1, plus fastify 5 + @fastify/cors, hono 4 + @hono/node-server + @hono/zod-openapi, koa 3 + @koa/router, vue 3.5 + @vitejs/plugin-vue + vue-tsc, nuxt 4, svelte 5 + @sveltejs/kit 3 + adapter-node, astro 7 + @astrojs/node, @tanstack/react-start 1, react-router 8 (+ @react-router/dev, @react-router/node), solid-js + @solidjs/start 2.

**Spec:** `docs/superpowers/specs/2026-10-17-monorepo-cli-design.md` (§4 "Later (plugins)" lists; this plan promotes the listed ones). Plan 1 for every existing contract: `docs/superpowers/plans/2026-10-18-plan-1-core-engine.md`.

## Global Constraints

- Everything in Plan 1's Global Constraints still binds (Node 24 generated / CLI ≥22.12, pnpm only, exact versions in `src/versions.ts`, official images, tool-owned paths, `@oct8` npm scope for octorepo's own packages).
- Plan 1 execution rulings still bind; the ones every plugin task must honor:
  - **Backend contract:** `GET /health` → `{status:'ok'}`; `GET /hello` → `{message:'Hello from <app>'}` validated by `HelloResponseSchema` from `@<scope>/types`; build writes `apps/<app>/openapi.json`; env `PORT`, `CORS_ORIGINS`; CORS sets `Vary: Origin` whenever an Origin header is present, answers allowed preflights 204, and defaults to the generated `src/generated/cors.ts` origins when `CORS_ORIGINS` is unset; `process.loadEnvFile()` in `main.ts` ignoring ENOENT.
  - **Frontend contract:** tool-owned `src/generated/api.ts` creates one `<camel>Client` per used backend with `createClient(url)` from `@<scope>/<backend>-client`; the page shows each backend's `/hello` message, or an "unreachable" state when a call fails (never fails the build or render). SSR frameworks read `<UPPER>_URL` server-side (fallback `http://localhost:<port>`); SPA frameworks read their public env var at build time (fallback `http://localhost:<port>`).
  - **R8** dual ESM+CJS shared packages via tsdown with `fixedExtension: false`; **R12** `files` field (SSR apps exempt like Next — R15 — when their Docker image copies a build output dir instead of `pnpm deploy`); all generated source passes `biome check` as generated (R14 post-install `--write` covers import order only); **R16** test/typecheck depend on own build; dev depends on `^build`.
  - Generated `.env` copy of `.env.example` per app; Dockerfiles use the shared `PNPM_BUILD_STAGE` from `src/engine/docker.ts`; runtime stage runs as a non-root user.
- New-dependency rule: Task 1 adds **every** version key the new plugins need to `src/versions.ts`; plugin tasks must not edit `src/versions.ts` — if a key is missing, report NEEDS_CONTEXT.
- Plugin tasks must not edit `src/plugins/registry.ts` (Task 12 registers).

## Review Focus

1. **SSR framework with a backend that's down at build time** → `build` still succeeds and the page renders "unreachable". Test: each SSR plugin's scratch verification builds with no backend running (Tasks 6–11).
2. **App name with hyphens** (`billing-api`) → valid identifiers and env names in every framework's generated code (Vue/Svelte/Astro templates included). Test: each plugin's unit test renders with a hyphenated backend name and asserts `billingApiClient` / `BILLING_API_URL`.
3. **Two frontends of different families in one repo** (e.g. Nuxt + SvelteKit) → both `ui-vue` and `ui-svelte` are generated, nothing collides. Test in Task 1 (generateProject) and an e2e fixture in Task 12.
4. **`add app` of the first frontend of a new family** (e.g. adding SvelteKit to a React repo) → creates `packages/ui-svelte` (R18) and leaves `ui-react` untouched. Test in Task 12.
5. **App named `ui-vue`/`ui-svelte`/`ui-solid`** → rejected like `ui-react`. Test in Task 1.

---

## File Structure

```
src/plugins/types.ts                    + uiFamily, rendering on FrameworkPlugin; UiFamily type
src/plugins/registry.ts                 + registerUi/ui(family) (Task 1 adds API; Task 12 registers plugins)
src/engine/ui.ts                        uiPackageFiles(ctx,'react') stays; ui generators per family live with their family's first plugin
src/engine/generate.ts                  generic UI selection via plugin.uiFamily + reg.ui(family)
src/engine/compose.ts                   server-side <UPPER>_URL for every rendering==='ssr' frontend
src/rules/rules.ts                      reserved generated names: ui-<every family>
src/commands/add-app.ts                 R18 generic over families
src/versions.ts                         all new keys (Task 1)
src/plugins/backend/{fastify,hono,koa}/
src/plugins/frontend/{vue-vite,nuxt,sveltekit,astro,tanstack-start,react-router,solid-start}/
src/engine/ui-vue.ts, ui-svelte.ts, ui-solid.ts   (Tasks 5, 7, 11)
scripts/combos.ts, scripts/e2e.ts, .github/workflows/ci.yml, fixtures/families.json, README.md, CONTRIBUTING.md   (Task 12)
```

---

### Task 1: Family-agnostic UI packages, rendering mode, versions

**Files:**
- Modify: `src/plugins/types.ts`, `src/plugins/registry.ts`, `src/engine/generate.ts`, `src/engine/compose.ts`, `src/rules/rules.ts`, `src/commands/add-app.ts`, `src/plugins/frontend/next/index.ts`, `src/plugins/frontend/react-vite/index.ts`, `src/versions.ts`, `scripts/e2e.ts` (only the two `framework === 'next'` checks)
- Test: `tests/engine/generate.test.ts`, `tests/engine/compose.test.ts`, `tests/rules/rules.test.ts`, `tests/commands/add-app.test.ts`, `tests/meta.test.ts`

**Interfaces:**
- Produces:
  - `type UiFamily = 'react' | 'vue' | 'svelte' | 'solid'`
  - `FrameworkPlugin` gains `uiFamily?: UiFamily` (frontends that consume a shared UI package) and `rendering?: 'ssr' | 'spa'` (frontends only).
  - `type UiPackageGenerator = (ctx: ProjectContext) => FileTree`; `Registry.registerUi(family: UiFamily, gen: UiPackageGenerator): this`, `Registry.ui(family): UiPackageGenerator | undefined`; `defaultRegistry()` registers `react` → existing `uiPackageFiles(ctx,'react')`.
  - `generateProject` emits `reg.ui(f)!(ctx)` once per distinct `uiFamily` among frontends (error `CliError` if a plugin names a family with no generator).
  - `composeFiles`: every frontend with `rendering === 'ssr'` gets `<UPPER>_URL=http://<backend>:<port>` (replaces the `id === 'next'` check).
  - `RESERVED`/generated-name collision rule covers `ui-react`, `ui-vue`, `ui-svelte`, `ui-solid`.
  - `add app`: creates `packages/ui-<family>` when missing for the new app's family (R18, now generic).
  - e2e: page-HTML check runs for `rendering === 'ssr'` frontends, CORS check for `spa` (look the plugin up in `defaultRegistry()`).
  - Next: `uiFamily: 'react', rendering: 'ssr'`; react-vite: `uiFamily: 'react', rendering: 'spa'`.
  - `src/versions.ts` adds exact latest-stable versions (`npm view <pkg> version`) for: `fastify, @fastify/cors, @fastify/swagger, hono, @hono/node-server, @hono/zod-openapi, koa, @koa/router, @types/koa, @types/koa__router, vue, @vitejs/plugin-vue, vue-tsc, @vue/test-utils, nuxt, svelte, @sveltejs/kit, @sveltejs/adapter-node, @sveltejs/vite-plugin-svelte, @sveltejs/package, svelte-check, @testing-library/svelte, astro, @astrojs/node, @astrojs/check, @tanstack/react-start, @tanstack/react-router, react-router, @react-router/dev, @react-router/node, @react-router/serve, isbot, solid-js, @solidjs/start, @solidjs/router, vinxi, vite-plugin-solid, @solidjs/testing-library`. If a framework's current stable needs a different companion package (verify each in its docs/package.json peerDependencies), add it here and note it in the report.

- [ ] **Step 1: Write failing tests**
  - generate: stack with frontends `a` (stub plugin `uiFamily:'vue'`) and `b` (stub `uiFamily:'svelte'`) and registry ui stubs returning `{ 'packages/ui-vue/package.json': '{}' }` / `{ 'packages/ui-svelte/package.json': '{}' }` → both keys present, `packages/ui-react` absent; a plugin with `uiFamily:'solid'` and no registered generator → `CliError` mentioning `solid`.
  - compose: a stub frontend with `rendering:'ssr'` using backend `billing-api` (port 4001) → its service env has `BILLING_API_URL=http://billing-api:4001`; a `rendering:'spa'` frontend → no `_URL` key.
  - rules: app named `ui-svelte` → error from the generated-name collision rule.
  - add-app: repo with only React frontends + adding a stub `uiFamily:'vue'` frontend → `packages/ui-vue/**` written, `packages/ui-react/**` byte-identical.
  - meta: every new VERSIONS key above exists (extend the existing exact-version test with an explicit key list).
- [ ] **Step 2: Run** `pnpm vitest run` — new tests FAIL.
- [ ] **Step 3: Implement.** Keep Next/React-Vite generated output byte-identical (existing plugin tests must pass unchanged).
- [ ] **Step 4: Run** `pnpm vitest run && pnpm lint && pnpm typecheck` — PASS; then `pnpm tsx scripts/e2e.ts next-express-turbo --dev` — PASS (regression check).
- [ ] **Step 5: Commit** `feat: family-agnostic ui packages and ssr env wiring`.

---

### Tasks 2–4: Backend plugins (Fastify, Hono, Koa) — parallel

Each follows the Express plugin (`src/plugins/backend/express/**`) as the reference and must satisfy the Backend contract in Global Constraints exactly. Shared per-task shape:

**Files:** `src/plugins/backend/<id>/index.ts`, `src/plugins/backend/<id>/files/**/*.tpl`; Test: `tests/plugins/<id>.test.ts`.
**Produces:** `<id>Plugin: FrameworkPlugin` — `kind 'backend'`, `apiStyles ['rest']`, `defaultPort 4000`, Dockerfile via `nodeServiceDockerfile(ctx, { startCmd: ['node','dist/main.js'] })`, app `package.json` with `files: ['dist','openapi.json']`, scripts `build` (writes openapi.json then compiles), `dev`, `lint` (`biome check src scripts`), `typecheck`, `test` (vitest, against an ephemeral port).
**Unit tests (each):** generated package name `@acme/api`; `src/app.ts` (or framework equivalent) contains `Hello from api`; Dockerfile has `EXPOSE 4000`; `files` field; hyphenated name `billing-api` renders valid code (no `{{` left); `src/generated/cors.ts` present.
**Scratch verification (each, required, paste output):** render workspaceFiles + plugin into `mktemp -d`, `pnpm install`, build `@acme/types`, `pnpm build` (openapi.json exists, contains `/hello`), `pnpm test` (incl. CORS allowed/disallowed/preflight + Vary assertions), `biome check`, `node dist/main.js` serves `/health`.

- **Task 2 — Fastify:** fastify 5, `@fastify/cors` configured to the contract (verify Vary for disallowed origins; if the plugin doesn't emit it, add an `onSend` hook), OpenAPI via `@fastify/swagger` with zod → JSON schema (or hand-built spec from `HelloResponseSchema` via zod v4's `z.toJSONSchema`) — pick the smallest dependency set; commit `feat: fastify backend plugin`.
- **Task 3 — Hono (Node):** hono 4 + `@hono/node-server`, routes via `@hono/zod-openapi` (`OpenAPIHono`), `app.doc31('/openapi.json')`-equivalent written to file at build; CORS via `hono/cors` with the contract's Vary/preflight behavior verified by test; commit `feat: hono backend plugin`.
- **Task 4 — Koa:** koa 3 + `@koa/router`, hand-written CORS middleware matching Express's, OpenAPI via `@asteasolutions/zod-to-openapi` (same as Express); commit `feat: koa backend plugin`.

---

### Tasks 5–11: Frontend plugins — parallel

Each follows Next (SSR) or React+Vite (SPA) as the reference and must satisfy the Frontend contract. Shared per-task shape:

**Files:** `src/plugins/frontend/<id>/index.ts`, `files/**/*.tpl`; Test: `tests/plugins/<id>.test.ts`; plus `src/engine/ui-<family>.ts` where noted.
**Produces:** `<id>Plugin: FrameworkPlugin` with `kind 'frontend'`, `apiStyles []`, `defaultPort 3000`, `uiFamily` and `rendering` as listed; generated `src/generated/api.ts` (or the framework's equivalent path, still under a `generated/` dir, tool-owned) importing `@<scope>/<backend>-client`; `.env.example` with the right env var per backend; Dockerfile using `PNPM_BUILD_STAGE` and a non-root runtime; scripts `build`, `dev`, `lint`, `typecheck`, `test` (one meaningful vitest test — a pure helper is acceptable for SSR frameworks, as in Next).
**Unit tests (each):** uses `api` → generated client file references `@acme/api-client` and the right env var; uses `billing-api` → `billingApiClient` and `BILLING_API_URL` (SSR) / the framework's public prefix (SPA); zero backends → no client imports, still renders a static card, passes biome (no unused symbols); Dockerfile `EXPOSE 3000`; no `{{` left.
**Scratch verification (each, required, paste output):** render with stub client + the family's ui package, `pnpm install`, `pnpm build` **with no backend running**, `typecheck`, `test`, `biome check`, start the production server (or static server for SPA) and fetch `/` → 200 (SSR: HTML contains the "unreachable" card text).

- **Task 5 — Vue + Vite (`vue-vite`):** `uiFamily 'vue'`, `rendering 'spa'`, env `VITE_<UPPER>_URL` with localhost fallback, Vite build ARGs + nginx like react-vite. Also creates `src/engine/ui-vue.ts` → `uiVuePackageFiles(ctx): FileTree` producing `packages/ui-vue` (`${scope}/ui-vue`) exporting a `Card` component written with `defineComponent` + `h()` in plain TS (no SFC build step), dual build per R8, `peerDependencies: { vue }`. Test via `@vue/test-utils` + jsdom. Commit `feat: vue-vite frontend plugin and ui-vue package`.
- **Task 6 — Nuxt (`nuxt`):** `uiFamily 'vue'`, `rendering 'ssr'`; depends on `${scope}/ui-vue` exporting `Card` (Task 5 owns it — do not generate it); page fetches in `useAsyncData`/server route with `<UPPER>_URL` from `useRuntimeConfig` (`NUXT_<UPPER>_URL` override documented) — server-side only; Docker runs `.output/server/index.mjs`. Commit `feat: nuxt frontend plugin`.
- **Task 7 — SvelteKit (`sveltekit`):** `uiFamily 'svelte'`, `rendering 'ssr'`, `adapter-node`, `+page.server.ts` load reads `$env/dynamic/private` `<UPPER>_URL`. Creates `src/engine/ui-svelte.ts` → `uiSveltePackageFiles(ctx)` producing `packages/ui-svelte` with `Card.svelte` packaged by `@sveltejs/package` (`svelte` export condition + types). Docker runs `build/index.js`. Commit `feat: sveltekit frontend plugin and ui-svelte package`.
- **Task 8 — Astro (`astro`):** no `uiFamily` (local `src/components/Card.astro`), `rendering 'ssr'` (`output: 'server'`, `@astrojs/node` standalone), page frontmatter fetches with `import.meta.env`/`process.env` `<UPPER>_URL`. Docker runs `dist/server/entry.mjs` with `HOST=0.0.0.0`. Commit `feat: astro frontend plugin`.
- **Task 9 — TanStack Start (`tanstack-start`):** `uiFamily 'react'`, `rendering 'ssr'`; server function / route loader calls backends server-side with `process.env.<UPPER>_URL`; uses `${scope}/ui-react` (exists). Verify the 1.x production server command and Vite 8 requirement against its docs. Commit `feat: tanstack start frontend plugin`.
- **Task 10 — React Router framework mode (`react-router`):** `uiFamily 'react'`, `rendering 'ssr'`, route `loader` fetches server-side with `process.env.<UPPER>_URL`; Docker runs `react-router-serve ./build/server/index.js`. Commit `feat: react router frontend plugin`.
- **Task 11 — SolidStart (`solid-start`):** `uiFamily 'solid'`, `rendering 'ssr'`, server function/`query` with `process.env.<UPPER>_URL`. Creates `src/engine/ui-solid.ts` → `uiSolidPackageFiles(ctx)` producing `packages/ui-solid` exporting `Card` shipped as source with the `solid` export condition (plus a compiled fallback if the toolchain makes that trivial). Verify SolidStart 2's build output/server command. Commit `feat: solidstart frontend plugin and ui-solid package`.

If a framework cannot satisfy the contract after a real attempt (e.g. its build requires a running backend, or its toolchain can't coexist with the workspace), stop and report BLOCKED with the exact failure — do not ship a reduced plugin silently.

---

### Task 12: Register, matrix, fixtures, docs, full run

**Files:** `src/plugins/registry.ts`, `scripts/combos.ts`, `scripts/e2e.ts`, `fixtures/families.json`, `.github/workflows/ci.yml`, `README.md`, `CONTRIBUTING.md`, `tests/commands/add-app.test.ts`, `tests/plugins/registry.test.ts`.

**Interfaces:**
- `defaultRegistry()` registers fastify, hono, koa, vue-vite, nuxt, sveltekit, astro, tanstack-start, react-router, solid-start and ui generators `vue`, `svelte`, `solid`.
- `COMBOS` = Plan 1's 10, plus for each new frontend `<fe>-hono-turbo` and `<fe>-express-nx` (14), plus for each new backend `react-vite-<be>-turbo` and `next-<be>-nx` (6) → 30 combos; ids exact as written.
- `fixtures/families.json`: tool `turbo`; apps `shop` (nuxt, uses `catalog`), `blog` (astro, uses `catalog`), `admin` (sveltekit, uses `catalog,orders`), `portal` (solid-start, uses `orders`), `catalog` (fastify), `orders` (hono); services `postgres`.
- CI: the e2e matrix now reads 30 ids; add a second fixture job for `fixtures/families.json` (`--dev --compose`).
- README: options table lists every backend/frontend id; roadmap trimmed to what's left (tRPC, Prisma/Drizzle, more services, microservices, GraphQL, gRPC, Elysia, Angular).

- [ ] **Step 1: Failing tests** — registry test: `frameworksOf('frontend')` ids = `['astro','next','nuxt','react-router','react-vite','solid-start','sveltekit','tanstack-start','vue-vite']` (sorted compare), backends = `['express','fastify','hono','koa','nest']`; add-app test: adding `sveltekit` to a React-only repo creates `packages/ui-svelte` and leaves `packages/ui-react` byte-identical.
- [ ] **Step 2–4:** FAIL → implement → `pnpm vitest run && pnpm lint && pnpm typecheck` PASS.
- [ ] **Step 5: Run every combo + both fixtures locally** (`--dev`, fixtures also `--compose`) — paste the results table; fix generator defects found (small commits, listed in the report).
- [ ] **Step 6: Commit** `feat: register plan 2 frameworks, 30-combo matrix, families fixture`.

---

### Task 13: Release 0.2.0

- [ ] Bump `package.json` and `create-octorepo/package.json` (version + its `@oct8/octorepo` dependency) to `0.2.0`; pack both, install the tarballs in a temp dir, run `create` for one new SSR frontend + one new backend with `--no-install --json` → exit 0.
- [ ] Commit `release: 0.2.0`. Publishing (`npm publish` with the user's OTP, staged-publish approval on npmjs.com) and tagging happen with the user, after the PR's CI is green.
