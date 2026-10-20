import { IMAGES } from '../../../versions'
import type { ServicePlugin } from '../../types'

export const mailpitPlugin: ServicePlugin = {
  id: 'mailpit',
  label: 'Mailpit',
  compose: () => ({
    image: `axllent/mailpit:${IMAGES.mailpit}`,
    // SMTP, and the inbox UI at http://localhost:8025. Mail is kept in /data across restarts.
    ports: ['127.0.0.1:1025:1025', '127.0.0.1:8025:8025'],
    environment: { MP_DATABASE: '/data/mailpit.db' },
    volumes: ['mailpit-data:/data'],
    healthcheck: {
      // The image's own healthcheck command.
      test: ['CMD', '/mailpit', 'readyz'],
      interval: '5s',
      timeout: '5s',
      retries: 10,
    },
  }),
  env: (_ctx, host = 'mailpit') => ({ SMTP_URL: `smtp://${host}:1025` }),
}
