import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../db/prisma.service';
import { RegionResolverService } from '../modules/geo/region-resolver.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { MagentoStoreService } from '../modules/magento/magento-store.service';
import type { Env } from '../config/env';

/**
 * Re-evaluate every `geo_unmatched` row with the current resolver and
 * delete those that now match a real region. Older deploys captured
 * these rows when the resolver didn't yet handle a case (alias added
 * later, accent-folding fixed, etc.); this command sweeps them out so
 * the audit panel only shows genuinely unresolved values.
 *
 * Idempotent. Safe to re-run.
 *
 * Usage: pnpm --filter @datapp/api cli geo:unmatched:cleanup [storeName]
 */
export async function runCleanupGeoUnmatched(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('geo:unmatched:cleanup');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const prisma = app.get(PrismaService);
  const resolver = app.get(RegionResolverService);
  const tenants = app.get(TenantService);
  const stores = app.get(MagentoStoreService);

  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await tenants.findBySlug(tenantSlug);
  const storeName = argv[0] ?? 'default';
  const store = await stores.findByTenantAndName(tenant.id, storeName);

  const rows = await prisma.geoUnmatched.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, regionRaw: true },
  });
  logger.log(`scanning ${rows.length} unmatched rows for tenant=${tenant.slug}`);

  const idsToDelete: string[] = [];
  for (const row of rows) {
    if (!row.regionRaw) continue;
    const { regionId } = resolver.resolve(store.defaultCountry, row.regionRaw);
    if (regionId !== null) idsToDelete.push(row.id);
  }

  if (idsToDelete.length === 0) {
    logger.log('nothing to delete — all remaining rows are genuinely unresolved.');
    return 0;
  }

  const result = await prisma.geoUnmatched.deleteMany({
    where: { id: { in: idsToDelete } },
  });
  logger.log(`deleted=${result.count} kept=${rows.length - result.count}`);
  return 0;
}
