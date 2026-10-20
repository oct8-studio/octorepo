# octorepo

Scaffold multi-app Node/TypeScript monorepos: any number of frontends and backends, wired together, with **Nx** or **Turborepo**, Docker Compose, typed API clients, an optional Drizzle or Prisma database package and an MCP server for coding agents. Add more apps and services later with `npx @oct8/octorepo add app|service`.

<!-- TODO: demo GIF -->

An [oct8 studio](https://github.com/oct8-studio) project.

## How it compares

As of 2026-10-19, from each project's README, docs and issue tracker ([notes](docs/research/2026-10-19-market.md)):

| | octorepo | create-better-t-stack | create-turbo | create-nx-workspace | create-t3-turbo |
|---|---|---|---|---|---|
| Several frontends in one repo | yes | open PR (#1185) | via examples | yes (Nx generators) | Next.js + Expo |
| Several backends in one repo | yes | no | no | yes | no (tRPC package) |
| NestJS | yes | open PR (#1119) | no | yes | no |
| Docker Compose for apps and services | yes | database only | no | no | no |
| Agent integration | MCP server, Claude Code plugin, AGENTS.md | Claude Code plugin with MCP | agent skill, no MCP | MCP server, `configure-ai-agents` | none found |

## Quickstart

Requires Node >= 22.12 to run the CLI; generated repos target Node 24 (`.nvmrc`, `engines`, `node:24-alpine`). pnpm is used for generated repos.

```bash
npx @oct8/octorepo@latest create my-repo
```

Or, equivalently:

```bash
npm create @oct8/octorepo@latest my-repo
```

Run without flags in a terminal and octorepo asks for the stack interactively; the project name defaults to the directory name (`my-repo` above).

Without a `[dir]` argument the project is created in `./<name>`. In non-interactive mode the name then defaults to the current directory's name (or `name` in `--config`), so pass a directory to choose where it goes.

## Non-interactive use

```bash
npx @oct8/octorepo@latest create my-repo \
  --tool turbo \
  --app frontend:web:next:uses=api \
  --app backend:api:nest \
  --service postgres \
  --yes
```

`--app` takes `kind:name:framework[:uses=a,b]`, is repeatable, and `uses` lists the backends a frontend talks to (a typed client is generated for each).

Or describe the stack in JSON and pass `--config stack.json`:

```json
{
  "name": "my-repo",
  "monorepoTool": "nx",
  "apps": [
    { "name": "web", "kind": "frontend", "framework": "react-vite", "uses": ["api"] },
    { "name": "api", "kind": "backend", "framework": "express" }
  ],
  "services": ["postgres", "redis"]
}
```

Other `create` flags: `--orm drizzle|prisma` (see [Database](#database-orm)), `--preset <id>` (see [Presets](#presets)), `--no-install`, `--no-git`, `--force`, `--json` (machine-readable result), `--yes`.

## Presets

A preset is a ready-made stack. It is also the first question in interactive mode.

| Preset | Apps | Services | ORM |
|---|---|---|---|
| `saas` | `web` (next), `admin` (react-vite), `api` (nest), `worker` (fastify) | postgres, valkey, mailpit | drizzle |
| `api-platform` | `edge` (hono), `users` (nest), `billing` (fastify), `docs` (astro) | postgres, rabbitmq | prisma |

```bash
npx @oct8/octorepo@latest create my-saas --preset saas --yes
npx @oct8/octorepo@latest create my-api --preset api-platform --tool nx --app backend:jobs:koa --yes
```

`--tool` defaults to `turbo` with a preset. Extra `--app`/`--service` flags (or `apps`/`services` in `--config`) are added after the preset's; an app whose name the preset already uses is rejected. `--orm` overrides the preset's ORM. The manifest records the preset in `preset`. A `preset` key inside `--config` JSON is ignored: use `--preset`.

## Database (ORM)

`--orm drizzle` or `--orm prisma` adds a shared `packages/db` (`@<name>/db`) with a `greetings` schema, a first migration and a seed. Every backend depends on it and serves `GET /db/health` (`{ "ok": true, "greetings": 1 }` once seeded, 503 while the database is unreachable). An ORM needs Postgres, so `postgres` is added if you didn't pick it (reported as a fix). One ORM per repo.

Scripts, run with `pnpm --filter @<name>/db <script>`:

| Script | Drizzle | Prisma |
|---|---|---|
| `db:migration` | `drizzle-kit generate`: write a migration from schema changes | `prisma migrate dev`: write and apply a migration (needs a running database) |
| `db:migrate` | `drizzle-kit migrate`: apply committed migrations | `prisma migrate deploy`: apply committed migrations |
| `db:seed` | insert the sample greeting (idempotent) | same |
| `db:generate` | same as `db:migration` | regenerate the Prisma Client (the build runs it too) |

`db:generate` means different things in the two ORMs, so prefer `db:migration` for "make a migration" in scripts and docs. Commit the migrations. With Prisma, `packages/db/src/generated/**` (the generated Prisma Client) is tool-owned; Drizzle generates nothing there.

In Docker Compose, a one-shot `migrate` service runs `db:migrate` and `db:seed` after Postgres is healthy, and the backends start only once it has completed successfully. With `pnpm dev`, start Postgres (`docker compose up -d postgres`) and run `db:migrate` and `db:seed` yourself.

## Services

Docker Compose services, chosen with `--service` or added later with `add service`. Each has a healthcheck, publishes its ports on `127.0.0.1` only, and gives every backend its connection URL in `.env`. Credentials are for local development only.

| Service | Image | Env var | Localhost | UI / credentials |
|---|---|---|---|---|
| `postgres` | `postgres` | `DATABASE_URL` | 5432 | `postgres` / `postgres` |
| `redis` | `redis` | `REDIS_URL` | 6379 | no auth |
| `valkey` | `valkey/valkey` | `VALKEY_URL` | 6380 | no auth |
| `rabbitmq` | `rabbitmq` (management) | `AMQP_URL` | 5672 | UI http://localhost:15672, `app` / `app` |
| `mailpit` | `axllent/mailpit` | `SMTP_URL` | 1025 | inbox UI http://localhost:8025 |
| `s3` | `chrislusf/seaweedfs` (S3 API) | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | 8333 | key `octorepo` / `octorepo-local-secret`; the bucket is created on first upload |

Backends validate their environment at startup with zod (`src/generated/env.ts`, tool-owned and refreshed by `add`): a missing or malformed variable, such as `DATABASE_URL` in a repo with an ORM, stops the server with a message naming it.

## Supported options

| Category | Options |
|---|---|
| Backend frameworks | `express`, `fastify`, `hono`, `koa`, `nest` |
| Frontend frameworks | `next`, `react-vite`, `react-router`, `tanstack-start`, `vue-vite`, `nuxt`, `sveltekit`, `astro`, `solid-start` |
| Services (Docker Compose) | `postgres`, `redis`, `valkey`, `rabbitmq`, `mailpit`, `s3` |
| ORM | `drizzle`, `prisma` |
| Presets | `saas`, `api-platform` |
| Monorepo tool | `turbo`, `nx` |
| Package manager | `pnpm` |

## What gets generated

```
my-repo/
  apps/
    web/                # frontend
    api/                # backend (GET /health, GET /hello, openapi.json)
  packages/
    types/              # shared types + zod schemas
    config/             # shared tsconfig bases
    api-client/         # typed client generated from api's OpenAPI spec
    ui-react/           # shared components, one package per UI family in use:
    ui-vue/             #   ui-react (Next, React Vite, React Router, TanStack Start),
    ui-svelte/          #   ui-vue (Vue Vite, Nuxt), ui-svelte (SvelteKit), ui-solid (SolidStart);
    ui-solid/           #   Astro pages use plain markup
    db/                 # with --orm: schema, migrations, seed, client
  docker-compose.yml    # selected services + apps
  turbo.json | nx.json
  pnpm-workspace.yaml
  biome.json
  .github/workflows/    # CI
  .octorepo.json        # manifest used by `add`
  AGENTS.md             # repo guide for coding agents (CLAUDE.md imports it)
```

Each app ships a Dockerfile, and every workspace package has `build`, `dev`, `lint`, `typecheck` and `test` scripts.

`pnpm dev` builds the shared packages first, then runs every app in watch mode. Each app reads local settings from its own `.env`, a gitignored copy of `.env.example` written at generation time; backends allow CORS from the frontends that use them unless `CORS_ORIGINS` is set. `docker compose up` publishes ports on `127.0.0.1` only.

Frontends call their backends in one of two ways. SPAs (`react-vite`, `vue-vite`) read `VITE_<BACKEND>_URL` at build time. SSR frameworks call backends on the server and read `<BACKEND>_URL` at request time (Docker Compose sets it), falling back to `http://localhost:<backend port>`. Next.js, Nuxt (`nuxt dev`) and Astro (`astro dev`) load the app's `.env`. The other SSR frameworks read env from the process only (Compose sets it, or export it from `.env` in your shell), and built servers never load `.env`; the fallback is the same as the `.env.example` default, so `pnpm dev` works anyway. Set the variable in your shell to point elsewhere. If a backend is down, the page shows it as "unreachable" and the build doesn't fail. Each SSR image's `HEALTHCHECK` requests `/`, which also calls the backends; that's harmless.

## Add an app

From the root of a generated repo:

```bash
npx @oct8/octorepo add app backend billing nest
npx @oct8/octorepo add app frontend admin react-vite --uses api,billing
```

`add` regenerates only tool-owned files (root `package.json` merge, workspace file, `turbo.json`/`nx.json`, compose, clients, `src/generated/**`); your own code is never rewritten.

`add` also patches the root `.gitignore`, `.dockerignore` and `biome.json` when they miss entries that the current version generates. It only adds entries: missing ignore lines are appended, missing `files.includes` exclusions are appended, and `html.experimentalFullSupportEnabled` is set unless you set it yourself.

Add a service the same way:

```bash
npx @oct8/octorepo add service rabbitmq
```

It regenerates `docker-compose.yml`, the root `.env.example`, the manifest, each backend's `src/generated/env.ts` and the `AGENTS.md` section, and appends the service's variables to each backend's `.env` and `.env.example` (existing lines are kept; a backend without a `.env` gets a copy of its updated `.env.example`). Adding a service the repo already has changes nothing; it also doesn't restore variables you deleted from `.env`.

### Upgrading from 0.1.x

Repos generated by 0.1.x don't ignore the build output of the newer frameworks (Nuxt, SvelteKit and the rest), so `pnpm lint` would lint `.nuxt` or `.svelte-kit`. Running `add app` or `add service` with 0.3.0 or later fixes the three root files as described above. Their backends also don't run the startup env check until you opt them in. See [Upgrading from 0.1.x](CHANGELOG.md#upgrading-from-01x) in the changelog for both, including the lines to add by hand if you upgrade without running `add`.

## Use with AI agents

`npx @oct8/octorepo mcp` runs an [MCP](https://modelcontextprotocol.io) server on stdio, so coding agents can scaffold and extend repos with the same engine as the CLI. Tools:

| Tool | Input | Returns |
|---|---|---|
| `list_options` | none | tools, frameworks, services, ORMs and presets (same as `octorepo options --json`) |
| `validate_stack` | a stack config (the `--config` JSON) | `{ stack, errors, warnings, fixes }`; writes nothing |
| `create` | `{ dir, stack, preset?, install?, git? }` | the `create --json` result |
| `add_app` | `{ cwd, app, install? }` | the `add app --json` result |
| `add_service` | `{ cwd, service }` | the `add service --json` result |
| `read_manifest` | `{ cwd }` | the repo's `.octorepo.json` |

Relative `dir` and `cwd` resolve against the directory the server runs in, and `create`/`add_app`/`add_service` refuse exactly where the CLI does (non-empty directory, invalid stack, existing app, unknown service). `stack.name` defaults to the directory name, and with `preset` set `stack.monorepoTool` defaults to `turbo`.

Every generated repo has an `AGENTS.md` (and a `CLAUDE.md` that imports it) describing the apps, packages, services and their local URLs, the commands, and which files are tool-owned. octorepo rewrites only the part between `<!-- octorepo:begin -->` and `<!-- octorepo:end -->`, so add your own notes outside the markers. octorepo never writes `.mcp.json` into a generated repo; wiring up MCP servers is your choice.

**Claude Code**: add the server to the current project,

```bash
claude mcp add octorepo -- npx -y @oct8/octorepo mcp
```

or load the plugin in [`integrations/claude-code`](integrations/claude-code), which bundles the server with an `octorepo` skill and a `/octorepo:new` command:

```bash
claude --plugin-dir ./integrations/claude-code
```

**Cursor**: add to `.cursor/mcp.json` (or `~/.cursor/mcp.json` for every project):

```json
{
  "mcpServers": {
    "octorepo": { "command": "npx", "args": ["-y", "@oct8/octorepo", "mcp"] }
  }
}
```

**Any other MCP client**: run `npx -y @oct8/octorepo mcp` as a stdio server; the `mcpServers` entry above is the usual shape.

Without MCP, `npx @oct8/octorepo options --json` lists the options and `create`/`add app` take `--json` for machine-readable results.

## Roadmap

tRPC/oRPC, Better Auth, `doctor`/`upgrade`, Playwright, microservices, GraphQL, gRPC, Elysia, Angular.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
