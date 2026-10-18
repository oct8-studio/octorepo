import { describe, expect, it } from 'vitest'
import { json, mergeJson, mergeTrees, readPluginFiles } from '../../src/engine/tree'

describe('mergeTrees', () => {
  it('deep-merges json files', () => {
    const out = mergeTrees({ 'a.json': '{"x":1,"l":[1]}' }, { 'a.json': '{"y":2,"l":[1,2]}' })
    expect(JSON.parse(out['a.json'] as string)).toEqual({ x: 1, y: 2, l: [1, 2] })
  })
  it('later wins for non-json', () => {
    expect(mergeTrees({ 'a.txt': '1' }, { 'a.txt': '2' })['a.txt']).toBe('2')
  })
})

describe('mergeJson / json', () => {
  it('scalars: b wins; objects recurse', () => {
    expect(mergeJson({ a: { b: 1 }, c: 1 }, { a: { d: 2 }, c: 2 })).toEqual({
      a: { b: 1, d: 2 },
      c: 2,
    })
  })
  it('json() formats with trailing newline', () => {
    expect(json({ a: 1 })).toBe('{\n  "a": 1\n}\n')
  })
})

describe('readPluginFiles', () => {
  it('reads files/, substitutes tokens, strips .tpl', () => {
    const tree = readPluginFiles(new URL('../fixtures/plugin-a/', import.meta.url), {
      name: 'demo',
    })
    expect(tree).toEqual({ 'src/index.ts': 'export const name = "demo"\n' })
  })
})
