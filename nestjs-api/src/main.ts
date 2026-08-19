import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 请求日志中间件：记录每个 HTTP 请求的方法、路径、状态码和耗时
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const { method, originalUrl, ip } = req;
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      const userAgent = req.get('user-agent') || '-';
      console.log(
        `[NestJS] ${ip} - ${method} ${originalUrl} ${statusCode} ${duration}ms "${userAgent}"`,
      );
    });
    next();
  });

  // API 版本控制
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // 全局校验
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS：白名单 origin，允许带凭证（cookie）
  // 注意：origin: '*' 和 credentials: true 不能同时使用（浏览器规范禁止）
  const allowedOrigins = [
    'http://localhost:3001', // 本地开发：Next.js
    'http://localhost:3000', // 本地开发：直接访问 NestJS
    process.env.WEB_ORIGIN, // 生产环境前端域名（通过环境变量配置）
  ].filter(Boolean) as string[];
  app.enableCors({
    origin: (origin, callback) => {
      // 允许未带 Origin 的请求（同源请求、curl、Postman、服务器间调用）
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} 不在白名单`), false);
      }
    },
    credentials: true,
  });

  // Swagger 文档
  const config = new DocumentBuilder()
    .setTitle('School System API')
    .setDescription('NestJS + TypeScript 全栈 API')
    .setVersion('3.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 NestJS API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
