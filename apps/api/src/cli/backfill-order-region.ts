import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantService } from '../modules/tenant/tenant.service';
import { OrderBackfillService } from '../modules/orders/order-backfill.service';
import type { Env } from '../config/env';

/**
 * Manually trigger the region_id backfill. Pure CPU — re-runs the
 * region resolver against stored billing/shipping addresses, no
 * Magento round-trips. The daily BullMQ cron runs the same logic at
 * 04:17.
 *
 * Usage: node /app/apps/api/dist/cli.js orders:backfill-region
 */
export async function runBackfillOrderRegion(
  app: INestApplicationContext,
): Promise<number> {
  const logger = new Logger('orders:backfill-region');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const tenants = app.get(TenantService);
  const backfill = app.get(OrderBackfillService);

  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await tenants.findBySlug(tenantSlug);

  const report = await backfill.backfillRegionForTenant(tenant.id);
  logger.log(
    `Done. pending=${report.pending.toString()} updated=${report.updated.toString()} stillNull=${report.stillNull.toString()} durationMs=${report.durationMs.toString()}`,
  );
  return 0;
}
