import { type HelloResponse, HelloResponseSchema } from '{{scope}}/types'

export type { HelloResponse }

export function hello(): HelloResponse {
  return HelloResponseSchema.parse({ message: 'Hello from {{name}}' })
}
