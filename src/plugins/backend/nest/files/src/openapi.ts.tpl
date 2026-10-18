import 'reflect-metadata'
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { createApp } from './app'

export async function buildOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await createApp({ logger: false })
  const config = new DocumentBuilder().setTitle('{{name}}').setVersion('0.0.0').build()
  const document = SwaggerModule.createDocument(app, config)
  await app.close()
  return document
}
