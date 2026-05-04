import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';

/**
 * Quick "is the data really gone?" diagnostic — counts rows on the
 * tables an operator interacts with, broken down per tenant. Used
 * when something visible in the admin UI doesn't appear and we need
 * to know whether the data is truly missing or just hidden behind a
 * tenant-id filter mismatch.
 *
 * Usage (from inside the api / worker container):
 *   node /app/apps/api/dist/cli.js diag:counts
 */
export async function runDiagnoseCounts(
  app: INestApplicationContext,
): Promise<number> {
  const logger = new Logger('diag:counts');
  const prisma = app.get(PrismaService);

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  logger.log(`Tenants: ${tenants.length.toString()}`);
  for (const t of tenants) {
    logger.log(
      `  - ${t.slug} (${t.id}) "${t.name}" — created ${t.createdAt.toISOString()}`,
    );
  }

  const [
    excludedTotal,
    methodLabelTotal,
    orderTotal,
    customerTotal,
    userTotal,
  ] = await Promise.all([
    prisma.reportExcludedEmail.count(),
    prisma.analyticsMethodLabel.count(),
    prisma.order.count(),
    prisma.customerProfile.count(),
    prisma.user.count(),
  ]);

  logger.log('--- Total row counts (across ALL tenants) ---');
  logger.log(`report_excluded_email   : ${excludedTotal.toString()}`);
  logger.log(`analytics_method_label  : ${methodLabelTotal.toString()}`);
  logger.log(`order                   : ${orderTotal.toString()}`);
  logger.log(`customer_profile        : ${customerTotal.toString()}`);
  logger.log(`"user"                  : ${userTotal.toString()}`);

  if (tenants.length > 1 || excludedTotal > 0 || methodLabelTotal > 0) {
    logger.log('--- Per-tenant breakdown ---');
    for (const t of tenants) {
      const [excluded, labels, orders, customers] = await Promise.all([
        prisma.reportExcludedEmail.count({ where: { tenantId: t.id } }),
        prisma.analyticsMethodLabel.count({ where: { tenantId: t.id } }),
        prisma.order.count({ where: { tenantId: t.id } }),
        prisma.customerProfile.count({ where: { tenantId: t.id } }),
      ]);
      logger.log(
        `${t.slug.padEnd(20)} excluded=${excluded.toString().padStart(4)} labels=${labels.toString().padStart(4)} orders=${orders.toString().padStart(7)} customers=${customers.toString().padStart(6)}`,
      );
    }
  }

  return 0;
}
