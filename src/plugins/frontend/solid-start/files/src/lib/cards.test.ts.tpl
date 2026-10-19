import { describe, expect, it } from 'vitest'
import { toCard } from './cards'

describe('toCard', () => {
  it('maps a successful response to an ok card', () => {
    expect(toCard({ name: 'api', data: { message: 'Hello from api' } })).toEqual({
      title: 'api',
      body: 'Hello from api',
      ok: true,
    })
  })
  it('maps a failure to an unreachable card', () => {
    expect(toCard({ name: 'api', error: new Error('boom') })).toEqual({
      title: 'api',
      body: 'unreachable',
      ok: false,
    })
  })
})
