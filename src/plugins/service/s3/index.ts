import { IMAGES } from '../../../versions'
import type { ServicePlugin } from '../../types'

/**
 * Local-development keys only (they are in the repo). SeaweedFS turns AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY into an admin identity; use real credentials in any deployed environment.
 */
const ACCESS_KEY = 'octorepo'
const SECRET_KEY = 'octorepo-local-secret'

/**
 * S3-compatible object storage (SeaweedFS, Apache-2.0). `server -s3` runs master, volume, filer
 * and the S3 gateway in one container; the bucket is created on the first upload
 * (`-s3.autoCreateBucket`, on by default for admin identities).
 */
export const s3Plugin: ServicePlugin = {
  id: 's3',
  label: 'S3 (SeaweedFS)',
  compose: () => ({
    image: `chrislusf/seaweedfs:${IMAGES.seaweedfs}`,
    // -ip names the node by its compose hostname; -ip.bind listens on every container interface.
    command: ['server', '-s3', '-ip=s3', '-ip.bind=0.0.0.0'],
    ports: ['127.0.0.1:8333:8333'],
    environment: { AWS_ACCESS_KEY_ID: ACCESS_KEY, AWS_SECRET_ACCESS_KEY: SECRET_KEY },
    volumes: ['s3-data:/data'],
    healthcheck: {
      test: ['CMD', 'curl', '-fsS', 'http://127.0.0.1:8333/healthz'],
      interval: '5s',
      timeout: '5s',
      retries: 20,
    },
  }),
  env: (ctx, host = 's3') => ({
    S3_ENDPOINT: `http://${host}:8333`,
    // Project names are already lowercase kebab-case; S3 caps bucket names at 63 characters.
    S3_BUCKET: `${ctx.stack.name.slice(0, 57)}-files`,
    S3_ACCESS_KEY_ID: ACCESS_KEY,
    S3_SECRET_ACCESS_KEY: SECRET_KEY,
  }),
}
