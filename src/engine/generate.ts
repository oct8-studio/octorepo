import { CLI_VERSION } from '../meta'
import { CliError } from '../model/errors'
import type { Manifest, StackConfig } from '../model/stack'
import type { Registry } from '../plugins/registry'
import type { AppContext, FileTree, ProjectContext, ResolvedApp } from '../plugins/types'
import { VERSIONS } from '../versions'
import { restClientFiles } from './client'
import { composeFiles, serviceEnv } from './compose'
import { mergeTrees } from './tree'
import { uiPackageFiles } from './ui'
import { workspaceFiles } from './workspace'

/** Frontend frameworks that consume the shared `ui-react` package. */
const REACT_FRAMEWORKS = new Set(['react-vite', 'next'])

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
  if (apps.some((a) => a.kind === 'frontend' && REACT_FRAMEWORKS.has(a.framework))) {
    trees.push(uiPackageFiles(ctx, 'react'))
  }

  const localServiceEnv = serviceEnv(ctx, reg, 'localhost')
  for (const app of apps) {
    const plugin = reg.framework(app.framework, app.kind)
    if (!plugin) throw new CliError(`Unknown ${app.kind} framework "${app.framework}"`)
    const appCtx: AppContext = {
      ...ctx,
      app,
      backends: apps.filter((b) => b.kind === 'backend' && app.uses?.includes(b.name)),
    }
    const tree = plugin.generate(appCtx)
    tree[`apps/${app.name}/Dockerfile`] = plugin.dockerfile(appCtx)
    const example = `apps/${app.name}/.env.example`
    if (app.kind === 'backend') tree[example] = withServiceEnv(tree[example] ?? '', localServiceEnv)
    // A real, gitignored .env with the same local-dev values, so `pnpm dev` works out of the box.
    if (tree[example] !== undefined) tree[`apps/${app.name}/.env`] = tree[example]
    trees.push(tree)
  }

  trees.push(composeFiles(ctx, reg))
  return mergeTrees(...trees)
}
