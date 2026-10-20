import { IMAGES } from '../../../versions'
import type { ServicePlugin } from '../../types'

export const rabbitmqPlugin: ServicePlugin = {
  id: 'rabbitmq',
  label: 'RabbitMQ',
  compose: () => ({
    image: `rabbitmq:${IMAGES.rabbitmq}-management-alpine`,
    // The node name (rabbit@<hostname>) is part of the data path: keep it stable across recreates.
    hostname: 'rabbitmq',
    // AMQP, and the management UI at http://localhost:15672 (login app / app).
    ports: ['127.0.0.1:5672:5672', '127.0.0.1:15672:15672'],
    // Local-development credentials; the default guest user only works from inside the container.
    environment: { RABBITMQ_DEFAULT_USER: 'app', RABBITMQ_DEFAULT_PASS: 'app' },
    volumes: ['rabbitmq-data:/var/lib/rabbitmq'],
    healthcheck: {
      // Passes once the AMQP listener accepts connections, not just when the node is up.
      test: ['CMD', 'rabbitmq-diagnostics', '-q', 'check_port_connectivity'],
      interval: '10s',
      timeout: '10s',
      retries: 12,
    },
  }),
  env: (_ctx, host = 'rabbitmq') => ({ AMQP_URL: `amqp://app:app@${host}:5672` }),
}
