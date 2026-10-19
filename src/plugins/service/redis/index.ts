import { IMAGES } from '../../../versions'
import type { ServicePlugin } from '../../types'

export const redisPlugin: ServicePlugin = {
  id: 'redis',
  label: 'Redis',
  compose: () => ({
    image: `redis:${IMAGES.redis}-alpine`,
    ports: ['127.0.0.1:6379:6379'],
    volumes: ['redis-data:/data'],
    healthcheck: {
      test: ['CMD', 'redis-cli', 'ping'],
      interval: '5s',
      timeout: '5s',
      retries: 10,
    },
  }),
  env: (_ctx, host = 'redis') => ({ REDIS_URL: `redis://${host}:6379` }),
}
