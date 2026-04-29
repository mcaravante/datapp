import 'reflect-metadata';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { initSentry, Sentry } from './lib/sentry';
import { SentryExceptionFilter } from './lib/sentry.filter';

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  // Refuse to start in production with an empty CORS allowlist — silent
  // 0-origin would lock out the admin and the bug would land on us at
  // 3am.
  if (env.NODE_ENV === 'production' && env.CORS_ALLOWED_ORIGINS.length === 0) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must list at least one origin in production (e.g. the admin URL)',
    );
  }

  // Sentry must be initialized BEFORE Nest creates listeners so the SDK
  // can hook into uncaughtException / unhandledRejection from the start.
  initSentry('api');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Required so the HmacGuard can verify signatures over the byte-exact body.
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  // Behind Cloudflare → Dokploy → app, the immediate peer is the proxy.
  // Trust 1 hop so `req.ip` resolves to the real client and the rate
  // limiter / audit log don't see the proxy IP for everyone.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      hsts: {
        maxAge: 31_536_000, // 1 year — required for HSTS preload eligibility
        includeSubDomains: true,
        preload: true,
      },
    }),
  );
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true,
  });

  // URI versioning produces `/v1/...` routes via the controller's
  // `version: '1'` declaration. We don't add a separate globalPrefix to
  // avoid stacking it into `/v1/v1/...`.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Global filter: forwards 5xx to Sentry, then defers to Nest's default
  // response shape so existing clients see no change.
  app.useGlobalFilters(new SentryExceptionFilter(app.get(HttpAdapterHost)));

  if (env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CDP API')
      .setDescription('Custom CDP for Adobe Commerce — Phase 1')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Wire Nest's lifecycle hooks (Prisma, Mailer, Auth Redis,
  // SessionsService cleanup interval) into SIGTERM/SIGINT.
  app.enableShutdownHooks();

  // The Express server stops accepting new connections on SIGTERM but
  // keeps draining in-flight requests during the shutdown grace period
  // configured by the orchestrator (Dokploy default: 10s).
  let shuttingDown = false;
  const gracefulShutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    const log = app.get(Logger);
    log.log(`Received ${signal}, draining HTTP server`, 'Bootstrap');
    void app
      .close()
      .then(async () => {
        await Sentry.close(2_000).catch(() => null);
        log.log('Shutdown complete', 'Bootstrap');
        process.exit(0);
      })
      .catch((err: unknown) => {
        log.error('Error during shutdown', err as Error);
        process.exit(1);
      });
  };
  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
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
