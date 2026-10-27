import { beforeEach, describe, expect, it, vi } from 'vitest'

const clack = vi.hoisted(() => ({
  intro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  isCancel: (v: unknown) => typeof v === 'symbol',
  text: vi.fn(),
  select: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock('@clack/prompts', () => clack)

const { appNameValidator, promptForStack } = await import('../../src/commands/prompts')
const { CancelledError, formatError } = await import('../../src/model/errors')
const { defaultRegistry } = await import('../../src/plugins/registry')

beforeEach(() => {
  for (const fn of Object.values(clack)) if (vi.isMockFunction(fn)) fn.mockReset()
})

/** Answers one backend `api` (express) and one frontend `web` (next) using it. */
function scriptAnswers() {
  clack.text.mockResolvedValueOnce('acme').mockResolvedValueOnce('api').mockResolvedValueOnce('web')
  clack.select
    .mockResolvedValueOnce('none')
    .mockResolvedValueOnce('turbo')
    .mockResolvedValueOnce('backend')
    .mockResolvedValueOnce('express')
    .mockResolvedValueOnce('frontend')
    .mockResolvedValueOnce('next')
    .mockResolvedValueOnce('done')
  clack.multiselect.mockResolvedValueOnce(['api']).mockResolvedValueOnce([])
  clack.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
}

describe('promptForStack', () => {
  it('defaults the project name to the target directory name', async () => {
    scriptAnswers()
    const stack = await promptForStack(defaultRegistry(), { defaultName: 'my-repo' })
    expect(clack.text.mock.calls[0]?.[0]).toMatchObject({ initialValue: 'my-repo' })
    expect(stack.apps.map((a) => a.name)).toEqual(['api', 'web'])
  })

  it('validates app names inline with the stack rules', async () => {
    scriptAnswers()
    await promptForStack(defaultRegistry())
    const validate = clack.text.mock.calls[2]?.[0].validate as (v: string) => string | undefined
    expect(validate('api-client')).toContain('typed client of backend "api"')
    expect(validate('api')).toContain('duplicate')
    expect(validate('types')).toContain('reserved')
    expect(validate('admin')).toBeUndefined()
    expect(validate('postgres')).toContain('compose service "postgres"')
  })

  it('asks about presets first and seeds apps, services and orm from the choice', async () => {
    clack.select
      .mockResolvedValueOnce('saas')
      .mockResolvedValueOnce('turbo')
      .mockResolvedValueOnce('done')
      .mockResolvedValueOnce('drizzle')
    clack.text.mockResolvedValueOnce('acme')
    clack.multiselect.mockResolvedValueOnce(['postgres', 'valkey', 'mailpit'])
    clack.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const stack = await promptForStack(defaultRegistry())
    expect(clack.select.mock.calls[0]?.[0].message).toBe('Start from a preset?')
    expect(stack.preset).toBe('saas')
    expect(stack.apps.map((a) => a.name)).toEqual(['web', 'admin', 'api', 'worker'])
    expect(stack.orm).toBe('drizzle')
    expect(clack.multiselect.mock.calls[0]?.[0].initialValues).toEqual([
      'postgres',
      'valkey',
      'mailpit',
    ])
  })

  it("validates extra app names against the preset's ORM (db/migrate reserved inline)", async () => {
    clack.select
      .mockResolvedValueOnce('saas')
      .mockResolvedValueOnce('turbo')
      .mockResolvedValueOnce('backend')
    clack.text.mockResolvedValueOnce('acme').mockResolvedValueOnce(Symbol('cancel'))
    await expect(promptForStack(defaultRegistry())).rejects.toBeInstanceOf(CancelledError)
    const validate = clack.text.mock.calls[1]?.[0].validate as (v: string) => string | undefined
    expect(validate('migrate')).toContain('migration service')
    expect(validate('db')).toContain('shared database package')
    expect(validate('api')).toContain('duplicate')
  })

  it('asks about kbee (default no) and records a yes', async () => {
    scriptAnswers()
    clack.confirm.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    const stack = await promptForStack(defaultRegistry())
    expect(clack.confirm.mock.calls[0]?.[0]).toMatchObject({
      message: 'Set up kbee (AI knowledge base for your agents)?',
      initialValue: false,
    })
    expect(stack.kbee).toBe(true)
    expect(clack.note.mock.calls[0]?.[0]).toContain('kbee: yes')
  })

  it('skips the kbee question with --kbee (yes) or --no-git (no)', async () => {
    scriptAnswers()
    clack.confirm.mockReset().mockResolvedValueOnce(true)
    expect((await promptForStack(defaultRegistry(), { kbee: true })).kbee).toBe(true)
    scriptAnswers()
    clack.confirm.mockReset().mockResolvedValueOnce(true)
    expect((await promptForStack(defaultRegistry(), { git: false })).kbee).toBeUndefined()
    expect(clack.confirm).toHaveBeenCalledTimes(1)
  })

  it('prints the cancel message once and throws a silent CancelledError', async () => {
    clack.select.mockResolvedValueOnce('none')
    clack.text.mockResolvedValueOnce(Symbol('cancel'))
    const err = await promptForStack(defaultRegistry()).catch((e) => e)
    expect(err).toBeInstanceOf(CancelledError)
    expect(clack.cancel).toHaveBeenCalledTimes(1)
    expect(formatError(err, false)).toEqual({ text: '', exitCode: 1 })
  })
})

describe('appNameValidator', () => {
  it('checks a new backend against existing apps both ways', () => {
    const v = appNameValidator('backend', [{ name: 'api-client', kind: 'frontend' }], undefined, [])
    expect(v('api')).toContain('collides with app "api-client"')
    expect(v('billing')).toBeUndefined()
    expect(v('Bad')).toContain('must match')
  })

  it('rejects registered service ids and, with an ORM, db/migrate', () => {
    const v = appNameValidator('backend', [], 'drizzle', defaultRegistry().services.keys())
    expect(v('mailpit')).toBe('"mailpit" collides with the compose service "mailpit"')
    expect(v('redis')).toContain('compose service')
    expect(v('migrate')).toContain('migration service')
    expect(v('db')).toContain('shared database package')
  })
})
