import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { composeFiles } from '../../src/engine/compose'
import type { StackConfig } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'
import type { ProjectContext } from '../../src/plugins/types'
import { VERSIONS } from '../../src/versions'

const stack: StackConfig = {
  name: 'acme',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps: [
    { name: 'web', kind: 'frontend', framework: 'react-vite', uses: ['api'], port: 3000 },
    { name: 'site', kind: 'frontend', framework: 'next', uses: ['api'], port: 3001 },
    { name: 'api', kind: 'backend', framework: 'express', apiStyle: 'rest', port: 4000 },
  ],
  services: ['postgres'],
}
const ctx: ProjectContext = { stack, scope: '@acme', versions: VERSIONS }

describe('composeFiles', () => {
  const tree = composeFiles(ctx, defaultRegistry())
  const compose = tree['docker-compose.yml'] as string
  const doc = parse(compose)

  it('marks the file as tool-owned', () => {
    expect(compose).toMatch(/^# .*octorepo/)
    expect(compose).toContain('docker-compose.override.yml')
  })
  it('builds each app from its Dockerfile with a port mapping', () => {
    expect(doc.services.api.build).toEqual({ context: '.', dockerfile: 'apps/api/Dockerfile' })
    expect(doc.services.api.ports).toEqual(['4000:4000'])
    expect(doc.services.web.ports).toEqual(['3000:3000'])
  })
  it('wires backends to services and frontends', () => {
    expect(doc.services.api.depends_on.postgres.condition).toBe('service_healthy')
    expect(doc.services.api.environment.CORS_ORIGINS).toBe(
      'http://localhost:3000,http://localhost:3001',
    )
    expect(doc.services.api.environment.DATABASE_URL).toBe(
      'postgres://postgres:postgres@postgres:5432/acme',
    )
  })
  it('gives Next frontends server-side backend URLs', () => {
    expect(doc.services.site.environment.API_URL).toBe('http://api:4000')
    expect(doc.services.web.environment?.API_URL).toBeUndefined()
  })
  it('adds official service images with healthchecks and named volumes', () => {
    expect(doc.services.postgres.image).toMatch(/^postgres:\d+-alpine$/)
    expect(doc.services.postgres.healthcheck.test.join(' ')).toContain('pg_isready')
    expect(Object.keys(doc.volumes)).toContain('postgres-data')
    expect(compose).not.toContain('bitnami')
  })
  it('writes a root .env.example with local defaults', () => {
    const env = tree['.env.example'] as string
    expect(env).toContain('CORS_ORIGINS=http://localhost:3000,http://localhost:3001')
    expect(env).toContain('DATABASE_URL=postgres://postgres:postgres@localhost:5432/acme')
  })
  it('supports redis', () => {
    const t = composeFiles({ ...ctx, stack: { ...stack, services: ['redis'] } }, defaultRegistry())
    const d = parse(t['docker-compose.yml'] as string)
    expect(d.services.redis.image).toMatch(/^redis:\d+-alpine$/)
    expect(d.services.api.environment.REDIS_URL).toBe('redis://redis:6379')
    expect(d.services.redis.healthcheck.test.join(' ')).toContain('redis-cli ping')
  })
})
