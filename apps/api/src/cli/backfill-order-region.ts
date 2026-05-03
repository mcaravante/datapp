import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../db/prisma.service';
import { RegionResolverService } from '../modules/geo/region-resolver.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { MagentoStoreService } from '../modules/magento/magento-store.service';
import type { Env } from '../config/env';

const BATCH_SIZE = 500;

/**
 * Resolve `Order.region_id` for every existing row using the same
 * alias-aware `RegionResolverService` that the live sync relies on.
 * Idempotent — safe to re-run; already-resolved rows are skipped.
 *
 * Usage: pnpm --filter @datapp/api cli orders:backfill-region [storeName]
 */
export async function runBackfillOrderRegion(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('orders:backfill-region');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const prisma = app.get(PrismaService);
  const resolver = app.get(RegionResolverService);
  const tenants = app.get(TenantService);
  const stores = app.get(MagentoStoreService);

  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await tenants.findBySlug(tenantSlug);
  const storeName = argv[0] ?? 'default';
  const store = await stores.findByTenantAndName(tenant.id, storeName);

  const total = await prisma.order.count({
    where: { tenantId: tenant.id, regionId: null },
  });
  logger.log(`Backfilling region for tenant=${tenant.slug} pending=${total}`);
  if (total === 0) return 0;

  let processed = 0;
  let matched = 0;

  // Use placedAt as a stable cursor to avoid re-scanning orders we
  // already updated this run. Each batch grabs the next slice with
  // `regionId IS NULL` so a re-run picks up only what's left.
  while (processed < total) {
    const batch = await prisma.order.findMany({
      where: { tenantId: tenant.id, regionId: null },
      select: { id: true, shippingAddress: true, billingAddress: true },
      orderBy: { placedAt: 'asc' },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;

    const updates = batch
      .map((row) => ({
        id: row.id,
        regionId: pickRegionId(resolver, store.defaultCountry, row),
      }))
      .filter((u): u is { id: string; regionId: number } => u.regionId !== null);

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.order.update({
            where: { id: u.id },
            data: { regionId: u.regionId },
            select: { id: true },
          }),
        ),
      );
      matched += updates.length;
    }

    processed += batch.length;
    logger.log(
      `progress: scanned=${processed}/${total} matched=${matched} unmatched=${processed - matched}`,
    );

    // If a whole batch fails to match anything we'd loop forever
    // (the WHERE still returns the same rows). Break out — those
    // remaining orders will be left as `region_id = NULL`, which is
    // the right answer.
    if (updates.length === 0) {
      logger.log(
        `No matches in last batch; remaining ${total - processed} rows have addresses we cannot resolve. Stopping.`,
      );
      break;
    }
  }

  logger.log(`Done. matched=${matched} unmatched=${processed - matched} of ${total}`);
  return 0;
}

function pickRegionId(
  resolver: RegionResolverService,
  defaultCountry: string,
  row: {
    shippingAddress: unknown;
    billingAddress: unknown;
  },
): number | null {
  for (const addr of [row.shippingAddress, row.billingAddress]) {
    if (!addr || typeof addr !== 'object') continue;
    const obj = addr as Record<string, unknown>;
    const country =
      typeof obj.country_id === 'string' && obj.country_id.length > 0
        ? obj.country_id
        : defaultCountry;
    const region = obj.region;
    if (!region) continue;
    const { regionId } = resolver.resolve(country, region);
    if (regionId !== null) return regionId;
  }
  return null;
}
