# Plan 3 — Agent-native + Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make octorepo callable by AI agents (MCP server + Claude Code plugin + AGENTS.md in every generated repo) and give generated stacks real data plumbing (Drizzle or Prisma with migrations and seed, `add service` with four more services, typed env validation, presets), then release 0.3.0.

**Why (from `docs/research/2026-10-19-market.md`):** Nx (nx-mcp ~33k dl/wk), Better-T-Stack and Better-Fullstack all ship MCP servers/skills — agent support is now expected. Top open requests across competitors: ORM support (BTS #524 Kysely, #538), Docker/Compose services (BTS #236/#557, t3-turbo #111), presets (next-forge #274), and "fresh projects break" (BTS #1246/#1251/#1237), which our e2e matrix answers. The spec's goal 7 ("non-interactive mode so AI agents and CI can drive it") is extended here to a first-class MCP server.

**Architecture:** The MCP server is a thin stdio adapter over the existing command functions (`runCreate`, `runAddApp`, the new `runAddService`), validation (`validateStack`) and registry listing — no new generation logic. ORMs become a new plugin category (`OrmPlugin`) producing a shared `packages/db`; services get four new `ServicePlugin`s and an `add service` command mirroring `add app`. Env validation is a generated `src/env.ts` per backend. Presets are named `StackConfig`s.

**Tech Stack:** as Plans 1–2, plus `@modelcontextprotocol/sdk` 1.x, drizzle-orm + drizzle-kit, prisma 7 + @prisma/client + @prisma/adapter-pg (stable 7.x — the `latest` dist-tag currently points at an 8.0 RC; pin the newest 7.x), pg, official images valkey/valkey, rabbitmq:management, axllent/mailpit, chrislusf/seaweedfs.

**Spec:** `docs/superpowers/specs/2026-10-17-monorepo-cli-design.md` (goals 3, 6, 7; §4 services/ORM rows). Plans 1–2 contracts and rulings still bind.

**Precondition:** Plan 2 merged into the working branch (presets and env validation touch every backend plugin).

## Global Constraints

- All Plan 1 and Plan 2 global constraints and rulings bind (exact versions in `src/versions.ts`, official images only, no Bitnami/MinIO, tool-owned paths, biome-clean output, R16 build ordering, Node 24 generated / CLI ≥22.12).
- MCP server: stdio transport only; every tool returns the same JSON the CLI's `--json` mode prints; no tool writes outside the `dir`/`cwd` the caller passes; `create`/`add_*` refuse exactly where the CLI refuses.
- ORM: one ORM per stack (`StackConfig.orm?: 'drizzle' | 'prisma'`); requires the `postgres` service (rule auto-adds it as a fix); shared package `packages/db` (`@<scope>/db`) dual-built per R8 with `files`; every backend depends on it when `orm` is set.
- Migrations run in compose via a one-shot `migrate` service (`depends_on: postgres: service_healthy`); backends `depends_on: migrate: service_completed_successfully`.
- New tool-owned paths: `packages/db/src/generated/**`, `AGENTS.md` (marker-delimited octorepo section only), `.mcp.json` is never written into generated repos (that's the user's choice).
- Manifest: `schemaVersion` stays 1; new optional fields (`orm`, `preset`) are additive and older manifests without them stay valid.

## Review Focus

1. **`orm` set but no postgres** → postgres auto-added (fix, reported), compose has postgres + migrate. Test in Task 3.
2. **`add service postgres` on a repo that already has it** → no-op with a clear message, nothing rewritten. Test in Task 4.
3. **MCP `create` with a relative or `..` dir** → resolved against the server's cwd; refuses non-empty dirs like the CLI. Test in Task 1.
4. **Backend started without a required env var** (e.g. `DATABASE_URL` when `orm` is set) → exits non-zero with a message naming the variable, not a stack trace. Test in Task 5.
5. **Preset plus extra `--app` flags** → preset apps first, extras appended, name collisions rejected. Test in Task 6.

---

### Task 1: `octorepo mcp` server + `octorepo options`

**Files:** Create `src/commands/options.ts`, `src/mcp/server.ts`, `src/mcp/tools.ts`; Modify `src/cli.ts`, `package.json` + lockfile (add `@modelcontextprotocol/sdk` as a runtime dependency of the CLI — it is not a generated-repo dependency, so it does not go in `src/versions.ts`). Test: `tests/mcp/server.test.ts`, `tests/commands/options.test.ts`.

**Interfaces:**
- `listOptions(reg: Registry): { monorepoTools: {id,label}[]; frameworks: { frontend: {id,label,rendering,uiFamily?}[]; backend: {id,label,apiStyles}[] }; services: {id,label}[]; orms: {id,label}[]; presets: {id,description}[] }` — `orms`/`presets` empty until Tasks 3/6 register them.
- CLI: `octorepo options [--json]` prints it (human table without `--json`).
- `createMcpServer(reg: Registry, opts?: { cwd?: string }): McpServer` registering tools: `list_options`, `validate_stack` (input: StackConfig JSON → `{ stack, errors, warnings, fixes }`), `create` (input: `{ dir, stack, install?: boolean, git?: boolean }` → CreateResult), `add_app` (input: `{ cwd, app }`), `read_manifest` (input `{ cwd }`). Tool input schemas from the existing zod schemas. `add_service` is added in Task 4.
- CLI: `octorepo mcp` starts it on stdio. stdout carries only protocol messages (child-process output from post-steps goes to stderr — already true).
- `integrations/claude-code/` (published separately later): `.claude-plugin/plugin.json`, `.mcp.json` (`npx -y @oct8/octorepo mcp`), `skills/octorepo/SKILL.md` (when/how to scaffold or extend a monorepo with the tools), `commands/new.md` (`/octorepo:new`). README "Use with AI agents" section with Claude Code, Cursor and generic MCP config snippets.

- [ ] **Step 1: Failing tests** — options: contains `express`, `next`, `postgres`, `turbo`; mcp: connect an in-memory client (`InMemoryTransport` from the SDK) → `listTools` names exactly the five tools; `validate_stack` with `apps: []` returns an error with rule `at-least-one-app`; `create` into a temp dir with `install:false, git:false` writes `.octorepo.json`; `create` into a non-empty dir returns an MCP error result (isError) with the CLI's message; `read_manifest` returns the manifest.
- [ ] **Step 2–4:** FAIL → implement → PASS; plus a stdio smoke: spawn `node dist/cli.js mcp`, send `initialize` + `tools/list` JSON-RPC, parse response.
- [ ] **Step 5: Commit** `feat: mcp server, options command, claude code plugin`.

### Task 2: AGENTS.md in generated repos

**Files:** Modify `src/engine/workspace.ts`, `src/commands/add-app.ts` (refresh section); Test `tests/engine/workspace.test.ts`, `tests/commands/add-app.test.ts`.
- Generated `AGENTS.md`: a marker-delimited section (`<!-- octorepo:begin -->` … `<!-- octorepo:end -->`) listing apps (kind, framework, port, uses), packages, commands (`pnpm dev/build/test/lint`, per-app filters), how to add apps/services (`npx @oct8/octorepo add app|service`), conventions (tool-owned paths — don't hand-edit `src/generated/**`), and the env files. `CLAUDE.md` = one line `@AGENTS.md`.
- `add app`/`add service` rewrite only the marked section; content outside markers is preserved byte-for-byte; missing markers → append the section.
- **kbee hint (oct8 studio's cross-repo KB skills, https://github.com/oct8-studio/kbee):** `kbeeHint(): string` in `src/engine/agents.ts`, shared by the AGENTS.md section, README and the post-create output (stderr/human output only — `--json` stdout stays pure). Text: "This repo's structure is in `.octorepo.json`. For cross-repo knowledge with cited facts, run `npx skills add oct8-studio/kbee`, then ask your agent to run kbee-init and treat each package as its own entry." No KB files are generated (kbee requires cited facts against real commits plus a human approval step; a generate-time KB would only cite boilerplate). A future explicit `octorepo kb-seed` command is a Plan 4 candidate.
- [ ] Tests: section lists every app; user text above/below markers survives an `add app`; AGENTS.md contains `oct8-studio/kbee` exactly once inside the markers; `create --json` stdout parses as JSON; commit `feat: AGENTS.md for generated repos with kbee hint`.

### Task 3: ORM plugins (Drizzle, Prisma)

**Files:** Create `src/plugins/orm/{drizzle,prisma}/index.ts` + `files/**`; Modify `src/plugins/types.ts` (`OrmPlugin`), `src/plugins/registry.ts` (`registerOrm`, `orm(id)`), `src/model/stack.ts` (`orm?`), `src/rules/rules.ts` (`orm-known`, `orm-needs-postgres` fix), `src/engine/generate.ts`, `src/engine/compose.ts` (migrate service), all backend plugins' generated `package.json` (dependency on `@<scope>/db` when `orm`) and app code (`GET /db/health` → `{ ok: true, greetings: <count> }` using the db package), `src/versions.ts`. Tests per file.
- `interface OrmPlugin { id: 'drizzle' | 'prisma'; label: string; generate(ctx: ProjectContext): FileTree /* packages/db */; migrateCommand: string[] }`.
- `packages/db`: schema with one `greeting` table (`id`, `message`), `createDb(url: string)` export, `db:migrate`, `db:generate`, `db:seed` (inserts "Hello from the database"), dual build; Prisma uses the `prisma-client` generator with output in `src/generated` and `@prisma/adapter-pg`; Drizzle uses `drizzle-kit` with committed SQL migrations under `packages/db/drizzle/`.
- Compose `migrate` service: built from a `packages/db/Dockerfile` (PNPM_BUILD_STAGE, runs migrate + seed, exits 0).
- [ ] Unit tests: orm without postgres → fix adds postgres; generated backend depends on `@acme/db`; compose has `migrate` with `service_completed_successfully` on every backend; Prisma/Drizzle trees contain their config files. Scratch: generate express+drizzle and nest+prisma stacks, `docker compose up -d --wait`, `GET /db/health` → `greetings: 1`. Commit `feat: drizzle and prisma orm plugins`.

### Task 4: More services + `add service`

**Files:** Create `src/plugins/service/{valkey,rabbitmq,mailpit,s3}/index.ts`, `src/commands/add-service.ts`; Modify `src/cli.ts`, `src/mcp/tools.ts` (`add_service` tool), `src/plugins/registry.ts`. Tests per file.
- valkey (`valkey/valkey:<major>-alpine`, `VALKEY_URL`), rabbitmq (`rabbitmq:<major>-management-alpine`, `AMQP_URL`, mgmt UI on 127.0.0.1:15672), mailpit (`axllent/mailpit`, `SMTP_URL`, UI 127.0.0.1:8025), s3 via SeaweedFS (`chrislusf/seaweedfs` `server -s3`, `S3_ENDPOINT`, `S3_BUCKET`, access keys for local dev only, documented). Every service has a healthcheck; image majors in `IMAGES`.
- `runAddService({ cwd, service, json }, reg)`: manifest checks as `add app`; already present → no-op result `{ written: [], message }`; else regenerate tool-owned files (compose, root `.env.example`, AGENTS.md section, manifest) and append the new env vars to each backend's `.env` and `.env.example` (append-only, never rewrite existing lines).
- [ ] Tests: add each service → compose has it with healthcheck and 127.0.0.1 ports; second add → no-op; user lines in `.env` preserved. Scratch: compose with all six services → `docker compose up -d --wait` healthy. Commit `feat: valkey, rabbitmq, mailpit, s3 services and add service`.

### Task 5: Typed env validation in backends

**Files:** every backend plugin (express, nest, fastify, hono, koa) — generated `src/env.ts` (zod schema of `PORT`, `CORS_ORIGINS`, and each service's/ORM's vars), `main.ts` uses it; `src/engine/env.ts` builds the schema source from the stack. Tests per plugin.
- Missing required var → process prints `Missing environment variable DATABASE_URL (see .env.example)` and exits 1.
- [ ] Tests + scratch for one backend per family; commit `feat: typed env validation in generated backends`.

### Task 6: Presets

**Files:** Create `src/presets.ts`; Modify `src/cli.ts` (`--preset`), `src/commands/prompts.ts` (first question: "Start from a preset?"), `src/mcp/tools.ts` (`list_options` includes presets; `create` accepts `preset`). Tests.
- `saas`: `web` (next, uses api), `admin` (react-vite, uses api), `api` (nest), `worker` (fastify); services postgres, valkey, mailpit; orm drizzle.
- `api-platform`: `gateway` (hono), `users` (nest), `billing` (fastify); services postgres, rabbitmq; orm prisma; a `docs` frontend (astro, uses gateway).
- `--preset` + `--app` → preset apps then extras; validation as usual.
- [ ] Tests (Review Focus 5); commit `feat: saas and api-platform presets`.

### Task 7: Matrix, docs, release prep

- COMBOS += `next-express-drizzle-turbo`, `react-vite-nest-prisma-nx`, `nuxt-hono-drizzle-nx`, `sveltekit-fastify-prisma-turbo`; fixtures `fixtures/presets-saas.json`, `fixtures/presets-api-platform.json` (compose + dev smoke; e2e also hits `/db/health`); a services fixture with all six services (compose up + health only).
- CI: MCP stdio smoke step in `unit` job.
- README: "Use with AI agents", ORM, services, presets sections; comparison table vs Better-T-Stack / create-turbo / Nx / t3-turbo (factual, from the research doc).
- Bump to 0.3.0 (both packages); pack + install smoke. Commit `release: 0.3.0`. Publishing waits for the user (OTP + staged approval).
