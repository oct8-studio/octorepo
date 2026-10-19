import { describe, expect, it } from 'vitest'
import { parseAppFlag, parseUses } from '../../src/commands/flags'

describe('parseUses', () => {
  it('trims entries and drops empty ones', () => {
    expect(parseUses('api, billing ,,')).toEqual(['api', 'billing'])
  })
})

describe('parseAppFlag', () => {
  it('parses kind:name:framework[:uses=a,b] with trimmed uses', () => {
    expect(parseAppFlag('frontend:web:next:uses=api, billing')).toEqual({
      kind: 'frontend',
      name: 'web',
      framework: 'next',
      uses: ['api', 'billing'],
    })
  })
  it('rejects malformed specs', () => {
    expect(() => parseAppFlag('frontend:web')).toThrow('Invalid --app')
    expect(() => parseAppFlag('frontend:web:next:foo=1')).toThrow('Invalid --app option')
  })
})
