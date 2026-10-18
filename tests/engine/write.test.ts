import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeTree } from '../../src/engine/write'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'octorepo-write-'))
}

describe('writeTree', () => {
  it('rejects non-empty root in create mode and writes nothing', async () => {
    const root = tmp()
    writeFileSync(join(root, 'x.txt'), 'x')
    await expect(writeTree(root, { 'a/b.txt': 'b' }, { mode: 'create' })).rejects.toThrow(
      /not empty/,
    )
    expect(readdirSync(root)).toEqual(['x.txt'])
  })
  it('force writes into non-empty root', async () => {
    const root = tmp()
    writeFileSync(join(root, 'x.txt'), 'x')
    const written = await writeTree(root, { 'a/b.txt': 'b' }, { mode: 'create', force: true })
    expect(written).toEqual([join(root, 'a/b.txt')])
    expect(readFileSync(join(root, 'a/b.txt'), 'utf8')).toBe('b')
  })
  it('create works for missing or empty root; update creates dirs and overwrites', async () => {
    const root = join(tmp(), 'new')
    await writeTree(root, { 'a.txt': '1' }, { mode: 'create' })
    const empty = join(tmp(), 'e')
    mkdirSync(empty)
    await writeTree(empty, { 'a.txt': '1' }, { mode: 'create' })
    await writeTree(root, { 'a.txt': '2', 'd/e.txt': '3' }, { mode: 'update' })
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('2')
    expect(readFileSync(join(root, 'd/e.txt'), 'utf8')).toBe('3')
  })
})
