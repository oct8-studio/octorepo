---
name: octorepo
description: Scaffold a new multi-app TypeScript monorepo (Turborepo or Nx, pnpm), optionally from a preset and with a Drizzle or Prisma database package, or add a frontend/backend app or a Docker Compose service to one created by octorepo. Use when the user asks to start a monorepo, full-stack project or workspace with several apps, or to add an app or service to a repo that has an .octorepo.json.
---

# octorepo

octorepo generates pnpm monorepos with any number of frontends and backends, shared packages, typed API clients (one per backend a frontend `uses`), Docker Compose services, an optional ORM package (`packages/db`), an `AGENTS.md` and CI. The `octorepo` MCP server exposes it as tools. Prefer the tools over hand-writing the same scaffold.

## Tools

| Tool | Use it to |
|---|---|
| `list_options` | See which monorepo tools, frameworks, services, ORMs and presets exist. Never guess an id. |
| `validate_stack` | Check a stack before writing anything. Returns the normalized `stack` (ports assigned), `errors`, `warnings` and applied `fixes`. |
| `create` | Write a new repo into an empty or missing `dir`. |
| `read_manifest` | Read `.octorepo.json` of an existing repo: its apps, services and tool. |
| `add_app` | Add one app to an existing repo. Only tool-owned files are rewritten; user code is left alone. |
| `add_service` | Add one compose service (e.g. `rabbitmq`, `s3`) to an existing repo; a no-op if it is already there. |

Relative `dir`/`cwd` paths resolve against the directory the server was started in (the project you have open).

## New repo

1. Call `list_options`.
2. Build a stack from what the user asked for. Ask only about choices that matter and that they did not state (monorepo tool, frameworks). Example:

   ```json
   {
     "name": "my-repo",
     "monorepoTool": "turbo",
     "apps": [
       { "name": "web", "kind": "frontend", "framework": "next", "uses": ["api"] },
       { "name": "api", "kind": "backend", "framework": "express" }
     ],
     "services": ["postgres"]
   }
   ```

   - App names are lowercase kebab-case and unique.
   - `uses` lists the backends a frontend talks to; a typed client is generated for each.
   - Leave `port` out unless the user asked for one; ports are assigned.
   - For a database, set `"orm": "drizzle"` or `"prisma"`; `postgres` is added if missing.
   - If a preset from `list_options` fits, pass it as `create`'s `preset` input (not inside `stack`); `stack.apps` then only lists extra apps, and `monorepoTool` defaults to `turbo`.
3. Call `validate_stack` with it. Fix every error and call it again until `errors` is empty. Tell the user about `fixes` and `warnings`.
4. Call `create` with `{ dir, stack }` (plus `preset` if you chose one). `name` defaults to the directory name. `install` and `git` default to `true`; pass `false` only when the user wants to skip them. Pass `kbee: true` when the user wants a kbee knowledge base for their agents (needs `git`).
5. Report `root` and the `manual` steps from the result, then `pnpm dev` to start everything. With kbee, add: make the first commit, then run `/kbee init`.

If `create` returns an error (for example the directory is not empty), show the message to the user and ask; do not delete or overwrite their files.

## Existing repo

1. Call `read_manifest` with `{ cwd }` to see what is there.
2. Call `add_app` with `{ cwd, app: { name, kind, framework, uses? } }`, or `add_service` with `{ cwd, service }`.
3. Report `written`, `fixes`, `warnings` and any `manual` steps.

Prefer `add_app` over hand-editing tool-owned files (root `package.json`, `pnpm-workspace.yaml`, `turbo.json`/`nx.json`, `docker-compose.yml`, `packages/*-client/**`, `apps/*/src/generated/**`, `packages/db/src/generated/**`, `.octorepo.json`, the marked section of `AGENTS.md`); `add_app` and `add_service` regenerate them.

## Without the MCP server

The same operations exist on the CLI with machine-readable output:

```bash
npx -y @oct8/octorepo@latest options --json
npx -y @oct8/octorepo@latest create my-repo --config stack.json --yes --json
npx -y @oct8/octorepo@latest add app backend billing nest --json
npx -y @oct8/octorepo@latest add service mailpit --json
```
