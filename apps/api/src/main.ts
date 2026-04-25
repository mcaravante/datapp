import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true,
  });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CDP API')
    .setDescription('Custom CDP for Adobe Commerce — Phase 1')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('v1/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(env.PORT, '0.0.0.0');
  app
    .get(Logger)
    .log(`API listening on :${env.PORT.toString()} (env=${env.NODE_ENV})`, 'Bootstrap');
}

void bootstrap().catch((err: unknown) => {
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
