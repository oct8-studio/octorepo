import type { AppSpec, StackConfig } from '../model/stack'
import type { Registry } from '../plugins/registry'

export interface Issue {
  rule: string
  level: 'error' | 'warning' | 'fix'
  message: string
  app?: string
}

export interface Rule {
  id: string
  check(stack: StackConfig, reg: Registry): { issues: Issue[]; stack?: StackConfig }
}

const NAME_RE = /^[a-z][a-z0-9-]*$/
const RESERVED = ['packages', 'apps', 'node_modules', 'gateway', 'config', 'types']

const err = (rule: string, message: string, app?: string): Issue => ({
  rule,
  level: 'error',
  message,
  ...(app !== undefined ? { app } : {}),
})

function nameProblem(name: string): string | undefined {
  if (!NAME_RE.test(name)) return 'must match /^[a-z][a-z0-9-]*$/'
  if (RESERVED.includes(name)) return `"${name}" is reserved`
  return undefined
}

type NamedApp = Pick<AppSpec, 'name' | 'kind'>

/** Workspace packages the generator creates next to the apps (unscoped name → what it is). */
function generatedPackages(apps: NamedApp[]): Map<string, string> {
  const pkgs = new Map([
    ['ui-react', 'shared React UI package'],
    ['ui-vue', 'shared Vue UI package'],
    ['ui-svelte', 'shared Svelte UI package'],
    ['ui-solid', 'shared Solid UI package'],
  ])
  for (const a of apps) {
    if (a.kind === 'backend') pkgs.set(`${a.name}-client`, `typed client of backend "${a.name}"`)
  }
  return pkgs
}

/**
 * Why `app` cannot join `existing` (format, reserved, duplicate or a clash with a generated
 * package name), or undefined. Prompts use it to validate names inline with validateStack's rules.
 */
export function appNameProblem(app: NamedApp, existing: NamedApp[]): string | undefined {
  const problem = nameProblem(app.name)
  if (problem) return problem
  const key = app.name.toLowerCase()
  if (existing.some((e) => e.name.toLowerCase() === key)) return 'is a duplicate app name'
  const generated = generatedPackages([...existing, app]).get(app.name)
  if (generated) return `collides with the generated package ${app.name} (${generated})`
  const clash = app.kind === 'backend' && existing.find((e) => e.name === `${app.name}-client`)
  if (clash) return `would generate package ${clash.name}, which collides with app "${clash.name}"`
  return undefined
}

const atLeastOneApp: Rule = {
  id: 'at-least-one-app',
  check: (stack) => ({
    issues:
      stack.apps.length === 0 ? [err('at-least-one-app', 'At least one app is required')] : [],
  }),
}

const appNameValid: Rule = {
  id: 'app-name-valid',
  check: (stack) => {
    const issues: Issue[] = []
    if (!NAME_RE.test(stack.name)) {
      issues.push(
        err('app-name-valid', `Project name "${stack.name}" must match /^[a-z][a-z0-9-]*$/`),
      )
    }
    const seen = new Set<string>()
    const generated = generatedPackages(stack.apps)
    for (const app of stack.apps) {
      // Case-insensitive uniqueness: directories collide on case-insensitive filesystems.
      const key = app.name.toLowerCase()
      const pkg = generated.get(app.name)
      const problem =
        nameProblem(app.name) ??
        (seen.has(key) ? 'is a duplicate app name' : undefined) ??
        // Apps and generated packages share the @<project>/ scope.
        (pkg
          ? `collides with the generated package @${stack.name}/${app.name} (${pkg})`
          : undefined)
      seen.add(key)
      if (problem) issues.push(err('app-name-valid', `App name "${app.name}" ${problem}`, app.name))
    }
    return { issues }
  },
}

const frameworkKnown: Rule = {
  id: 'framework-known',
  check: (stack, reg) => ({
    issues: stack.apps.flatMap((app) => {
      if (reg.framework(app.framework, app.kind)) return []
      const valid = reg
        .frameworksOf(app.kind)
        .map((f) => f.id)
        .join(', ')
      return [
        err(
          'framework-known',
          `Unknown ${app.kind} framework "${app.framework}". Valid: ${valid}`,
          app.name,
        ),
      ]
    }),
  }),
}

