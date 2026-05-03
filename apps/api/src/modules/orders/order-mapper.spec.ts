import { describe, expect, it } from 'vitest';
import { mapOrder } from './order-mapper';
import type { MagentoOrder } from '@datapp/magento-client';
import type { RegionResolverService } from '../geo/region-resolver.service';

/**
 * Minimal fake — `mapOrder` only calls `.resolve()`. Returning a fixed
 * region keeps tests focused on mapping logic; the resolver itself has
 * its own unit tests.
 */
const fakeResolver = {
  resolve: (_country: string, raw: unknown) => {
    const name =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && typeof (raw as { region?: unknown }).region === 'string'
          ? (raw as { region: string }).region
          : null;
    return name === 'Buenos Aires'
      ? { regionId: 27, canonicalName: 'Buenos Aires' }
      : { regionId: null, canonicalName: null };
  },
} as unknown as RegionResolverService;

const map = (raw: MagentoOrder) => mapOrder(raw, fakeResolver, 'AR');

const baseOrder: MagentoOrder = {
  entity_id: 1234,
  increment_id: '1000026840',
  quote_id: 9876,
  customer_id: 42,
  customer_email: 'JANE.Doe@Example.COM',
  status: 'processing',
  state: 'processing',
  order_currency_code: 'ARS',
  subtotal: 100_000,
  tax_amount: 21_000,
  shipping_amount: 5_000,
  discount_amount: 2_000,
  grand_total: 124_000,
  total_invoiced: 124_000,
  total_refunded: 0,
  total_paid: 124_000,
  payment: { method: 'mercadopago_custom' },
  shipping_method: 'tablerate_bestway',
  billing_address: {
    firstname: 'Jane',
    lastname: 'Doe',
    street: ['Av. Corrientes 1234'],
    city: 'Buenos Aires',
    region: { region: 'Buenos Aires', region_code: 'BA', region_id: 27 },
    country_id: 'AR',
    postcode: 'C1043',
    telephone: '+541112345',
  },
  items: [
    {
      item_id: 5001,
      sku: 'CI-550-Bordo',
      name: 'Bag CI-550 Bordó',
      product_id: 17,
      qty_ordered: 2,
      qty_invoiced: 2,
      qty_refunded: 0,
      qty_shipped: 0,
      price: 50_000,
      tax_amount: 10_500,
      row_total: 100_000,
    },
  ],
  status_histories: [
    { entity_id: 1, status: 'pending', created_at: '2024-01-15 10:00:00' },
    { entity_id: 2, status: 'processing', created_at: '2024-01-15 10:05:00' },
  ],
  created_at: '2024-01-15 10:00:00',
  updated_at: '2024-01-15 10:05:00',
  remote_ip: '190.16.42.7',
};

