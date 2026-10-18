import { expect, test } from 'vitest'
import { CLI_NAME } from '../src/meta'
import { VERSIONS } from '../src/versions'

test('meta', () => expect(CLI_NAME).toBe('octorepo'))
test('versions are exact', () => {
  for (const [pkg, v] of Object.entries(VERSIONS)) expect(v, pkg).toMatch(/^\d+\.\d+\.\d+$/)
})
