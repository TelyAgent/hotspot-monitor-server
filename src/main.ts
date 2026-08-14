import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // 所有接口统一前缀 /api
  app.setGlobalPrefix('api')

  // 允许前端（Vite dev 默认 5173）跨域访问
  app.enableCors({ origin: true })

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  console.log(`🚀 热点运营系统服务端已启动: http://localhost:${port}/api`)
}

bootstrap()
