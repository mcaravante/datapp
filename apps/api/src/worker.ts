import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

/**
 * Worker entry point.
 *
 * Iteration 1: bootstraps the same Nest application context (no HTTP server)
 * and stays alive. BullMQ processors will be wired in Iteration 2 — once a
 * `@Processor()`-decorated class is registered in a feature module, this
 * entry will pick it up automatically.
 */
async function bootstrap(): Promise<void> {
  loadEnv();
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.get(Logger).log('Worker context initialized — awaiting Iteration 2 processors', 'Worker');

  const shutdown = (signal: string) => {
    app.get(Logger).log(`Received ${signal}, shutting down`, 'Worker');
    void app.close().then(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void bootstrap().catch((err: unknown) => {
  console.error('Fatal worker bootstrap error', err);
  process.exit(1);
});
