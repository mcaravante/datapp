/**
 * Database seed.
 *  - 24 Argentine provinces (ISO 3166-2:AR codes, INDEC canonical names)
 *  - Default tenant (driven by env `DEFAULT_TENANT_SLUG`)
 *
 * Idempotent: safe to re-run.
 */
import { PrismaClient } from '../generated/client/index.js';

const prisma = new PrismaClient();

const AR_PROVINCES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'C', name: 'Ciudad Autónoma de Buenos Aires' },
  { code: 'B', name: 'Buenos Aires' },
  { code: 'K', name: 'Catamarca' },
  { code: 'H', name: 'Chaco' },
  { code: 'U', name: 'Chubut' },
  { code: 'X', name: 'Córdoba' },
  { code: 'W', name: 'Corrientes' },
  { code: 'E', name: 'Entre Ríos' },
  { code: 'P', name: 'Formosa' },
  { code: 'Y', name: 'Jujuy' },
  { code: 'L', name: 'La Pampa' },
  { code: 'F', name: 'La Rioja' },
  { code: 'M', name: 'Mendoza' },
  { code: 'N', name: 'Misiones' },
  { code: 'Q', name: 'Neuquén' },
  { code: 'R', name: 'Río Negro' },
  { code: 'A', name: 'Salta' },
  { code: 'J', name: 'San Juan' },
  { code: 'D', name: 'San Luis' },
  { code: 'Z', name: 'Santa Cruz' },
  { code: 'S', name: 'Santa Fe' },
  { code: 'G', name: 'Santiago del Estero' },
  { code: 'V', name: 'Tierra del Fuego, Antártida e Islas del Atlántico Sur' },
  { code: 'T', name: 'Tucumán' },
];

async function seedRegions(): Promise<void> {
  for (const p of AR_PROVINCES) {
    await prisma.region.upsert({
      where: { countryCode_code: { countryCode: 'AR', code: p.code } },
      update: { name: p.name, isActive: true },
      create: { countryCode: 'AR', code: p.code, name: p.name, isActive: true },
    });
  }
  console.warn(`[seed] Argentine provinces: ${AR_PROVINCES.length} upserted`);
}

async function seedDefaultTenant(): Promise<void> {
  const slug = process.env['DEFAULT_TENANT_SLUG'];
  if (!slug) {
    console.warn('[seed] DEFAULT_TENANT_SLUG not set — skipping default tenant');
    return;
  }
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { slug, name: slug, settings: {} },
  });
  console.warn(`[seed] tenant ready: ${tenant.slug} (${tenant.id})`);
}

async function main(): Promise<void> {
  await seedRegions();
  await seedDefaultTenant();
}

main()
  .catch((err: unknown) => {
    console.error('[seed] failed', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
