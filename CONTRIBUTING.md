# Contributing to octorepo

Thanks for helping. Requirements: Node >= 22.12 and pnpm.

```bash
pnpm install
pnpm vitest run     # unit tests
pnpm lint           # biome
pnpm typecheck
pnpm build          # tsdown -> dist/
```

Conventions: ESM TypeScript, extensionless imports, tests in `tests/` mirroring `src/`. Every dependency version written into generated repos lives in `src/versions.ts` as an exact version; never hard-code versions in plugins or templates. The CLI name lives in `src/meta.ts` only.

## Adding a framework plugin

A framework plugin turns one `AppSpec` into the files of one app (`apps/<name>/**`) plus its Dockerfile.

### Folder layout

```
src/plugins/<frontend|backend>/<id>/
  index.ts          # exports the FrameworkPlugin
  files/**/*.tpl    # static template files
tests/plugins/<id>.test.ts
```

Use `src/plugins/backend/express` (backend) and `src/plugins/frontend/react-vite` (frontend) as references.

### The `FrameworkPlugin` contract

Defined in `src/plugins/types.ts`:

```ts
interface FrameworkPlugin {
  id: string          // e.g. 'fastify'
  kind: AppKind       // 'frontend' | 'backend'
  label: string
  apiStyles: string[] // e.g. ['rest']; empty for frontends
  defaultPort: number
  generate(ctx: AppContext): FileTree      // paths relative to the repo root
  dockerfile(ctx: AppContext): string
}
```

`generate` receives `ctx.app` (with a resolved `port`), `ctx.scope` (`@<project>`), `ctx.versions` and, for frontends, `ctx.backends` (the resolved `uses`). It returns a `FileTree` (`path -> contents`).

- **Templates**: put static files in `files/` with a `.tpl` suffix and load them with `readPluginFiles(new URL('./', import.meta.url), vars)`. The `.tpl` suffix is stripped and `{{key}}` placeholders are replaced from `vars`. Biome ignores these directories. Prefix each returned path with `apps/<name>/`.
- **package.json**: build it in code with `json({...})`, taking every dependency version from `ctx.versions`.
- **`files` field (ruling R12)**: every app/package `package.json` declares `files` (apps: `dist` plus runtime assets such as `openapi.json`) so `pnpm deploy` ships the build output. Next.js apps are exempt (they ship `.next/standalone`).
- **Scripts**: every app has `build`, `dev`, `lint` (`biome check`), `typecheck` (`tsc --noEmit`) and `test` (`vitest run`). Generated source must pass `biome check` as generated.
- **Dockerfile**: node services can use `nodeServiceDockerfile(ctx, { startCmd })` from `src/engine/docker.ts`.

### Backend HTTP contract

Every backend must provide:

- `GET /health` returns `{ "status": "ok" }`
- `GET /hello` returns `{ "message": "Hello from <app>" }` (typed with `HelloResponse` from `@<scope>/types`)
- its `build` script writes `apps/<app>/openapi.json`, which `restClientFiles` turns into the typed `packages/<app>-client`
- configuration via env: `PORT` and `CORS_ORIGINS` (comma-separated)

Frontends consume backends through the generated `src/generated/api.ts` clients (variable name `<camelCase(backend)>Client`; env var `<UPPER_SNAKE>_URL`, prefixed `VITE_` for Vite). See `src/engine/names.ts`.

### Register it

Add the plugin to `defaultRegistry()` in `src/plugins/registry.ts`:

```ts
.registerFramework(fastifyPlugin)
```

If it needs new compatibility rules, add them in `src/rules/rules.ts`.

### Cover it in the e2e matrix

Add the framework to `FRONTENDS` or `BACKENDS` in `scripts/combos.ts`, so `COMBOS` includes it for every monorepo tool. Then run the end-to-end check, which generates the repo with install on, runs lint, typecheck, test and build, plus a `docker build` per app:

```bash
pnpm tsx scripts/e2e.ts next-nest-turbo            # one combo id
pnpm tsx scripts/e2e.ts next-nest-turbo --compose  # also boots docker compose and checks /health
```

Also add a unit test in `tests/plugins/<id>.test.ts` (metadata, generated `package.json`, key files).

### Packaging

Templates ship through `tsdown.config.ts`, which keeps the module layout (`unbundle`) and copies every `src/plugins/*/*/files` directory into `dist`. New plugins following the layout above need no packaging changes. Verify with `pnpm build && pnpm pack --dry-run`.

## Commits

Conventional style (`feat:`, `fix:`, `docs:`, `build:`). Keep PRs focused and make sure `pnpm vitest run && pnpm lint && pnpm typecheck` pass.
