import { describe, expect, it } from 'vitest'
import { CliError, formatError } from '../../src/model/errors'

describe('formatError', () => {
  it('prints only the message for a CliError', () => {
    expect(formatError(new CliError('bad stack'), false)).toEqual({
      text: 'bad stack',
      exitCode: 1,
    })
  })
  it('prints only the message for unexpected errors unless debugging', () => {
    const e = Object.assign(new Error('ENOTDIR: not a directory'), { code: 'ENOTDIR' })
    expect(formatError(e, false)).toEqual({ text: 'ENOTDIR: not a directory', exitCode: 1 })
    const debug = formatError(e, true)
    expect(debug.text).toContain('ENOTDIR: not a directory')
    expect(debug.text).toContain('errors.test.ts')
  })
  it('stringifies non-Error throws', () => {
    expect(formatError('boom', false)).toEqual({ text: 'boom', exitCode: 1 })
  })
})
