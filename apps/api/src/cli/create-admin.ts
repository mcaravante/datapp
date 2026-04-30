import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../db/prisma.service';
import { AuthService } from '../modules/auth/auth.service';
import type { Env } from '../config/env';

/**
 * Idempotent: creates or updates an admin user for the default tenant.
 *
 * Usage:
 *   pnpm --filter @datapp/api cli create-admin <email> [password]
 *
 * If `password` is omitted, a random 24-char base64url password is
 * generated and printed once. Existing users keep their password unless
 * a new one is supplied.
 */
export async function runCreateAdmin(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('create-admin');
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const prisma = app.get(PrismaService);

  const emailRaw = argv[0];
  const explicitPassword = argv[1];
  if (!emailRaw) {
    console.error('Usage: cli create-admin <email> [password]');
    return 2;
  }
  const email = emailRaw.toLowerCase();

  const tenantSlug = config.get<string>('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    logger.error(`Tenant '${tenantSlug}' not found — run \`pnpm db:seed\` first`);
    return 2;
  }

  const password = explicitPassword ?? randomBytes(18).toString('base64url');
  const passwordHash = await AuthService.hashPassword(password);
  const name = email.split('@')[0] ?? 'admin';

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: 'admin', name, tenantId: tenant.id },
    });
    logger.log(`Admin updated: ${email} (id=${existing.id})`);
  } else {
    const user = await prisma.user.create({
      data: { email, passwordHash, role: 'admin', name, tenantId: tenant.id },
      select: { id: true },
    });
    logger.log(`Admin created: ${email} (id=${user.id})`);
  }

  if (!explicitPassword) {
    // Logger redacts a lot — the generated password must surface. Plain
    // console so the user can copy it.
    console.log('');
    console.log(`Generated password for ${email}:`);
    console.log(`  ${password}`);
    console.log('Store it now — it is not recoverable from the database.');
    console.log('');
  }
  return 0;
}
