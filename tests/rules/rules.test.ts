import { describe, expect, it } from 'vitest'
import type { AppSpec, StackConfig } from '../../src/model/stack'
import { Registry } from '../../src/plugins/registry'
import { appNameProblem, validateStack } from '../../src/rules'

const reg = new Registry()
  .registerFramework({
    id: 'next',
    kind: 'frontend',
    label: 'Next',
    apiStyles: [],
    defaultPort: 3000,
    generate: () => ({}),
    dockerfile: () => '',
  })
  .registerFramework({
    id: 'express',
    kind: 'backend',
    label: 'Express',
    apiStyles: ['rest'],
    defaultPort: 4000,
    generate: () => ({}),
    dockerfile: () => '',
  })
  .registerService({
    id: 'postgres',
    label: 'Postgres',
    compose: () => ({ image: 'postgres' }),
    env: () => ({}),
  })
  .registerOrm({ id: 'drizzle', label: 'Drizzle', generate: () => ({}), migrateCommand: [] })

const fe = (name: string, extra: Partial<AppSpec> = {}): AppSpec => ({
  name,
  kind: 'frontend',
  framework: 'next',
  uses: [],
  ...extra,
})
const be = (name: string, extra: Partial<AppSpec> = {}): AppSpec => ({
  name,
  kind: 'backend',
  framework: 'express',
  apiStyle: 'rest',
  ...extra,
})
const stack = (apps: AppSpec[], extra: Partial<StackConfig> = {}): StackConfig => ({
  name: 'acme',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps,
  services: [],
  ...extra,
})