describe('mapOrder', () => {
  it('maps the canonical fields', () => {
    const m = map(baseOrder);
    expect(m.magentoOrderId).toBe('1234');
    expect(m.magentoOrderNumber).toBe('1000026840');
    expect(m.magentoQuoteId).toBe('9876');
    expect(m.magentoCustomerId).toBe('42');
    expect(m.status).toBe('processing');
    expect(m.state).toBe('processing');
    expect(m.currencyCode).toBe('ARS');
  });

  it('returns null quote_id when missing', () => {
    const { quote_id: _omit, ...withoutQuote } = baseOrder;
    const m = map(withoutQuote as MagentoOrder);
    expect(m.magentoQuoteId).toBeNull();
  });

  it('resolves region from billing when shipping is missing', () => {
    const m = map(baseOrder);
    expect(m.regionId).toBe(27); // resolver matches "Buenos Aires"
  });

  it('returns null regionId when no address has a known region', () => {
    const m = map({
      ...baseOrder,
      billing_address: { ...baseOrder.billing_address!, region: 'Atlantis' },
    });
    expect(m.regionId).toBeNull();
  });

  it('lowercases email and computes sha256 hash', () => {
    const m = map(baseOrder);
    expect(m.customerEmail).toBe('jane.doe@example.com');
    expect(m.customerEmailHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serializes money as strings (Decimal-safe)', () => {
    const m = map(baseOrder);
    expect(m.subtotal).toBe('100000');
    expect(m.totalTax).toBe('21000');
    expect(m.grandTotal).toBe('124000');
    expect(m.totalInvoiced).toBe('124000');
    expect(m.totalRefunded).toBe('0');
  });

  it('parses Magento timestamps as UTC', () => {
    const m = map(baseOrder);
    expect(m.placedAt.toISOString()).toBe('2024-01-15T10:00:00.000Z');
    expect(m.magentoUpdatedAt.toISOString()).toBe('2024-01-15T10:05:00.000Z');
  });

  it('maps order items with quantities + row totals', () => {
    const m = map(baseOrder);
    expect(m.items).toHaveLength(1);
    const item = m.items[0]!;
    expect(item.magentoOrderItemId).toBe('5001');
    expect(item.sku).toBe('CI-550-Bordo');
    expect(item.qtyOrdered).toBe('2');
    expect(item.qtyInvoiced).toBe('2');
    expect(item.price).toBe('50000');
    expect(item.rowTotal).toBe('100000');
  });

  it('counts items and unique SKUs', () => {
    const m = map({
      ...baseOrder,
      items: [
        ...baseOrder.items,
        { ...baseOrder.items[0]!, item_id: 5002, sku: 'CI-550-Negro', qty_ordered: 1 },
        {
          ...baseOrder.items[0]!,
          item_id: 5003,
          sku: 'CI-550-Bordo',
          qty_ordered: 1, // duplicated SKU — adds to itemCount but not to skuCount
        },
      ],
    });
    expect(m.itemCount).toBe(4); // 2 + 1 + 1
    expect(m.skuCount).toBe(2); // CI-550-Bordo + CI-550-Negro
  });

  it('captures status history sorted by Magento order, parsing dates', () => {
    const m = map(baseOrder);
    expect(m.statusHistory).toHaveLength(2);
    expect(m.statusHistory[0]!.status).toBe('pending');
    expect(m.statusHistory[0]!.createdAt.toISOString()).toBe('2024-01-15T10:00:00.000Z');
    expect(m.statusHistory[1]!.status).toBe('processing');
  });

  it('extracts shipping address from extension_attributes', () => {
    const m = map({
      ...baseOrder,
      extension_attributes: {
        shipping_assignments: [
          {
            shipping: {
              address: {
                firstname: 'Jane',
                lastname: 'Doe',
                street: ['Calle Tigre 123'],
                city: 'Tigre',
                region: 'Buenos Aires',
                country_id: 'AR',
                postcode: '1648',
              },
            },
          },
        ],
      },
    });
    expect(m.shippingAddress).toMatchObject({
      city: 'Tigre',
      country_id: 'AR',
      postcode: '1648',
    });
  });

  it('captures payment method and shipping method', () => {
    const m = map(baseOrder);
    expect(m.paymentMethod).toBe('mercadopago_custom');
    expect(m.shippingMethod).toBe('tablerate_bestway');
  });

  it('captures the customer IP', () => {
    const m = map(baseOrder);
    expect(m.ipAddress).toBe('190.16.42.7');
  });

  it('treats guest orders (no customer_id) gracefully', () => {
    const guest: MagentoOrder = { ...baseOrder };
    delete (guest as { customer_id?: unknown }).customer_id;
    const m = map(guest);
    expect(m.magentoCustomerId).toBeNull();
    expect(m.customerEmail).toBe('jane.doe@example.com');
  });

  it('omits real_revenue from the mapped output (it is a generated DB column)', () => {
    const m = map(baseOrder);
    expect(m).not.toHaveProperty('realRevenue');
    expect(m).not.toHaveProperty('real_revenue');
  });

  it('rolls unknown top-level fields into attributes', () => {
    const withUnknown = {
      ...baseOrder,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      magento_custom_field: 'some value',
    } as MagentoOrder & { magento_custom_field: string };
    const m = map(withUnknown);
    expect(m.attributes['magento_custom_field']).toBe('some value');
    expect(m.attributes).not.toHaveProperty('items');
    expect(m.attributes).not.toHaveProperty('billing_address');
  });
});
