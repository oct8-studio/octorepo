import { describe, expect, it } from 'vitest'
import { runsAsRoot } from '../../scripts/non-root'

describe('runsAsRoot', () => {
  it.each(['', 'root', 'root:root', 'root:wheel', '0', '0:0'])('%j is root', (u) => {
    expect(runsAsRoot(u)).toBe(true)
  })
  it.each(['node', 'node:node', '1000', '1000:1000', 'app'])('%j is not root', (u) => {
    expect(runsAsRoot(u)).toBe(false)
  })
})
