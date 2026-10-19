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
    .mockResolvedValueOnce('turbo')
    .mockResolvedValueOnce('backend')
    .mockResolvedValueOnce('express')
    .mockResolvedValueOnce('frontend')
    .mockResolvedValueOnce('next')
    .mockResolvedValueOnce('done')
  clack.multiselect.mockResolvedValueOnce(['api']).mockResolvedValueOnce([])
  clack.confirm.mockResolvedValueOnce(true)
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
  })

  it('prints the cancel message once and throws a silent CancelledError', async () => {
    clack.text.mockResolvedValueOnce(Symbol('cancel'))
    const err = await promptForStack(defaultRegistry()).catch((e) => e)
    expect(err).toBeInstanceOf(CancelledError)
    expect(clack.cancel).toHaveBeenCalledTimes(1)
    expect(formatError(err, false)).toEqual({ text: '', exitCode: 1 })
  })
})

describe('appNameValidator', () => {
  it('checks a new backend against existing apps both ways', () => {
    const v = appNameValidator('backend', [{ name: 'api-client', kind: 'frontend' }])
    expect(v('api')).toContain('collides with app "api-client"')
    expect(v('billing')).toBeUndefined()
    expect(v('Bad')).toContain('must match')
  })
})
