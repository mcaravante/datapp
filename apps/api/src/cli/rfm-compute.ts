import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantService } from '../modules/tenant/tenant.service';
import { RfmService } from '../modules/rfm/rfm.service';
import type { Env } from '../config/env';

/**
 * On-demand RFM computation. The same code runs nightly via BullMQ;
 * this is the human override for backfills + dev iteration.
 *
 * Usage: pnpm --filter @datapp/api cli rfm:compute [tenantSlug]
 */
export async function runRfmCompute(app: INestApplicationContext, argv: string[]): Promise<number> {
  const logger = new Logger('rfm:compute');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const tenants = app.get(TenantService);
  const rfm = app.get(RfmService);

  const tenantSlug = argv[0] ?? config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await tenants.findBySlug(tenantSlug);

  const result = await rfm.run(tenant.id);
  logger.log(`Done — ${result.customers.toString()} customers in ${result.elapsedMs.toString()}ms`);
  if (Object.keys(result.bySegment).length > 0) {
    const breakdown = Object.entries(result.bySegment)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}=${v.toString()}`)
      .join(' ');
    logger.log(`Segments: ${breakdown}`);
  }
  return 0;
}
