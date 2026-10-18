# Monorepo Scaffolding CLI — Design

Date: 2026-10-17
Status: Draft for approval
Working name: `<name>` (TBD — placeholder throughout)

## 1. Intent and the why

An open-source CLI that generates a complete, working Node/TypeScript monorepo for
**multi-app, backend-heavy systems**: any number of frontends and backends, each with
its own framework, on Nx or Turborepo, with Docker Compose infrastructure and an
optional microservices base. It stays useful after day one: the project can grow via
`add` commands that keep everything consistent.

Why it should exist (from market research, 2026-10-17):

- **Better-T-Stack** (`create-better-t-stack`, ~1.8k dl/wk, 5.8k stars) already covers
  "one web frontend + one backend, pick Turbo or Nx". We do **not** compete there.
- No existing tool generates **N frontends + M backends with per-app frameworks**.
  BTS enforces "only one web framework" and one backend; its multi-frontend PR is
  unmerged.
- Top unmet requests in the space: **NestJS** support (BTS's most-voted issue),
  **Docker/Compose generation**, **multiple frontends**.
- Top complaint: **generated projects break** as dependencies drift.
- Shared packages consumed by both NestJS (CJS-leaning, decorators) and Vite/ESM apps
  are a known pain point.
- AI assistants increasingly scaffold projects; Nx now positions generators as tools
  agents call. A deterministic, tested generator that agents can invoke beats
  hand-written config.

The author (solo maintainer, building with heavy Claude assistance) currently asks
Claude to set monorepos up by hand; the CLI replaces that with a consistent, correct,
fast result.

## 2. Goals, non-goals, anti-goals

### Success (3 months post-launch)
Community traction: OSS contributors, issues, PRs, GitHub stars, npm downloads.

### Goals
1. Interactive CLI to create a monorepo with N frontend + M backend apps, each with
   its own framework and API style.
2. Choice of **Nx or Turborepo** (latest stable at build time).
3. **Docker**: a Dockerfile per app and a root `docker-compose.yml`, with optional
   infra services (DBs, caches, brokers, etc.).
4. **Microservices base** when chosen: inter-service transport, gateway, per-service
   config/env.
5. **Intelligent validation**: block impossible combinations, auto-apply the glue
   needed for valid but tricky ones (see §5).
6. **Grows with the project**: `add app`, `add service`, etc. update everything
   affected, driven by a manifest in the repo.
7. **Non-interactive mode** (flags + JSON config) so AI agents and CI can drive it.
8. **Every supported framework combination is CI-tested** (build, lint, typecheck,
   test, and Docker build) so output doesn't rot.
9. **Contributor-friendly**: each framework/service/transport is a self-contained
   plugin; adding one is a single focused PR.

### Non-goals
- Competing with Better-T-Stack on single-app setups, auth providers, or exhaustive
  ORM/DB matrices.
- Real cloud deployment (Kubernetes manifests, Terraform, AWS/GCP specifics) in v1.
- Natural-language input ("describe your stack in English") in v1.
- Non-Node backends.
- npm / yarn / bun package managers in v1 (pnpm only).

### Anti-goals (failure even if it "works")
- Generated projects that don't build, start, or `docker compose up` cleanly.
- Supporting more options than can be tested; a long list of half-working options.
- A core so tangled that contributors can't add a framework without touching
  everything.
- Depending on Nx's own generators so Nx major upgrades break us.
- Defaulting to dead/unmaintained things (MinIO, Bitnami images, kafkajs, Remix v2).

## 3. Constraints

- Solo maintainer; build capacity is high (Claude Max, several days available), but
  ongoing maintenance (PR review, issues, upstream breakage) must stay manageable.
  This drives the plugin architecture and the CI matrix.
- Node 24 LTS, TypeScript everywhere (CLI and generated code).
- pnpm workspaces as the generated base.
- "Latest stable" versions of Nx (23.x) and Turborepo (2.x) and all frameworks at
  build time; versions are pinned in the tool and bumped deliberately, gated by CI.

## 4. Scope: v1 option set

Chosen from npm/GitHub data (see research). Everything in "v1" is CI-tested.

| Category | v1 | Later (plugins) |
|---|---|---|
| Monorepo tool | Nx, Turborepo | — |
| Backend | Express 5, Fastify, NestJS, Hono | Elysia (Bun), Koa, tRPC/oRPC standalone, Adonis |
| Frontend | Next.js, React+Vite, TanStack Start, Vue+Vite, Nuxt, SvelteKit | Astro, Angular, React Router framework mode, SolidStart, Qwik |
| API style | REST + OpenAPI (zod-openapi family), tRPC; **GraphQL** (Yoga + Pothos; `@nestjs/graphql` for Nest); **gRPC** (ConnectRPC; Nest gRPC transport for Nest) | WebSockets, alternative GraphQL/gRPC libs |
| Microservice transport | Nest TCP / Redis transports, RabbitMQ (amqplib), BullMQ, NATS | Kafka (`@confluentinc/kafka-javascript`), Traefik / Kong gateways |
| Compose services | Postgres, Redis/Valkey, RabbitMQ, Mailpit | MySQL, MongoDB, Kafka (`apache/kafka`, KRaft), NATS, OpenSearch, S3-compatible (SeaweedFS/Garage — not MinIO) |
| ORM | Prisma, Drizzle | Kysely, TypeORM, MikroORM, Mongoose |
| Package manager | pnpm | npm, bun |

**GraphQL and gRPC are in v1 but built last.** If they prove hard, they slip to the
first post-launch release rather than delaying launch.

Not every API style applies to every backend: the plugin declares what it supports
(e.g. tRPC is TS-to-TS only; Nest uses its own GraphQL/gRPC modules). The validator
enforces this.

## 5. How it works

### 5.1 Create flow (interactive)
`npx <name> create` (or `npm create <name>`):

1. Project name, target directory.
2. Monorepo tool: Nx or Turborepo.
3. Add apps in a loop. For each: kind (frontend/backend), name, framework, and for
   backends, API style. For frontends: **which backends it uses** (multi-select).
   Repeat until done.
4. Compose services (multi-select).
5. ORM (if a DB was selected) and which backends use it.
6. Microservices layout? If yes: transport, gateway.
7. Review summary (shows auto-applied fixes and warnings) → confirm → generate →
   install → optional git init.

### 5.2 Non-interactive
Same choices via flags or `--config stack.json`. Agent- and CI-friendly: no prompts,
exit codes, machine-readable output (`--json`).

### 5.3 Intelligence (validation + glue)
A rules layer evaluated on every change to the stack (create and add):

- **Block** impossible combos (e.g. API style not supported by the chosen backend,
  Nest-only transports with non-Nest services, a frontend linked to a backend in a
  way the API style can't serve), with a clear message and suggested alternative.
- **Auto-fix / auto-wire** known glue, reported in the summary, for example:
  - shared packages built so both NestJS (decorators, CJS-friendly) and ESM/Vite
    consumers work;
  - NestJS compiled with SWC/tsc so decorator metadata survives;
  - Next.js `output: "standalone"` + `outputFileTracingRoot` for Docker, and
    `transpilePackages` for internal packages;
  - gRPC/Connect codegen from shared `.proto` files wired as a task that runs before
    builds;
  - microservices chosen without a broker → add one;
  - CORS and env URLs so each frontend can reach the backends it uses;
  - unique ports per app.
- **Warn** about discouraged-but-allowed choices.

Rules live with the plugins that own them where possible, so contributors adding a
framework also add its rules.

### 5.4 Frontend ↔ backend wiring (author decision)
Frontends come **wired to the backends they use**. Each frontend ships a working,
**typed example call** to each of its backends, using the client that fits the
backend's API style:

- REST + OpenAPI → generated typed client from the backend's OpenAPI spec;
- tRPC → tRPC client importing the backend's router type;
- GraphQL → typed GraphQL client with codegen;
- gRPC → Connect web client from shared `.proto` codegen.

Plus CORS and env URLs. In a microservices layout, frontends call the gateway, not
services directly. This means API-style plugins provide both server and client
halves, and client code exists per frontend-framework × API-style pairing (framework
glue kept thin; the typed client itself lives in a shared package per backend where
possible, e.g. `packages/<backend>-client`).

### 5.5 Microservices model (builder-check call)
- Choosing the microservices layout makes **every backend app a service**, and adds a
  **gateway** as an extra generated app (custom Nest or Fastify in v1). Frontends
  reach services only through the gateway.
- Broker transports (RabbitMQ, NATS, BullMQ) work with every backend framework via
  framework-agnostic clients. **Nest TCP/Redis transports are offered only when all
  services are Nest**; the validator enforces this.
- Generated example shows **one request/response call and one event**; BullMQ is
  offered as a job-queue add-on, not as the request/response transport.

### 5.6 Manifest
A file in the generated repo (e.g. `<name>.json`) recording the project's apps,
frameworks, API styles, frontend→backend links, services, ORM, transport, and tool
version. It is the source of truth for `add` commands and validation. It carries a
**`schemaVersion` from day one**; if a repo's schema is one the CLI can't handle,
`add` refuses with a clear message (migrations are a later feature). *(builder-check
call)*

### 5.7 Growing the project
- `add app` — new frontend/backend; updates workspace, compose, env, shared package
  wiring, CI.
- `add service` — new compose service; updates compose, env, and wires clients into
  chosen backends.
- Further `add`/`remove` commands may follow; `add app` and `add service` are v1.

**Edits by the user (builder-check call).** The tool fully owns compose, env files,
workspace/monorepo config, and its own clearly marked generated "wiring" files
(which it may regenerate). In user-authored source it only inserts at explicit marker
comments; if a marker is missing it prints the manual steps instead. No AST codemods
of user code in v1.

### 5.8 Nx vs Turbo strategy
The tool owns its generator engine (templates + manifest). It emits **plain pnpm
workspaces with `package.json` scripts**: Turbo works with a `turbo.json`; Nx picks
projects up via inferred targets plus a minimal `nx.json`. Nx-specific extras
(`project.json`, plugins) are an optional layer. **No dependency on `@nx/*`
generators.**

## 6. Generated repo contents

- `apps/*` — one folder per app.
- `packages/` — `types` (shared types/schemas), `config` (tsconfig, lint, format
  presets), **one UI package per frontend framework in use** (`ui-react`, `ui-vue`,
  `ui-svelte`; created when the first frontend of that framework is added —
  builder-check call), per-backend typed clients, plus `proto/` when gRPC is used.
- Lint + format configured at the root.
- A Dockerfile per app (multi-stage, pnpm-aware) and root `docker-compose.yml`
  including apps and selected services, with official images.
- `.env.example` per app and at root.
- Basic GitHub Actions CI (install, lint, typecheck, test, build — affected-only via
  Nx/Turbo).
- README describing the stack and common commands.

Microservices layout additionally includes: gateway app, transport client/server
wiring per service, per-service config.

## 7. Architecture of the CLI (what's decided)

- **Core**: prompt/flag layer → stack model → rules/validation → generation engine →
  post-steps (install, git). Written in TypeScript.
- **Plugins**: one per framework, API style, transport, compose service, ORM, and
  monorepo tool. Each plugin provides its templates, its prompts/options, its rules,
  and its CI fixture. Plugins are in-repo for v1 (third-party plugins are a later
  possibility, not a v1 goal).
- **CI matrix** (builder-check call on depth):
  - every frontend × backend × monorepo-tool pair in v1 (~40+ combos), each
    generated as a single-pair repo, installed, built, linted, typechecked, tested,
    and Docker-built;
  - a handful of curated **multi-app fixtures** (mixed frameworks, microservices
    layout, several services) that are additionally booted with
    `docker compose up`, health-checked, and checked that the frontend's example
    call reaches its backend;
  - API styles, transports, compose services, and ORMs are each covered at least
    once, not as a full cross-product.
  - A plugin is "done" only when it ships its CI fixture and passes.
- **Docs/launch**: README with a terminal GIF, contributing guide with a
  "how to add a plugin" walkthrough. A website / web stack-builder is later.

## 8. Build order and cut line (author decision)

Build so that a launchable release exists early, then widen. If time runs short,
cut in this order (first cut = first item):

1. GraphQL and gRPC → first post-launch release.
2. `add service`.
3. Frontends trimmed to Next.js, React+Vite, Vue+Vite.
4. Microservices layout (gateway + transports).

**Minimum launchable release:** multiple apps with per-app frameworks, Nx/Turbo,
frontends wired to backends (REST + tRPC), Docker + Compose with v1 services,
validation rules, `add app`, non-interactive mode, CI matrix green.

## 9. Left to the builder

- Prompt library, templating approach, file-merging strategy for `add` commands.
- Exact manifest schema and file name.
- Exact folder layout inside each app template and of the CLI repo.
- Test runner, lint/format tools (Biome vs ESLint+Prettier, Oxlint, etc.).
- Gateway implementation details (likely a custom Nest/Fastify gateway in v1).
- How CI matrix is sharded/cached.
- Default ports, env var naming conventions.
- Final CLI name (author's decision; placeholder until then).
