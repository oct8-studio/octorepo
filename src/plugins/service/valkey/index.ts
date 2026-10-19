import { IMAGES } from '../../../versions'
import type { ServicePlugin } from '../../types'

/**
 * Host port 6380, so Valkey runs next to Redis (6379). Fixed rather than chosen per stack:
 * `add service` never rewrites a backend's existing `.env` lines, so the URL must not change.
 */
const HOST_PORT = 6380

export const valkeyPlugin: ServicePlugin = {
  id: 'valkey',
  label: 'Valkey',
  compose: () => ({
    image: `valkey/valkey:${IMAGES.valkey}-alpine`,
    ports: [`127.0.0.1:${HOST_PORT}:6379`],
    volumes: ['valkey-data:/data'],
    healthcheck: {
      test: ['CMD', 'valkey-cli', 'ping'],
      interval: '5s',
      timeout: '5s',
      retries: 10,
    },
  }),
  // redis:// is the scheme Redis-protocol clients (ioredis, node-redis, iovalkey) all accept.
  env: (_ctx, host = 'valkey') => ({
    VALKEY_URL: `redis://${host}:${host === 'localhost' ? HOST_PORT : 6379}`,
  }),
}
