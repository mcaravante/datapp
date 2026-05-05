import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantService } from '../modules/tenant/tenant.service';
import { CustomerGroupsService } from '../modules/customer-groups/customer-groups.service';
import type { Env } from '../config/env';

/**
 * Pulls Magento's `/V1/customerGroups/search`, upserts each group into
 * `customer_group`, and links every `customer_profile` whose name still
 * resolves to NULL on the FK. Idempotent — safe to re-run after the
 * daily cron at 04:32 already covers this.
 *
 * Usage: node /app/apps/api/dist/cli.js customer-groups:sync
 */
export async function runSyncCustomerGroups(
  app: INestApplicationContext,
): Promise<number> {
  const logger = new Logger('customer-groups:sync');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const tenants = app.get(TenantService);
  const service = app.get(CustomerGroupsService);

  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await tenants.findBySlug(tenantSlug);

  const report = await service.syncForTenant(tenant.id);
  logger.log(
    `Done. scanned=${report.scanned.toString()} upserted=${report.upserted.toString()} profileLinks=${report.profileLinks.toString()} durationMs=${report.durationMs.toString()}`,
  );
  return 0;
}