const apiStyle: Rule = {
  id: 'api-style',
  check: (stack, reg) => {
    const issues: Issue[] = []
    const apps = stack.apps.map((app) => {
      if (app.kind === 'frontend') {
        if (app.apiStyle !== undefined) {
          issues.push(err('api-style', `Frontend "${app.name}" must not set apiStyle`, app.name))
        }
        return app
      }
      const plugin = reg.framework(app.framework, 'backend')
      if (!plugin) return app
      if (app.apiStyle === undefined) {
        const style = plugin.apiStyles[0]
        if (style === undefined) return app
        issues.push({
          rule: 'api-style',
          level: 'fix',
          message: `Set apiStyle of "${app.name}" to "${style}"`,
          app: app.name,
        })
        return { ...app, apiStyle: style }
      }
      if (!plugin.apiStyles.includes(app.apiStyle)) {
        issues.push(
          err(
            'api-style',
            `apiStyle "${app.apiStyle}" is not supported by ${app.framework}. Supported: ${plugin.apiStyles.join(', ')}`,
            app.name,
          ),
        )
      }
      return app
    })
    return { issues, stack: { ...stack, apps } }
  },
}

const usesValid: Rule = {
  id: 'uses-valid',
  check: (stack) => {
    const backends = new Set(stack.apps.filter((a) => a.kind === 'backend').map((a) => a.name))
    const issues: Issue[] = []
    for (const app of stack.apps) {
      if (app.kind === 'backend') {
        if (app.uses?.length) {
          issues.push(err('uses-valid', `Backend "${app.name}" must not use other apps`, app.name))
        }
        continue
      }
      for (const u of app.uses ?? []) {
        if (!backends.has(u)) {
          issues.push(
            err('uses-valid', `"${app.name}" uses "${u}", which is not a backend app`, app.name),
          )
        }
      }
    }
    return { issues }
  },
}

const frontendWithoutBackend: Rule = {
  id: 'frontend-without-backend',
  check: (stack) => ({
    issues: stack.apps
      .filter((a) => a.kind === 'frontend' && !a.uses?.length)
      .map((a) => ({
        rule: 'frontend-without-backend',
        level: 'warning' as const,
        message: `Frontend "${a.name}" does not use any backend`,
        app: a.name,
      })),
  }),
}

const serviceKnown: Rule = {
  id: 'service-known',
  check: (stack, reg) => ({
    issues: stack.services
      .filter((s) => !reg.service(s))
      .map((s) =>
        err(
          'service-known',
          `Unknown service "${s}". Valid: ${[...reg.services.keys()].join(', ')}`,
        ),
      ),
  }),
}

const assignPorts: Rule = {
  id: 'assign-ports',
  check: (stack, reg) => {
    const issues: Issue[] = []
    const used = new Set<number>()
    for (const app of stack.apps) {
      if (app.port === undefined) continue
      if (used.has(app.port)) {
        issues.push(err('assign-ports', `Port ${app.port} is used by more than one app`, app.name))
      }
      used.add(app.port)
    }
    const apps = stack.apps.map((app) => {
      if (app.port !== undefined) return app
      const plugin = reg.framework(app.framework, app.kind)
      if (!plugin) return app
      let port = plugin.defaultPort
      while (used.has(port)) port++
      used.add(port)
      issues.push({
        rule: 'assign-ports',
        level: 'fix',
        message: `Assigned port ${port} to "${app.name}"`,
        app: app.name,
      })
      return { ...app, port }
    })
    return { issues, stack: { ...stack, apps } }
  },
}

export const rules: Rule[] = [
  atLeastOneApp,
  appNameValid,
  frameworkKnown,
  apiStyle,
  usesValid,
  frontendWithoutBackend,
  serviceKnown,
  assignPorts,
]

export function validateStack(
  stack: StackConfig,
  reg: Registry,
): { stack: StackConfig; errors: Issue[]; warnings: Issue[]; fixes: Issue[] } {
  let current = stack
  const all: Issue[] = []
  for (const rule of rules) {
    const r = rule.check(current, reg)
    all.push(...r.issues)
    if (r.stack) current = r.stack
  }
  return {
    stack: current,
    errors: all.filter((i) => i.level === 'error'),
    warnings: all.filter((i) => i.level === 'warning'),
    fixes: all.filter((i) => i.level === 'fix'),
  }
}
