import { uiPackageFiles } from '../engine/ui'
import type { AppKind, MonorepoTool } from '../model/stack'
import { expressPlugin } from './backend/express'
import { nestPlugin } from './backend/nest'
import { nextPlugin } from './frontend/next'
import { reactVitePlugin } from './frontend/react-vite'
import { nxPlugin } from './monorepo/nx'
import { turboPlugin } from './monorepo/turbo'
import { postgresPlugin } from './service/postgres'
import { redisPlugin } from './service/redis'
import type {
  FrameworkPlugin,
  MonorepoPlugin,
  ServicePlugin,
  UiFamily,
  UiPackageGenerator,
} from './types'

export class Registry {
  readonly monorepo = new Map<MonorepoTool, MonorepoPlugin>()
  readonly frameworks = new Map<string, FrameworkPlugin>()
  readonly services = new Map<string, ServicePlugin>()
  readonly uiPackages = new Map<UiFamily, UiPackageGenerator>()

  registerMonorepo(plugin: MonorepoPlugin): this {
    this.monorepo.set(plugin.id, plugin)
    return this
  }

  registerFramework(plugin: FrameworkPlugin): this {
    this.frameworks.set(plugin.id, plugin)
    return this
  }

  registerService(plugin: ServicePlugin): this {
    this.services.set(plugin.id, plugin)
    return this
  }

  registerUi(family: UiFamily, gen: UiPackageGenerator): this {
    this.uiPackages.set(family, gen)
    return this
  }

  monorepoTool(id: MonorepoTool): MonorepoPlugin | undefined {
    return this.monorepo.get(id)
  }

  framework(id: string, kind?: AppKind): FrameworkPlugin | undefined {
    const f = this.frameworks.get(id)
    return f && (kind === undefined || f.kind === kind) ? f : undefined
  }

  service(id: string): ServicePlugin | undefined {
    return this.services.get(id)
  }

  ui(family: UiFamily): UiPackageGenerator | undefined {
    return this.uiPackages.get(family)
  }

  frameworksOf(kind: AppKind): FrameworkPlugin[] {
    return [...this.frameworks.values()].filter((f) => f.kind === kind)
  }
}

/** A registry with every built-in plugin. */
export function defaultRegistry(): Registry {
  return new Registry()
    .registerMonorepo(turboPlugin)
    .registerMonorepo(nxPlugin)
    .registerFramework(expressPlugin)
    .registerFramework(nestPlugin)
    .registerFramework(reactVitePlugin)
    .registerFramework(nextPlugin)
    .registerService(postgresPlugin)
    .registerService(redisPlugin)
    .registerUi('react', (ctx) => uiPackageFiles(ctx, 'react'))
}
