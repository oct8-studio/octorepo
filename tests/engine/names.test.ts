import { describe, expect, it } from 'vitest'
import { camelCase, pascalCase, upperSnake } from '../../src/engine/names'

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
