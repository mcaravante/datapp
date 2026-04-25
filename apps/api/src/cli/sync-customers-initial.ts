import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../db/prisma.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { MagentoStoreService } from '../modules/magento/magento-store.service';
import { MagentoClientFactory } from '../modules/magento/magento-client.factory';
import { CustomerSyncService } from '../modules/customers/customer-sync.service';
import type { Env } from '../config/env';

/**
 * Bulk sync of every Magento customer into our `customer_profile` table.
 * Idempotent: re-running upserts. Uses the magento-client's paged
 * iterator with the rate limit baked in.
 *
 * Usage:
 *   pnpm --filter @cdp/api cli sync:customers:initial [storeName]
 *
 * `storeName` defaults to "default" (the bootstrap CLI's default).
 */
export async function runSyncCustomersInitial(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('sync:customers:initial');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const prisma = app.get(PrismaService);
  const tenants = app.get(TenantService);
  const stores = app.get(MagentoStoreService);
  const factory = app.get(MagentoClientFactory);
  const sync = app.get(CustomerSyncService);

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
        entity: 'customers',
      },
    },
    create: {
      tenantId: tenant.id,
      magentoStoreId: store.id,
      entity: 'customers',
      status: 'running',
    },
    update: { status: 'running', lastError: null },
  });

  logger.log(`Starting initial customer sync (tenant=${tenant.slug} store=${storeName})`);

  let processed = 0;
  let created = 0;
  let updated = 0;
  let lastUpdatedAt = '';
  const startedAt = Date.now();

  try {
    for await (const raw of client.customers.iterate({
      pageSize,
      sortOrders: [{ field: 'updated_at', direction: 'ASC' }],
    })) {
      const result = await sync.upsert(
        { tenantId: tenant.id, defaultCountry: store.defaultCountry },
        raw,
      );
      if (result.created) created += 1;
      else updated += 1;
      processed += 1;
      lastUpdatedAt = raw.updated_at;
      if (processed % 200 === 0) {
        const rate = (processed / ((Date.now() - startedAt) / 1000)).toFixed(1);
        logger.log(`  ${processed.toString()} customers (${rate} c/s) — last=${lastUpdatedAt}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Sync failed after ${processed.toString()} customers: ${message}`);
    await prisma.syncState.update({
      where: {
        tenantId_magentoStoreId_entity: {
          tenantId: tenant.id,
          magentoStoreId: store.id,
          entity: 'customers',
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
        entity: 'customers',
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
