import { describe, expect, it } from 'vitest'
import { appendMissingLines, patchBiomeJson } from '../../src/commands/root-patch'

describe('appendMissingLines', () => {
  it('appends only missing lines under a header, keeping user lines in order', () => {
    expect(appendMissingLines('b\na\n', 'a\nc\nd\n')).toBe(
      'b\na\n\n# Added by octorepo add\nc\nd\n',
    )
  })
  it('handles a file without a trailing newline and CRLF line endings', () => {
    expect(appendMissingLines('a\r\nb', 'a\nb\nc\n')).toBe('a\r\nb\n\n# Added by octorepo add\nc\n')
  })
  it('returns undefined when nothing is missing', () => {
    expect(appendMissingLines('a\nb\n', 'b\na\n')).toBeUndefined()
  })
})

describe('patchBiomeJson', () => {
  const gen = JSON.stringify({
    files: { includes: ['**', '!**/dist', '!**/.nuxt'] },
    html: { experimentalFullSupportEnabled: true },
  })
  it('adds exclusions but never a positive pattern the user narrowed away', () => {
    const out = patchBiomeJson(JSON.stringify({ files: { includes: ['src/**', '!**/dist'] } }), gen)
    expect(JSON.parse(out as string).files.includes).toEqual(['src/**', '!**/dist', '!**/.nuxt'])
  })
  it('uses the generated includes when the user has none', () => {
    const out = JSON.parse(patchBiomeJson('{}', gen) as string)
    expect(out.files.includes).toEqual(['**', '!**/dist', '!**/.nuxt'])
    expect(out.html.experimentalFullSupportEnabled).toBe(true)
  })
  it('returns undefined when already up to date', () => {
    expect(patchBiomeJson(gen, gen)).toBeUndefined()
  })
})
