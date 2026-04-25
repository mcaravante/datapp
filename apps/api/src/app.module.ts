import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loadEnv } from './config/env';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => loadEnv(config as NodeJS.ProcessEnv),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-crm-signature"]',
            '*.password',
            '*.passwordHash',
            '*.email',
            '*.phone',
          ],
          censor: '[redacted]',
        },
        transport:
          process.env['NODE_ENV'] === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
      },
    }),
    ThrottlerModule.forRoot([
      { name: 'admin', ttl: 60_000, limit: 60 }, // 60 rpm per IP for admin
      { name: 'ingest', ttl: 60_000, limit: 600 }, // 600 rpm per IP for ingest
    ]),
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
