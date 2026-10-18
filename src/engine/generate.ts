import { CLI_VERSION } from '../meta'
import { CliError } from '../model/errors'
import type { Manifest, StackConfig } from '../model/stack'
import type { Registry } from '../plugins/registry'
import type { AppContext, FileTree, ProjectContext, ResolvedApp } from '../plugins/types'
import { VERSIONS } from '../versions'
import { restClientFiles } from './client'
import { composeFiles, corsOrigins, serviceEnv } from './compose'
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

/** Backend `.env.example`: the plugin's template with CORS_ORIGINS and service URLs set for this stack. */
function backendEnv(
  tree: FileTree,
  path: string,
  cors: string,
  extra: Record<string, string>,
): string {
  const base = (tree[path] ?? '').replace(/^CORS_ORIGINS=.*$/m, `CORS_ORIGINS=${cors}`)
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

  const cors = corsOrigins(stack)
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
    if (app.kind === 'backend') {
      const env = `apps/${app.name}/.env.example`
      tree[env] = backendEnv(tree, env, cors, localServiceEnv)
    }
    trees.push(tree)
  }

  trees.push(composeFiles(ctx, reg))
  return mergeTrees(...trees)
}
