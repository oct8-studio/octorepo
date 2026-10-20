import { uiPackageFiles } from '../engine/ui'
import { uiSolidPackageFiles } from '../engine/ui-solid'
import { uiSveltePackageFiles } from '../engine/ui-svelte'
import { uiVuePackageFiles } from '../engine/ui-vue'
import type { AppKind, MonorepoTool, OrmId } from '../model/stack'
import { expressPlugin } from './backend/express'
import { fastifyPlugin } from './backend/fastify'
import { honoPlugin } from './backend/hono'
import { koaPlugin } from './backend/koa'
import { nestPlugin } from './backend/nest'
import { astroPlugin } from './frontend/astro'
import { nextPlugin } from './frontend/next'
import { nuxtPlugin } from './frontend/nuxt'
import { reactRouterPlugin } from './frontend/react-router'
import { reactVitePlugin } from './frontend/react-vite'
import { solidStartPlugin } from './frontend/solid-start'
import { sveltekitPlugin } from './frontend/sveltekit'
import { tanstackStartPlugin } from './frontend/tanstack-start'
import { vueVitePlugin } from './frontend/vue-vite'
import { nxPlugin } from './monorepo/nx'
import { turboPlugin } from './monorepo/turbo'
import { drizzlePlugin } from './orm/drizzle'
import { prismaPlugin } from './orm/prisma'
import { mailpitPlugin } from './service/mailpit'
import { postgresPlugin } from './service/postgres'
import { rabbitmqPlugin } from './service/rabbitmq'
import { redisPlugin } from './service/redis'
import { s3Plugin } from './service/s3'
import { valkeyPlugin } from './service/valkey'
import type {
  FrameworkPlugin,
  MonorepoPlugin,
  OrmPlugin,
  ServicePlugin,
  UiFamily,
  UiPackageGenerator,
} from './types'

export class Registry {
  readonly monorepo = new Map<MonorepoTool, MonorepoPlugin>()
  readonly frameworks = new Map<string, FrameworkPlugin>()
  readonly services = new Map<string, ServicePlugin>()
  readonly uiPackages = new Map<UiFamily, UiPackageGenerator>()
  readonly orms = new Map<OrmId, OrmPlugin>()

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

  registerOrm(plugin: OrmPlugin): this {
    this.orms.set(plugin.id, plugin)
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

  orm(id: string): OrmPlugin | undefined {
    return this.orms.get(id as OrmId)
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
    .registerFramework(fastifyPlugin)
    .registerFramework(honoPlugin)
    .registerFramework(koaPlugin)
    .registerFramework(reactVitePlugin)
    .registerFramework(nextPlugin)
    .registerFramework(vueVitePlugin)
    .registerFramework(nuxtPlugin)
    .registerFramework(sveltekitPlugin)
    .registerFramework(astroPlugin)
    .registerFramework(tanstackStartPlugin)
    .registerFramework(reactRouterPlugin)
    .registerFramework(solidStartPlugin)
    .registerService(postgresPlugin)
    .registerService(redisPlugin)
    .registerService(valkeyPlugin)
    .registerService(rabbitmqPlugin)
    .registerService(mailpitPlugin)
    .registerService(s3Plugin)
    .registerOrm(drizzlePlugin)
    .registerOrm(prismaPlugin)
    .registerUi('react', (ctx) => uiPackageFiles(ctx, 'react'))
    .registerUi('vue', uiVuePackageFiles)
    .registerUi('svelte', uiSveltePackageFiles)
    .registerUi('solid', uiSolidPackageFiles)
}
