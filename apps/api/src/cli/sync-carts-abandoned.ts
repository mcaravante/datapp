import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantService } from '../modules/tenant/tenant.service';
import { AbandonedCartSyncService } from '../modules/carts/abandoned-cart-sync.service';
import type { Env } from '../config/env';

/**
 * One-shot population of the `abandoned_cart` snapshot. The cron in
 * `CartsModule` keeps it fresh, but we run this once on first deploy
 * (or after long downtime) so /carts has data immediately.
 *
 * Usage:
 *   pnpm --filter @datapp/api cli sync:carts:abandoned [storeName]
 */
export async function runSyncCartsAbandoned(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('sync:carts:abandoned');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const tenants = app.get(TenantService);
  const sync = app.get(AbandonedCartSyncService);

  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await tenants.findBySlug(tenantSlug);
  const storeName = argv[0];

  logger.log(`Starting abandoned cart sweep for tenant=${tenant.slug}`);
  const result = await sync.sweepStore(tenant.id, storeName);
  logger.log(
    `Done. fetched=${result.fetched} upserted=${result.upserted} removed=${result.removed} elapsedMs=${result.durationMs}`,
  );
  return 0;
}
