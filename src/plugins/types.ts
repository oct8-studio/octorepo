import type { FileTree } from '../engine/tree'
import type { AppKind, AppSpec, MonorepoTool, StackConfig } from '../model/stack'
import type { VERSIONS } from '../versions'

export type { FileTree }

export interface ProjectContext {
  stack: StackConfig
  /** '@<name>' */
  scope: string
  versions: typeof VERSIONS
}

export type ResolvedApp = AppSpec & { port: number }

export interface AppContext extends ProjectContext {
  app: ResolvedApp
  /** Resolved `uses`, frontends only. */
  backends: ResolvedApp[]
}

export interface MonorepoPlugin {
  id: MonorepoTool
  label: string
  /** CI build step, e.g. an "affected" build; defaults to `pnpm build`. */
  ciBuildCommand?: string
  generate(ctx: ProjectContext): FileTree
}

export interface FrameworkPlugin {
  id: string
  kind: AppKind
  label: string
  /** Empty for frontends. */
  apiStyles: string[]
  defaultPort: number
  generate(ctx: AppContext): FileTree
  dockerfile(ctx: AppContext): string
}

export interface ServicePlugin {
  id: string
  label: string
  compose(ctx: ProjectContext): {
    image: string
    ports?: string[]
    environment?: Record<string, string>
    volumes?: string[]
    healthcheck?: object
  }
  /**
   * Connection env vars, e.g. DATABASE_URL. `host` defaults to the compose service name;
   * pass 'localhost' for local development outside compose.
   */
  env(ctx: ProjectContext, host?: string): Record<string, string>
}
