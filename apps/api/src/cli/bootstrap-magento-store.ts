import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../db/prisma.service';
import { CryptoService } from '../modules/crypto/crypto.service';
import type { Env } from '../config/env';

/**
 * Idempotent: creates or updates a `magento_store` row for the default
 * tenant using `MAGENTO_*` env vars. Encrypts the admin token + HMAC
 * secret with the master key.
 *
 * Usage:
 *   pnpm --filter @datapp/api cli magento-store:bootstrap [name]
 *
 * The optional `name` argument is the store handle written to
 * `magento_store.name` and matched by the X-Crm-Store header. Defaults
 * to "default".
 */
export async function runBootstrapMagentoStore(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('bootstrap-magento-store');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const prisma = app.get(PrismaService);
  const crypto = app.get(CryptoService);

  const name = argv[0] ?? 'default';
  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const baseUrl = config.get<string | undefined>('MAGENTO_BASE_URL', { infer: true });
  const adminToken = config.get<string | undefined>('MAGENTO_ADMIN_TOKEN', { infer: true });
  const hmacSecret = config.get<string | undefined>('MAGENTO_HMAC_SECRET', { infer: true });

  if (!baseUrl || !adminToken || !hmacSecret) {
    logger.error('MAGENTO_BASE_URL, MAGENTO_ADMIN_TOKEN, and MAGENTO_HMAC_SECRET are required');
    return 2;
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    logger.error(`Tenant '${tenantSlug}' not found — run \`pnpm db:seed\` first`);
    return 2;
  }

  const adminTokenEncrypted = crypto.encrypt(adminToken);
  const hmacSecretEncrypted = crypto.encrypt(hmacSecret);

  const store = await prisma.magentoStore.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name } },
    create: {
      tenantId: tenant.id,
      name,
      baseUrl,
      adminTokenEncrypted,
      hmacSecretEncrypted,
      currencyCode: 'ARS',
      defaultCountry: 'AR',
      isActive: true,
    },
    update: {
      baseUrl,
      adminTokenEncrypted,
      hmacSecretEncrypted,
      isActive: true,
    },
    select: { id: true, name: true, baseUrl: true },
  });

  logger.log(
    `Magento store ready: tenant=${tenant.slug} name=${store.name} id=${store.id} url=${store.baseUrl}`,
  );
  return 0;
}
