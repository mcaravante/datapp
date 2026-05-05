import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loadEnv } from './config/env';
import { PrismaModule } from './db/prisma.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { MagentoModule } from './modules/magento/magento.module';
import { QueueModule } from './modules/queue/queue.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { UsersModule } from './modules/users/users.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { GeoModule } from './modules/geo/geo.module';
import { CustomersModule } from './modules/customers/customers.module';
import { CustomerGroupsModule } from './modules/customer-groups/customer-groups.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CartsModule } from './modules/carts/carts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CurrencyRatesModule } from './modules/currency-rates/currency-rates.module';
import { RfmModule } from './modules/rfm/rfm.module';
import { HealthModule } from './modules/health/health.module';
import { SyncModule } from './modules/sync/sync.module';
import { EmailModule } from './modules/email/email.module';
import { EmailSuppressionModule } from './modules/email-suppression/email-suppression.module';
import { CouponStrategyModule } from './modules/coupon-strategy/coupon-strategy.module';
import { AbandonedCartRecoveryModule } from './modules/abandoned-cart-recovery/abandoned-cart-recovery.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { MediaModule } from './modules/media/media.module';
import { BrandingModule } from './modules/branding/branding.module';

// Phase 3 — abandoned-cart recovery vertical. Loaded only when the
// engine is opted in (default off). See docs/adr/0007.
function emailEngineModules(): (DynamicModule | typeof EmailModule)[] {
  const enabled = process.env['EMAIL_ENGINE_ENABLED'] === 'true';
  if (!enabled) return [];
  return [
    EmailSuppressionModule,
    EmailModule,
    CouponStrategyModule,
    AbandonedCartRecoveryModule,
    CampaignsModule,
  ];
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => loadEnv(config as NodeJS.ProcessEnv),
    }),
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
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
    // Default policy: 600 rpm per identity. The Next.js admin proxies
    // every operator's request server-to-server, so all admin traffic
    // shares ONE source IP. 60 rpm got hit constantly with multiple
    // operators clicking around (filters + paging + range changes
    // each fan out 5-8 calls). 600 ≈ 10 rps which is still a hard cap
    // against runaway loops or attacker scrapers, but doesn't choke
    // legitimate browsing. Ingest endpoints override locally if they
    // need more.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    CryptoModule,
    TenantModule,
    MagentoModule,
    GeoModule,
    QueueModule,
    MailerModule,
    AuditModule,
    AuthModule,
    UsersModule,
    PermissionsModule,
    CustomersModule,
    CustomerGroupsModule,
    OrdersModule,
    CartsModule,
    CurrencyRatesModule,
    AnalyticsModule,
    RfmModule,
    HealthModule,
    SyncModule,
    MediaModule,
    BrandingModule,
    ...emailEngineModules(),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
