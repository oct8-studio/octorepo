import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { composeFiles } from '../../src/engine/compose'
import type { StackConfig } from '../../src/model/stack'
import { defaultRegistry } from '../../src/plugins/registry'
import type { ProjectContext } from '../../src/plugins/types'
import { IMAGES, VERSIONS } from '../../src/versions'

const reg = defaultRegistry()
const all = ['postgres', 'redis', 'valkey', 'rabbitmq', 'mailpit', 's3']
const stack: StackConfig = {
  name: 'acme',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps: [{ name: 'api', kind: 'backend', framework: 'express', apiStyle: 'rest', port: 4000 }],
  services: all,
}
const ctx = (services: string[]): ProjectContext => ({
  stack: { ...stack, services },
  scope: '@acme',
  versions: VERSIONS,
})

describe('service plugins', () => {
  const tree = composeFiles(ctx(all), reg)
  const doc = parse(tree['docker-compose.yml'] as string)

  it('every service has an official image, a healthcheck and loopback-only ports', () => {
    for (const id of all) {
      const s = doc.services[id]
      expect(s.healthcheck.test[0], id).toMatch(/^CMD/)
      expect(s.restart).toBe('unless-stopped')
      for (const p of s.ports) expect(p, id).toMatch(/^127\.0\.0\.1:\d+:\d+$/)
      expect(s.image).not.toMatch(/bitnami|minio/i)
      expect(doc.services.api.depends_on[id].condition).toBe('service_healthy')
    }
    // Every published host port is distinct, so all six run side by side.
    const host = all.flatMap((id) => doc.services[id].ports.map((p: string) => p.split(':')[1]))
    expect(new Set(host).size).toBe(host.length)
  })

  it('pins image majors from IMAGES', () => {
    expect(doc.services.valkey.image).toBe(`valkey/valkey:${IMAGES.valkey}-alpine`)
    expect(doc.services.rabbitmq.image).toBe(`rabbitmq:${IMAGES.rabbitmq}-management-alpine`)
    expect(doc.services.mailpit.image).toBe(`axllent/mailpit:${IMAGES.mailpit}`)
    expect(doc.services.s3.image).toBe(`chrislusf/seaweedfs:${IMAGES.seaweedfs}`)
  })

  it('valkey: valkey-cli healthcheck; host port 6380 so it runs next to redis', () => {
    expect(doc.services.valkey.healthcheck.test).toEqual(['CMD', 'valkey-cli', 'ping'])
    expect(doc.services.valkey.ports).toEqual(['127.0.0.1:6380:6379'])
    expect(doc.services.api.environment.VALKEY_URL).toBe('redis://valkey:6379')
    expect(tree['.env.example']).toContain('VALKEY_URL=redis://localhost:6380')
    // Same port without redis: backends' .env lines never need rewriting when redis is added later.
    const alone = composeFiles(ctx(['valkey']), reg)
    expect(parse(alone['docker-compose.yml'] as string).services.valkey.ports).toEqual([
      '127.0.0.1:6380:6379',
    ])
  })

  it('rabbitmq: AMQP + management UI, fixed hostname, dev credentials in AMQP_URL', () => {
    const r = doc.services.rabbitmq
    expect(r.ports).toEqual(['127.0.0.1:5672:5672', '127.0.0.1:15672:15672'])
    expect(r.hostname).toBe('rabbitmq')
    expect(r.healthcheck.test.join(' ')).toContain('rabbitmq-diagnostics')
    expect(r.volumes).toEqual(['rabbitmq-data:/var/lib/rabbitmq'])
    expect(doc.services.api.environment.AMQP_URL).toBe('amqp://app:app@rabbitmq:5672')
  })

  it('mailpit: SMTP + UI, readyz healthcheck, SMTP_URL', () => {
    const m = doc.services.mailpit
    expect(m.ports).toEqual(['127.0.0.1:1025:1025', '127.0.0.1:8025:8025'])
    expect(m.healthcheck.test).toEqual(['CMD', '/mailpit', 'readyz'])
    expect(doc.services.api.environment.SMTP_URL).toBe('smtp://mailpit:1025')
  })

  it('s3: SeaweedFS server -s3 with env credentials, S3_* vars for backends', () => {
    const s = doc.services.s3
    expect(s.command).toEqual(['server', '-s3', '-ip=s3', '-ip.bind=0.0.0.0'])
    expect(s.ports).toEqual(['127.0.0.1:8333:8333'])
    expect(s.healthcheck.test.join(' ')).toContain('/healthz')
    expect(s.environment.AWS_ACCESS_KEY_ID).toBe(doc.services.api.environment.S3_ACCESS_KEY_ID)
    expect(s.environment.AWS_SECRET_ACCESS_KEY).toBe(
      doc.services.api.environment.S3_SECRET_ACCESS_KEY,
    )
    expect(doc.services.api.environment).toMatchObject({
      S3_ENDPOINT: 'http://s3:8333',
      S3_BUCKET: 'acme-files',
    })
    expect(tree['.env.example']).toContain('S3_ENDPOINT=http://localhost:8333')
    expect(Object.keys(doc.volumes).sort()).toEqual([
      'mailpit-data',
      'postgres-data',
      'rabbitmq-data',
      'redis-data',
      's3-data',
      'valkey-data',
    ])
  })
})
