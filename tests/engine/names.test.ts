import { describe, expect, it } from 'vitest'
import { byName, camelCase, pascalCase, upperSnake } from '../../src/engine/names'

describe('names', () => {
  it('upperSnake', () => {
    expect(upperSnake('billing-api')).toBe('BILLING_API')
  })
  it('camelCase', () => {
    expect(camelCase('billing-api')).toBe('billingApi')
  })
  it('pascalCase', () => {
    expect(pascalCase('api')).toBe('Api')
    expect(pascalCase('billing-api')).toBe('BillingApi')
  })
})

describe('byName', () => {
  it('returns a name-sorted copy', () => {
    const apps = [{ name: 'billing-api' }, { name: 'api' }]
    expect(byName(apps).map((a) => a.name)).toEqual(['api', 'billing-api'])
    expect(apps[0]?.name).toBe('billing-api')
  })
})
