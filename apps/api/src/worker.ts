import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { initSentry, Sentry } from './lib/sentry';

/**
 * Worker entry point — same Nest application context as the HTTP API,
 * but without an HTTP server. BullMQ processors registered via
 * `@Processor()` run inside this context.
 */
async function bootstrap(): Promise<void> {
  loadEnv();
  initSentry('worker');

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log('Worker context initialized', 'Worker');

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.get(Logger).log(`Received ${signal}, shutting down`, 'Worker');
    void app
      .close()
      .then(async () => {
        await Sentry.close(2_000).catch(() => null);
        process.exit(0);
      })
      .catch((err: unknown) => {
        app.get(Logger).error('Error during shutdown', err as Error);
        process.exit(1);
      });
  };
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

void bootstrap().catch((err: unknown) => {
  console.error('Fatal worker bootstrap error', err);
  process.exit(1);
});
