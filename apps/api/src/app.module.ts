import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loadEnv } from './config/env';
import { PrismaModule } from './db/prisma.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { MagentoModule } from './modules/magento/magento.module';
import { QueueModule } from './modules/queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { GeoModule } from './modules/geo/geo.module';
import { CustomersModule } from './modules/customers/customers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { HealthModule } from './modules/health/health.module';
import { SyncModule } from './modules/sync/sync.module';

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
        ...(process.env['NODE_ENV'] === 'development'
          ? {
              transport: {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              },
            }
          : {}),
      },
    }),
    // Default policy: 60 rpm per IP. Ingest endpoints override to 600 rpm
    // via `@Throttle({ default: { ttl: 60_000, limit: 600 } })`.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    CryptoModule,
    TenantModule,
    MagentoModule,
    GeoModule,
    QueueModule,
    AuthModule,
    CustomersModule,
    OrdersModule,
    HealthModule,
    SyncModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
