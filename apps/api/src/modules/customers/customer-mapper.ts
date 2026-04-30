import { createHash } from 'node:crypto';
import type { MagentoAddress, MagentoCustomer } from '@datapp/magento-client';
import type { RegionResolverService } from '../geo/region-resolver.service';

export type AddressType = 'billing' | 'shipping' | 'both';

export interface MappedAddress {
  type: AddressType;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  regionId: number | null;
  regionRaw: string | null;
  postalCode: string | null;
  countryCode: string;
  phone: string | null;
}

export interface MappedCustomer {
  magentoCustomerId: string;
  email: string;
  emailHash: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dob: Date | null;
  gender: string | null;
  customerGroup: string | null;
  magentoCreatedAt: Date | null;
  magentoUpdatedAt: Date | null;
  /** All fields the schema doesn't model explicitly land here. */
  attributes: Record<string, unknown>;
  addresses: MappedAddress[];
  /** When the address has a region we couldn't match — caller writes geo_unmatched. */
  unmatchedRegions: { regionRaw: string; cityRaw: string | null; postalCode: string | null }[];
}

const GENDER_MAP: Readonly<Record<number, string>> = {
  1: 'male',
  2: 'female',
  3: 'not_specified',
};

/**
 * Pure mapper from a Magento customer (as returned by `customers/:id`
 * or `customers/search`) to our CDP shape. Side-effect-free; the only
 * dependency is the in-memory region resolver.
 */
export function mapCustomer(
  raw: MagentoCustomer,
  regionResolver: RegionResolverService,
  defaultCountry: string,
): MappedCustomer {
  const email = raw.email.toLowerCase();
  const emailHash = createHash('sha256').update(email).digest('hex');

  const customerAttributesArray = raw.custom_attributes ?? [];
  const attributesByCode: Record<string, unknown> = {};
  for (const attr of customerAttributesArray) {
    attributesByCode[attr.attribute_code] = attr.value;
  }

  const defaultBillingId = raw.default_billing ? String(raw.default_billing) : null;
  const defaultShippingId = raw.default_shipping ? String(raw.default_shipping) : null;

  const addresses: MappedAddress[] = [];
  const unmatchedRegions: MappedCustomer['unmatchedRegions'] = [];

  for (const addr of raw.addresses ?? []) {
    const isDefaultBilling =
      addr.default_billing === true ||
      (defaultBillingId !== null && addr.id !== undefined && String(addr.id) === defaultBillingId);
    const isDefaultShipping =
      addr.default_shipping === true ||
      (defaultShippingId !== null &&
        addr.id !== undefined &&
        String(addr.id) === defaultShippingId);

    const type: AddressType =
      isDefaultBilling && isDefaultShipping
        ? 'both'
        : isDefaultBilling
          ? 'billing'
          : isDefaultShipping
            ? 'shipping'
            : 'shipping';

    const countryCode = (addr.country_id ?? defaultCountry).toUpperCase();
    const region = regionResolver.resolve(countryCode, addr.region ?? addr.region_id ?? null);
    const street = addr.street ?? [];
    const regionRaw = describeRegion(addr);

    if (region.regionId === null && regionRaw !== null) {
      unmatchedRegions.push({
        regionRaw,
        cityRaw: addr.city ?? null,
        postalCode: addr.postcode ?? null,
      });
    }

    addresses.push({
      type,
      isDefaultBilling,
      isDefaultShipping,
      firstName: nonEmpty(addr.firstname),
      lastName: nonEmpty(addr.lastname),
      company: nonEmpty(addr.company),
      street1: nonEmpty(street[0]),
      street2: nonEmpty(street[1]),
      city: nonEmpty(addr.city),
      regionId: region.regionId,
      regionRaw,
      postalCode: nonEmpty(addr.postcode),
      countryCode,
      phone: nonEmpty(addr.telephone),
    });
  }

  const dob = raw.dob ? safeDate(raw.dob) : null;
  const magentoCreatedAt = safeDate(raw.created_at);
  const magentoUpdatedAt = safeDate(raw.updated_at);

  const result: MappedCustomer = {
    magentoCustomerId: String(raw.id),
    email,
    emailHash,
    firstName: nonEmpty(raw.firstname),
    lastName: nonEmpty(raw.lastname),
    phone: pickPhone(raw, addresses),
    dob,
    gender: typeof raw.gender === 'number' ? (GENDER_MAP[raw.gender] ?? null) : null,
    customerGroup: typeof raw.group_id === 'number' ? String(raw.group_id) : null,
    magentoCreatedAt,
    magentoUpdatedAt,
    attributes: attributesByCode,
    addresses,
    unmatchedRegions,
  };
  return result;
}

function nonEmpty(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const trimmed = s.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Magento returns 'YYYY-MM-DD HH:mm:ss' (UTC) — convert to ISO so Date parses it as UTC.
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function describeRegion(addr: MagentoAddress): string | null {
  if (typeof addr.region === 'string') return nonEmpty(addr.region);
  if (addr.region && typeof addr.region === 'object') {
    const obj = addr.region as { region?: string | null; region_code?: string | null };
    return nonEmpty(obj.region ?? obj.region_code ?? null);
  }
  return null;
}

/** Customer-level phone is sometimes empty; fall back to the default address. */
function pickPhone(customer: MagentoCustomer, addresses: MappedAddress[]): string | null {
  const fromCustomer = nonEmpty((customer as unknown as { telephone?: string }).telephone);
  if (fromCustomer) return fromCustomer;
  const defaultAddr = addresses.find((a) => a.isDefaultBilling) ?? addresses[0];
  return defaultAddr?.phone ?? null;
}
