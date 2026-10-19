import { parse, stringify } from 'yaml'
import { CLI_VERSION } from '../meta'
import { CliError } from '../model/errors'
import type { Manifest, StackConfig } from '../model/stack'
import type { Registry } from '../plugins/registry'
import type { AppContext, FileTree, ProjectContext, ResolvedApp, UiFamily } from '../plugins/types'
import { VERSIONS } from '../versions'
import { restClientFiles } from './client'
import { composeFiles, serviceEnv } from './compose'
import { mergeTrees } from './tree'
import { workspaceFiles } from './workspace'

function resolve(app: StackConfig['apps'][number]): ResolvedApp {
  if (app.port === undefined)
    throw new CliError(`App "${app.name}" has no port; validate the stack first`)
  return { ...app, port: app.port }
}

/** Appends service URLs (e.g. DATABASE_URL on localhost) to a backend's `.env.example`. */
function withServiceEnv(base: string, extra: Record<string, string>): string {
  const lines = Object.entries(extra).map(([k, v]) => `${k}=${v}\n`)
  return `${base}${base && !base.endsWith('\n') ? '\n' : ''}${lines.join('')}`
}

/** The generated `pnpm-workspace.yaml` with extra dependencies allowed to run install scripts. */
function allowBuilds(workspace: FileTree, deps: string[]): FileTree {
  const doc = parse(workspace['pnpm-workspace.yaml'] ?? '') ?? {}
  doc.allowBuilds = { ...doc.allowBuilds, ...Object.fromEntries(deps.map((d) => [d, true])) }
  return { 'pnpm-workspace.yaml': stringify(doc) }
}

/** Generates the whole repository. Expects a stack already validated (ports and apiStyles assigned). */
export function generateProject(stack: StackConfig, reg: Registry): FileTree {
  const ctx: ProjectContext = { stack, scope: `@${stack.name}`, versions: VERSIONS }
  const mono = reg.monorepoTool(stack.monorepoTool)
  if (!mono) throw new CliError(`Unknown monorepo tool "${stack.monorepoTool}"`)
  const manifest: Manifest = { ...stack, schemaVersion: 1, cliVersion: CLI_VERSION }

  const apps = stack.apps.map(resolve)
  const trees: FileTree[] = [
    workspaceFiles(ctx, manifest, { ciBuildCommand: mono.ciBuildCommand }),
    mono.generate(ctx),
  ]
  for (const b of apps.filter((a) => a.kind === 'backend')) trees.push(restClientFiles(ctx, b))
  // One shared UI package per component family the frontends use (ui-react, ui-vue, ...).
  const families = new Set<UiFamily>()
  for (const a of apps.filter((a) => a.kind === 'frontend')) {
    const family = reg.framework(a.framework, 'frontend')?.uiFamily
    if (family) families.add(family)
  }
  for (const family of families) {
    const gen = reg.ui(family)
    if (!gen) throw new CliError(`No UI package generator registered for family "${family}"`)
    trees.push(gen(ctx))
  }

  const localServiceEnv = serviceEnv(ctx, reg, 'localhost')
  const requiredEnv = [
    ...new Set([...Object.keys(localServiceEnv), ...(stack.orm ? ['DATABASE_URL'] : [])]),
  ]
  for (const app of apps) {
    const plugin = reg.framework(app.framework, app.kind)
    if (!plugin) throw new CliError(`Unknown ${app.kind} framework "${app.framework}"`)
    const appCtx: AppContext = {
      ...ctx,
      app,
      backends: apps.filter((b) => b.kind === 'backend' && app.uses?.includes(b.name)),
      serviceEnv: requiredEnv,
    }
    const tree = plugin.generate(appCtx)
    tree[`apps/${app.name}/Dockerfile`] = plugin.dockerfile(appCtx)
    const example = `apps/${app.name}/.env.example`
    if (app.kind === 'backend') tree[example] = withServiceEnv(tree[example] ?? '', localServiceEnv)
    // A real, gitignored .env with the same local-dev values, so `pnpm dev` works out of the box.
    if (tree[example] !== undefined) tree[`apps/${app.name}/.env`] = tree[example]
    trees.push(tree)
  }

  if (stack.orm) {
    const orm = reg.orm(stack.orm)
    if (!orm) throw new CliError(`Unknown ORM "${stack.orm}"`)
    trees.push(orm.generate(ctx))
    if (orm.allowBuilds?.length) trees.push(allowBuilds(mergeTrees(...trees), orm.allowBuilds))
  }

  trees.push(composeFiles(ctx, reg))
  return mergeTrees(...trees)
}
