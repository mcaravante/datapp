import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantService } from '../modules/tenant/tenant.service';
import { OrderBackfillService } from '../modules/orders/order-backfill.service';
import type { Env } from '../config/env';

/**
 * Manually trigger the shipping_method backfill (the same logic the
 * daily BullMQ cron runs at 04:17). Useful right after the ACL fix
 * on the Magento integration token, when you don't want to wait for
 * the next scheduled tick.
 *
 * Usage: node /app/apps/api/dist/cli.js orders:backfill-shipping [storeName]
 */
export async function runBackfillShippingMethod(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('orders:backfill-shipping');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const tenants = app.get(TenantService);
  const backfill = app.get(OrderBackfillService);

  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await tenants.findBySlug(tenantSlug);
  const storeName = argv[0];

  const report = await backfill.backfillShippingForStore(tenant.id, storeName);
  logger.log(
    `Done. pending=${report.pending.toString()} updated=${report.updated.toString()} stillNull=${report.stillNull.toString()} durationMs=${report.durationMs.toString()}`,
  );
  return 0;
}
