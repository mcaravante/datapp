import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../db/prisma.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { MagentoStoreService } from '../modules/magento/magento-store.service';
import { MagentoClientFactory } from '../modules/magento/magento-client.factory';
import type { Env } from '../config/env';

const BATCH = 50;

/**
 * Re-fetch each Magento order to extract `shipping_method`. Earlier
 * sync runs only looked at the top-level `shipping_method` field,
 * which Magento often leaves blank — the real value lives under
 * `extension_attributes.shipping_assignments[].shipping.method`.
 *
 * Idempotent: skips orders that already have a value. Safe to re-run.
 *
 * Usage: pnpm --filter @datapp/api cli orders:backfill-shipping [storeName]
 */
export async function runBackfillShippingMethod(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('orders:backfill-shipping');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const prisma = app.get(PrismaService);
  const tenants = app.get(TenantService);
  const stores = app.get(MagentoStoreService);
  const factory = app.get(MagentoClientFactory);

  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await tenants.findBySlug(tenantSlug);
  const storeName = argv[0] ?? 'default';
  const store = await stores.findByTenantAndName(tenant.id, storeName);
  const client = factory.forStore(store);

  const total = await prisma.order.count({
    where: { tenantId: tenant.id, magentoStoreId: store.id, shippingMethod: null },
  });
  logger.log(`Backfilling shipping method · pending=${total}`);
  if (total === 0) return 0;

  let processed = 0;
  let updated = 0;
  let stillNull = 0;

  while (processed < total) {
    const batch = await prisma.order.findMany({
      where: { tenantId: tenant.id, magentoStoreId: store.id, shippingMethod: null },
      select: { id: true, magentoOrderId: true },
      orderBy: { placedAt: 'asc' },
      take: BATCH,
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      try {
        const raw = await client.orders.get(Number(row.magentoOrderId));
        const top =
          typeof raw.shipping_method === 'string' ? raw.shipping_method.trim() : '';
        const fromAssignment =
          raw.extension_attributes?.shipping_assignments?.[0]?.shipping?.method;
        const method =
          top.length > 0
            ? top
            : typeof fromAssignment === 'string' && fromAssignment.trim().length > 0
              ? fromAssignment.trim()
              : null;
        if (method !== null) {
          await prisma.order.update({
            where: { id: row.id },
            data: { shippingMethod: method },
            select: { id: true },
          });
          updated += 1;
        } else {
          stillNull += 1;
        }
      } catch (err) {
        logger.warn(
          `failed magento_order_id=${row.magentoOrderId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      processed += 1;
    }

    logger.log(
      `progress: scanned=${processed}/${total} updated=${updated} stillNull=${stillNull}`,
    );
  }

  logger.log(`Done. updated=${updated} stillNull=${stillNull} of ${total}`);
  return 0;
}
