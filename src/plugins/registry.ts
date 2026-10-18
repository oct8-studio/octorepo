import type { AppKind, MonorepoTool } from '../model/stack'
import type { FrameworkPlugin, MonorepoPlugin, ServicePlugin } from './types'

export class Registry {
  readonly monorepo = new Map<MonorepoTool, MonorepoPlugin>()
  readonly frameworks = new Map<string, FrameworkPlugin>()
  readonly services = new Map<string, ServicePlugin>()

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

  frameworksOf(kind: AppKind): FrameworkPlugin[] {
    return [...this.frameworks.values()].filter((f) => f.kind === kind)
  }
}

/** Empty until Task 12 registers every plugin. */
export function defaultRegistry(): Registry {
  return new Registry()
}
