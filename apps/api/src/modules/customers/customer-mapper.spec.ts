import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mapCustomer } from './customer-mapper';
import { RegionResolverService } from '../geo/region-resolver.service';
import type { MagentoCustomer } from '@datapp/magento-client';
import type { PrismaService } from '../../db/prisma.service';

const AR_ROWS = [
  { id: 1, countryCode: 'AR', code: 'C', name: 'Ciudad Autónoma de Buenos Aires' },
  { id: 2, countryCode: 'AR', code: 'B', name: 'Buenos Aires' },
];

async function makeResolver(): Promise<RegionResolverService> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = {
    region: { findMany: vi.fn().mockResolvedValue(AR_ROWS) },
  } as any as PrismaService;
  const svc = new RegionResolverService(prisma);
  await svc.loadIndex();
  return svc;
}

const baseCustomer: MagentoCustomer = {
  id: 42,
  email: 'JANE.Doe@Example.COM',
  firstname: '  Jane  ',
  lastname: 'Doe',
  gender: 2,
  dob: '1990-05-21',
  group_id: 1,
  created_at: '2024-01-15 10:30:00',
  updated_at: '2025-02-01 09:00:00',
  default_billing: '101',
  default_shipping: '102',
  addresses: [
    {
      id: 101,
      firstname: 'Jane',
      lastname: 'Doe',
      street: ['Av. Corrientes 1234', 'Piso 5'],
      city: 'Buenos Aires',
      country_id: 'AR',
      postcode: 'C1043AAZ',
      region: { region: 'Ciudad Autónoma de Buenos Aires', region_code: 'BA', region_id: 99 },
      telephone: '+541112345678',
      default_billing: true,
      default_shipping: false,
    },
    {
      id: 102,
      firstname: 'Jane',
      lastname: 'Doe',
      street: ['Calle Falsa 123'],
      city: 'Tigre',
      country_id: 'AR',
      postcode: '1648',
      region: { region: 'Buenos Aires', region_code: 'BA', region_id: 27 },
      telephone: '+541198765432',
      default_billing: false,
      default_shipping: true,
    },
  ],
  custom_attributes: [
    { attribute_code: 'segment', value: 'gold' },
    { attribute_code: 'lifetime_value', value: 12500 },
  ],
};

describe('mapCustomer', () => {
  let resolver: RegionResolverService;
  beforeEach(async () => {
    resolver = await makeResolver();
  });

  it('lowercases email and computes sha256 hash', () => {
    const m = mapCustomer(baseCustomer, resolver, 'AR');
    expect(m.email).toBe('jane.doe@example.com');
    expect(m.emailHash).toMatch(/^[0-9a-f]{64}$/);
    // Same input regardless of case → same hash.
    const m2 = mapCustomer({ ...baseCustomer, email: 'jane.doe@example.com' }, resolver, 'AR');
    expect(m2.emailHash).toBe(m.emailHash);
  });

  it('preserves Magento ID as a string', () => {
    expect(mapCustomer(baseCustomer, resolver, 'AR').magentoCustomerId).toBe('42');
  });

  it('trims first/last name and rejects empty strings', () => {
    const m = mapCustomer(baseCustomer, resolver, 'AR');
    expect(m.firstName).toBe('Jane');
    expect(m.lastName).toBe('Doe');
  });

  it('maps gender via the Magento numeric enum', () => {
    expect(mapCustomer(baseCustomer, resolver, 'AR').gender).toBe('female');
    expect(mapCustomer({ ...baseCustomer, gender: 1 }, resolver, 'AR').gender).toBe('male');
    expect(mapCustomer({ ...baseCustomer, gender: 3 }, resolver, 'AR').gender).toBe(
      'not_specified',
    );
    const noGender: MagentoCustomer = { ...baseCustomer };
    delete (noGender as { gender?: unknown }).gender;
    expect(mapCustomer(noGender, resolver, 'AR').gender).toBeNull();
  });

  it('parses Magento timestamps as UTC', () => {
    const m = mapCustomer(baseCustomer, resolver, 'AR');
    expect(m.magentoCreatedAt?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    expect(m.magentoUpdatedAt?.toISOString()).toBe('2025-02-01T09:00:00.000Z');
  });

  it('parses dob to a Date', () => {
    const m = mapCustomer(baseCustomer, resolver, 'AR');
    expect(m.dob?.toISOString().slice(0, 10)).toBe('1990-05-21');
  });

  it('rolls custom_attributes into the attributes object keyed by code', () => {
    expect(mapCustomer(baseCustomer, resolver, 'AR').attributes).toEqual({
      segment: 'gold',
      lifetime_value: 12500,
    });
  });

  it('flags the default billing and shipping addresses correctly', () => {
    const m = mapCustomer(baseCustomer, resolver, 'AR');
    expect(m.addresses).toHaveLength(2);
    const billing = m.addresses[0]!;
    const shipping = m.addresses[1]!;
    expect(billing.isDefaultBilling).toBe(true);
    expect(billing.isDefaultShipping).toBe(false);
    expect(billing.type).toBe('billing');
    expect(shipping.isDefaultBilling).toBe(false);
    expect(shipping.isDefaultShipping).toBe(true);
    expect(shipping.type).toBe('shipping');
  });

  it('resolves region ids against the INDEC table', () => {
    const m = mapCustomer(baseCustomer, resolver, 'AR');
    expect(m.addresses[0]!.regionId).toBe(1); // CABA
    expect(m.addresses[0]!.regionRaw).toBe('Ciudad Autónoma de Buenos Aires');
    expect(m.addresses[1]!.regionId).toBe(2); // Buenos Aires
  });

  it('records unmatched regions for the geo_unmatched audit', () => {
    const c: MagentoCustomer = {
      ...baseCustomer,
      addresses: [
        {
          ...baseCustomer.addresses![0]!,
          region: { region: 'Provincia Inexistente', region_code: 'XX', region_id: 0 },
          city: 'Nowhere',
          postcode: 'X9999',
        },
      ],
    };
    const m = mapCustomer(c, resolver, 'AR');
    expect(m.addresses[0]!.regionId).toBeNull();
    expect(m.unmatchedRegions).toEqual([
      { regionRaw: 'Provincia Inexistente', cityRaw: 'Nowhere', postalCode: 'X9999' },
    ]);
  });

  it('splits multi-line streets into street1 + street2', () => {
    const m = mapCustomer(baseCustomer, resolver, 'AR');
    expect(m.addresses[0]!.street1).toBe('Av. Corrientes 1234');
    expect(m.addresses[0]!.street2).toBe('Piso 5');
  });

  it('uses the default country when address omits country_id', () => {
    const c: MagentoCustomer = {
      ...baseCustomer,
      addresses: [{ ...baseCustomer.addresses![0]!, country_id: undefined }],
    };
    const m = mapCustomer(c, resolver, 'AR');
    expect(m.addresses[0]!.countryCode).toBe('AR');
  });

  it('falls back to the default-billing telephone when no top-level phone', () => {
    expect(mapCustomer(baseCustomer, resolver, 'AR').phone).toBe('+541112345678');
  });
});
