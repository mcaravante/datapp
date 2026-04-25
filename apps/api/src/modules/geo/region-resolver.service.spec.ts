import { describe, expect, it, beforeEach, vi } from 'vitest';
import { RegionResolverService, normalize } from './region-resolver.service';
import type { PrismaService } from '../../db/prisma.service';

const AR_ROWS = [
  { id: 1, countryCode: 'AR', code: 'C', name: 'Ciudad Autónoma de Buenos Aires' },
  { id: 2, countryCode: 'AR', code: 'B', name: 'Buenos Aires' },
  { id: 3, countryCode: 'AR', code: 'X', name: 'Córdoba' },
  { id: 4, countryCode: 'AR', code: 'E', name: 'Entre Ríos' },
  {
    id: 5,
    countryCode: 'AR',
    code: 'V',
    name: 'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
  },
  { id: 6, countryCode: 'AR', code: 'S', name: 'Santa Fe' },
];

function makeService(): RegionResolverService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = {
    region: { findMany: vi.fn().mockResolvedValue(AR_ROWS) },
  } as any as PrismaService;
  return new RegionResolverService(prisma);
}

describe('normalize', () => {
  it('lowercases', () => {
    expect(normalize('BUENOS AIRES')).toBe('buenosaires');
  });

  it('strips accents', () => {
    expect(normalize('Córdoba')).toBe('cordoba');
    expect(normalize('Entre Ríos')).toBe('entrerios');
  });

  it('drops punctuation and whitespace', () => {
    expect(normalize('Tierra del Fuego, Antártida e Islas del Atlántico Sur')).toBe(
      'tierradelfuegoantartidaeislasdelatlanticosur',
    );
  });

  it('returns empty for empty input', () => {
    expect(normalize('   ')).toBe('');
  });
});

describe('RegionResolverService.resolve', () => {
  let svc: RegionResolverService;
  beforeEach(async () => {
    svc = makeService();
    await svc.loadIndex();
  });

  it('resolves canonical names with accents', () => {
    expect(svc.resolve('AR', 'Córdoba').regionId).toBe(3);
    expect(svc.resolve('AR', 'Entre Ríos').regionId).toBe(4);
  });

  it('resolves canonical names without accents (typed by humans)', () => {
    expect(svc.resolve('AR', 'cordoba').regionId).toBe(3);
    expect(svc.resolve('AR', 'entre rios').regionId).toBe(4);
  });

  it('resolves the CABA aliases', () => {
    expect(svc.resolve('AR', 'CABA').regionId).toBe(1);
    expect(svc.resolve('AR', 'Capital Federal').regionId).toBe(1);
    expect(svc.resolve('AR', 'Ciudad Autónoma de Buenos Aires').regionId).toBe(1);
  });

  it('resolves Tierra del Fuego short form', () => {
    expect(svc.resolve('AR', 'Tierra del Fuego').regionId).toBe(5);
  });

  it('resolves the Magento object form', () => {
    const r = svc.resolve('AR', { region: 'Buenos Aires', region_code: 'BA', region_id: 99 });
    expect(r.regionId).toBe(2);
    expect(r.canonicalName).toBe('Buenos Aires');
  });

  it('falls back to region_code when region name is missing', () => {
    const r = svc.resolve('AR', { region: null, region_code: 'C', region_id: null });
    expect(r.regionId).toBe(1);
  });

  it('returns null for unknown values', () => {
    const r = svc.resolve('AR', 'Andorra la Vella');
    expect(r.regionId).toBeNull();
    expect(r.canonicalName).toBeNull();
  });

  it('returns null for an unknown country code (no rows loaded)', () => {
    expect(svc.resolve('FR', 'Île-de-France').regionId).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(svc.resolve('AR', null).regionId).toBeNull();
    expect(svc.resolve('AR', undefined).regionId).toBeNull();
  });

  it('canonicalName always reflects the seeded INDEC spelling', () => {
    expect(svc.resolve('AR', 'cordoba').canonicalName).toBe('Córdoba');
    expect(svc.resolve('AR', 'CABA').canonicalName).toBe('Ciudad Autónoma de Buenos Aires');
  });
});
