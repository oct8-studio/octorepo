import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
{{dbImport}}
@Module({ controllers: [{{controllers}}] })
export class AppModule {}
