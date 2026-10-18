import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiProperty } from '@nestjs/swagger'
import { type HelloResponse, hello } from './hello'

export class HelloDto implements HelloResponse {
  @ApiProperty({ example: 'Hello from {{name}}' })
  message!: string
}

export class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok'
}

@Controller()
export class AppController {
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ type: HealthDto })
  health(): HealthDto {
    return { status: 'ok' }
  }

  @Get('hello')
  @ApiOperation({ summary: 'Hello message' })
  @ApiOkResponse({ type: HelloDto })
  hello(): HelloResponse {
    return hello()
  }
}