describe('validateStack', () => {
  it('flags invalid app names', () => {
    const r = validateStack(
      stack(['Web', 'web', '2x', 'packages', 'my app'].map((n) => fe(n))),
      reg,
    )
    const errs = r.errors.filter((e) => e.rule === 'app-name-valid')
    expect(errs).toHaveLength(5)
    expect(errs.every((e) => e.app)).toBe(true)
  })

  it('flags duplicate names', () => {
    const r = validateStack(stack([be('api'), be('api')]), reg)
    expect(r.errors.some((e) => e.rule === 'app-name-valid' && e.app === 'api')).toBe(true)
  })

  it('flags app names that collide with generated package names', () => {
    const r = validateStack(stack([fe('api-client'), be('api'), fe('ui-react')]), reg)
    const errs = r.errors.filter((e) => e.rule === 'app-name-valid')
    expect(errs.map((e) => e.app)).toEqual(['api-client', 'ui-react'])
    expect(errs[0]?.message).toBe(
      'App name "api-client" collides with the generated package @acme/api-client (typed client of backend "api")',
    )
    expect(errs[1]?.message).toContain('@acme/ui-react')
  })

  it('rejects app names that collide with any shared UI package', () => {
    for (const name of ['ui-react', 'ui-vue', 'ui-svelte', 'ui-solid']) {
      const r = validateStack(stack([fe(name)]), reg)
      const errs = r.errors.filter((e) => e.rule === 'app-name-valid')
      expect(
        errs.map((e) => e.app),
        name,
      ).toEqual([name])
      expect(errs[0]?.message).toContain(`collides with the generated package @acme/${name}`)
      expect(appNameProblem({ name, kind: 'frontend' }, [])).toContain('collides')
    }
  })

  it('appNameProblem applies the same rules to one new app', () => {
    expect(appNameProblem({ name: 'Api', kind: 'backend' }, [])).toContain('must match')
    expect(appNameProblem({ name: 'types', kind: 'backend' }, [])).toContain('reserved')
    expect(appNameProblem({ name: 'web', kind: 'frontend' }, [fe('web')])).toBe(
      'is a duplicate app name',
    )
    expect(appNameProblem({ name: 'api-client', kind: 'frontend' }, [be('api')])).toContain(
      'typed client of backend "api"',
    )
    // The reverse: a new backend whose client package would collide with an existing app.
    expect(appNameProblem({ name: 'api', kind: 'backend' }, [fe('api-client')])).toBe(
      'would generate package api-client, which collides with app "api-client"',
    )
    expect(appNameProblem({ name: 'api', kind: 'backend' }, [fe('web')])).toBeUndefined()
  })

  it('flags invalid project name', () => {
    const r = validateStack(stack([be('api')], { name: 'Bad Name' }), reg)
    expect(r.errors.some((e) => e.rule === 'app-name-valid' && !e.app)).toBe(true)
  })

  it('fixes missing apiStyle', () => {
    const r = validateStack(stack([be('api', { apiStyle: undefined })]), reg)
    expect(r.fixes.some((f) => f.rule === 'api-style')).toBe(true)
    expect(r.stack.apps[0]?.apiStyle).toBe('rest')
  })

  it('rejects unsupported apiStyle', () => {
    const r = validateStack(stack([be('api', { apiStyle: 'graphql' })]), reg)
    const e = r.errors.find((x) => x.rule === 'api-style')
    expect(e?.message).toContain('rest')
  })

  it('rejects apiStyle on frontend', () => {
    const r = validateStack(stack([fe('web', { apiStyle: 'rest' })]), reg)
    expect(r.errors.some((x) => x.rule === 'api-style')).toBe(true)
  })

  it('flags unknown framework', () => {
    const r = validateStack(stack([fe('web', { framework: 'nope' })]), reg)
    const e = r.errors.find((x) => x.rule === 'framework-known')
    expect(e?.message).toContain('next')
  })

  it('flags unknown uses', () => {
    const r = validateStack(stack([be('api'), fe('web', { uses: ['nope'] })]), reg)
    expect(r.errors.some((e) => e.rule === 'uses-valid')).toBe(true)
  })

  it('flags backend with uses', () => {
    const r = validateStack(stack([be('api', { uses: ['x'] })]), reg)
    expect(r.errors.some((e) => e.rule === 'uses-valid')).toBe(true)
  })

  it('warns on frontend without backend', () => {
    const r = validateStack(stack([fe('web', { uses: [] })]), reg)
    expect(r.errors).toEqual([])
    expect(r.warnings.filter((w) => w.rule === 'frontend-without-backend')).toHaveLength(1)
    expect(r.warnings).toHaveLength(1)
  })

  it('flags unknown service', () => {
    const r = validateStack(stack([be('api')], { services: ['postgres', 'nope'] }), reg)
    expect(r.errors.filter((e) => e.rule === 'service-known')).toHaveLength(1)
  })

  it('assigns unique ports', () => {
    const r = validateStack(stack([be('a'), be('b')]), reg)
    expect(r.stack.apps.map((a) => a.port)).toEqual([4000, 4001])
    expect(r.fixes.filter((f) => f.rule === 'assign-ports').length).toBeGreaterThan(0)
  })

  it('rejects duplicate explicit ports', () => {
    const r = validateStack(stack([be('a', { port: 4000 }), be('b', { port: 4000 })]), reg)
    expect(r.errors.some((e) => e.rule === 'assign-ports')).toBe(true)
  })

  it('requires at least one app', () => {
    const r = validateStack(stack([]), reg)
    expect(r.errors.some((e) => e.rule === 'at-least-one-app')).toBe(true)
  })

  it('adds postgres when an ORM is set without it (fix, reported)', () => {
    const r = validateStack(stack([be('api')], { orm: 'drizzle', services: [] }), reg)
    expect(r.errors).toEqual([])
    expect(r.stack.services).toEqual(['postgres'])
    expect(r.fixes.filter((f) => f.rule === 'orm-needs-postgres')).toEqual([
      expect.objectContaining({ message: 'Added the postgres service (required by drizzle)' }),
    ])
  })

  it('leaves services alone when postgres is already there or no ORM is set', () => {
    const withPg = validateStack(
      stack([be('api')], { orm: 'drizzle', services: ['postgres'] }),
      reg,
    )
    expect(withPg.stack.services).toEqual(['postgres'])
    expect(withPg.fixes.some((f) => f.rule === 'orm-needs-postgres')).toBe(false)
    expect(validateStack(stack([be('api')]), reg).stack.services).toEqual([])
  })

  it('flags an ORM the registry does not know', () => {
    const r = validateStack(stack([be('api')], { orm: 'prisma' }), reg)
    expect(r.errors).toEqual([
      expect.objectContaining({
        rule: 'orm-known',
        message: 'Unknown ORM "prisma". Valid: drizzle',
      }),
    ])
  })

  it('reserves the db package and migrate service names when an ORM is set', () => {
    const r = validateStack(stack([be('db'), be('migrate')], { orm: 'drizzle' }), reg)
    expect(r.errors.map((e) => e.app)).toEqual(['db', 'migrate'])
    expect(validateStack(stack([be('db'), be('migrate')]), reg).errors).toEqual([])
    expect(appNameProblem({ name: 'migrate', kind: 'backend' }, [], 'drizzle')).toMatch(/reserved/)
    expect(appNameProblem({ name: 'db', kind: 'backend' }, [], 'prisma')).toMatch(/collides/)
    expect(appNameProblem({ name: 'db', kind: 'backend' }, [])).toBeUndefined()
  })
})
