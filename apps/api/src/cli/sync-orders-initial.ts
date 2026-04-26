import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../db/prisma.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { MagentoStoreService } from '../modules/magento/magento-store.service';
import { MagentoClientFactory } from '../modules/magento/magento-client.factory';
import { OrderSyncService } from '../modules/orders/order-sync.service';
import type { Env } from '../config/env';

/**
 * Bulk sync of every Magento order into our `order` + `order_item` +
 * `order_status_history` tables. Idempotent. Respects the magento-client
 * rate limit (4 rps default).
 *
 * Usage:
 *   pnpm --filter @cdp/api cli sync:orders:initial [storeName]
 */
export async function runSyncOrdersInitial(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('sync:orders:initial');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const prisma = app.get(PrismaService);
  const tenants = app.get(TenantService);
  const stores = app.get(MagentoStoreService);
  const factory = app.get(MagentoClientFactory);
  const sync = app.get(OrderSyncService);

  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const storeName = argv[0] ?? 'default';
  const pageSize = 100;

  const tenant = await tenants.findBySlug(tenantSlug);
  const store = await stores.findByTenantAndName(tenant.id, storeName);
  const client = factory.forStore(store);

  await prisma.syncState.upsert({
    where: {
      tenantId_magentoStoreId_entity: {
        tenantId: tenant.id,
        magentoStoreId: store.id,
        entity: 'orders',
      },
    },
    create: {
      tenantId: tenant.id,
      magentoStoreId: store.id,
      entity: 'orders',
      status: 'running',
    },
    update: { status: 'running', lastError: null },
  });

  logger.log(`Starting initial order sync (tenant=${tenant.slug} store=${storeName})`);

  let processed = 0;
  let created = 0;
  let updated = 0;
  let lastUpdatedAt = '';
  const startedAt = Date.now();

  try {
    for await (const raw of client.orders.iterate({
      pageSize,
      sortOrders: [{ field: 'updated_at', direction: 'ASC' }],
    })) {
      const result = await sync.upsert({ tenantId: tenant.id, magentoStoreId: store.id }, raw);
      if (result.created) created += 1;
      else updated += 1;
      processed += 1;
      lastUpdatedAt = raw.updated_at;
      if (processed % 50 === 0) {
        const rate = (processed / ((Date.now() - startedAt) / 1000)).toFixed(1);
        logger.log(`  ${processed.toString()} orders (${rate} o/s) — last=${lastUpdatedAt}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Sync failed after ${processed.toString()} orders: ${message}`);
    await prisma.syncState.update({
      where: {
        tenantId_magentoStoreId_entity: {
          tenantId: tenant.id,
          magentoStoreId: store.id,
          entity: 'orders',
        },
      },
      data: { status: 'error', lastError: message.slice(0, 1000) },
    });
    return 1;
  }

  await prisma.syncState.update({
    where: {
      tenantId_magentoStoreId_entity: {
        tenantId: tenant.id,
        magentoStoreId: store.id,
        entity: 'orders',
      },
    },
    data: {
      status: 'idle',
      lastProcessedAt: new Date(),
      cursor: lastUpdatedAt || null,
    },
  });

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  logger.log(
    `Done. processed=${processed.toString()} created=${created.toString()} updated=${updated.toString()} elapsed=${elapsed.toString()}s`,
  );
  return 0;
}
