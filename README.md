# octorepo

Scaffold multi-app Node/TypeScript monorepos: any number of frontends and backends, wired together, with **Nx** or **Turborepo**, Docker Compose and typed API clients. Add more apps later with `npx octorepo add app`.

<!-- TODO: demo GIF -->

An [oct8 studio](https://github.com/oct8-studio) project.

## Quickstart

Requires Node >= 22.12 to run the CLI; generated repos target Node 24 (`.nvmrc`, `engines`, `node:24-alpine`). pnpm is used for generated repos.

```bash
npx octorepo create my-repo
```

`npm create octorepo` will work once the `create-octorepo` package is published.

Run without flags in a terminal and octorepo asks for the stack interactively; the project name defaults to the directory name (`my-repo` above).

Without a `[dir]` argument the project is created in `./<name>`. In non-interactive mode the name then defaults to the current directory's name (or `name` in `--config`), so pass a directory to choose where it goes.

## Non-interactive use

```bash
npx octorepo create my-repo \
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

Other `create` flags: `--no-install`, `--no-git`, `--force`, `--json` (machine-readable result), `--yes`.

## Supported options (Plan 1)

| Category | Options |
|---|---|
| Backend frameworks | `express`, `nest` |
| Frontend frameworks | `next`, `react-vite` |
| Services (Docker Compose) | `postgres`, `redis` |
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
    ui-react/           # shared React components
  docker-compose.yml    # selected services + apps
  turbo.json | nx.json
  pnpm-workspace.yaml
  biome.json
  .github/workflows/    # CI
  .octorepo.json        # manifest used by `add`
```

Each app ships a Dockerfile, and every workspace package has `build`, `dev`, `lint`, `typecheck` and `test` scripts.

`pnpm dev` builds the shared packages first, then runs every app in watch mode. Each app reads local settings from its own `.env`, a gitignored copy of `.env.example` written at generation time; backends allow CORS from the frontends that use them unless `CORS_ORIGINS` is set. `docker compose up` publishes ports on `127.0.0.1` only.

## Add an app

From the root of a generated repo:

```bash
npx octorepo add app backend billing nest
npx octorepo add app frontend admin react-vite --uses api,billing
```

`add` regenerates only tool-owned files (root `package.json` merge, workspace file, `turbo.json`/`nx.json`, compose, clients, `src/generated/**`); your own code is never rewritten.

## Roadmap

Fastify, Hono, TanStack Start, Vue, Nuxt, SvelteKit, tRPC, Prisma/Drizzle, microservices, GraphQL, gRPC.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
