import { createHash } from 'node:crypto';
import type { MagentoAddress, MagentoOrder, MagentoOrderItem } from '@datapp/magento-client';

export interface MappedOrderItem {
  magentoOrderItemId: string;
  sku: string;
  name: string;
  qtyOrdered: string;
  qtyInvoiced: string;
  qtyRefunded: string;
  qtyShipped: string;
  price: string;
  discountAmount: string;
  taxAmount: string;
  rowTotal: string;
  attributes: Record<string, unknown>;
}

export interface MappedStatusHistory {
  status: string;
  state: string | null;
  comment: string | null;
  createdAt: Date;
}

export interface MappedOrder {
  magentoOrderId: string;
  magentoOrderNumber: string;
  magentoCustomerId: string | null; // Magento customer ID; resolved to FK by the caller
  customerEmail: string;
  customerEmailHash: string;
  status: string;
  state: string;
  currencyCode: string;
  subtotal: string;
  totalTax: string;
  shippingAmount: string;
  discountAmount: string;
  grandTotal: string;
  totalInvoiced: string;
  totalRefunded: string;
  totalPaid: string;
  totalShipped: string;
  billingAddress: Record<string, unknown>;
  shippingAddress: Record<string, unknown>;
  paymentMethod: string | null;
  shippingMethod: string | null;
  couponCode: string | null;
  discountDescription: string | null;
  appliedRuleIds: string | null;
  itemCount: number;
  skuCount: number;
  ipAddress: string | null;
  userAgent: string | null;
  placedAt: Date;
  magentoUpdatedAt: Date;
  attributes: Record<string, unknown>;
  items: MappedOrderItem[];
  statusHistory: MappedStatusHistory[];
}

/**
 * Pure mapper: a Magento order (from `/orders/:id` or `/orders?...`) into
 * the CDP shape. Side-effect-free. Money is represented as strings so the
 * caller can pass it to Prisma's `Decimal` column without precision loss.
 *
 * NOTE: `real_revenue` is a Postgres GENERATED column. The output here
 * intentionally OMITS it — writing it from application code would error.
 */
export function mapOrder(raw: MagentoOrder): MappedOrder {
  const customerEmail = raw.customer_email.toLowerCase();
  const customerEmailHash = createHash('sha256').update(customerEmail).digest('hex');

  const billing = raw.billing_address ?? {};
  const shipping = raw.extension_attributes?.shipping_assignments?.[0]?.shipping?.address ?? null;

  const items = (raw.items ?? []).map(mapItem);
  const statusHistory = (raw.status_histories ?? []).map(mapHistory);

  const itemCount = items.reduce((sum, i) => sum + Number(i.qtyOrdered), 0);
  const skuCount = new Set(items.map((i) => i.sku)).size;

  const placedAt = parseUtc(raw.created_at);
  const magentoUpdatedAt = parseUtc(raw.updated_at);

  // Attributes: anything we don't model explicitly. Drop the heavy nested
  // structures we already projected out.
  const known = new Set([
    'entity_id',
    'increment_id',
    'customer_id',
    'customer_email',
    'status',
    'state',
    'order_currency_code',
    'base_currency_code',
    'subtotal',
    'tax_amount',
    'shipping_amount',
    'discount_amount',
    'grand_total',
    'total_invoiced',
    'total_refunded',
    'total_paid',
    'total_due',
    'items',
    'payment',
    'shipping_method',
    'billing_address',
    'extension_attributes',
    'status_histories',
    'created_at',
    'updated_at',
    'remote_ip',
    'x_forwarded_for',
    'coupon_code',
    'discount_description',
    'applied_rule_ids',
  ]);
  const attributes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!known.has(k)) attributes[k] = v;
  }

  return {
    magentoOrderId: String(raw.entity_id),
    magentoOrderNumber: raw.increment_id,
    magentoCustomerId: typeof raw.customer_id === 'number' ? String(raw.customer_id) : null,
    customerEmail,
    customerEmailHash,
    status: raw.status,
    state: raw.state,
    currencyCode: (raw.order_currency_code ?? raw.base_currency_code ?? 'ARS').toUpperCase(),
    subtotal: toDecimalString(raw.subtotal),
    totalTax: toDecimalString(raw.tax_amount ?? 0),
    shippingAmount: toDecimalString(raw.shipping_amount ?? 0),
    discountAmount: toDecimalString(raw.discount_amount ?? 0),
    grandTotal: toDecimalString(raw.grand_total),
    totalInvoiced: toDecimalString(raw.total_invoiced ?? 0),
    totalRefunded: toDecimalString(raw.total_refunded ?? 0),
    totalPaid: toDecimalString(raw.total_paid ?? 0),
    totalShipped: toDecimalString(0), // Magento doesn't expose this directly on the order
    billingAddress: addressToJson(billing),
    shippingAddress: shipping ? addressToJson(shipping) : {},
    paymentMethod: raw.payment?.method ?? null,
    shippingMethod: raw.shipping_method ?? null,
    couponCode: emptyToNull(getStringField(raw, 'coupon_code')),
    discountDescription: emptyToNull(getStringField(raw, 'discount_description')),
    appliedRuleIds: emptyToNull(getStringField(raw, 'applied_rule_ids')),
    itemCount,
    skuCount,
    ipAddress: raw.remote_ip ?? raw.x_forwarded_for ?? null,
    userAgent: null, // Magento doesn't surface UA on standard order REST
    placedAt,
    magentoUpdatedAt,
    attributes,
    items,
    statusHistory,
  };
}

function mapItem(raw: MagentoOrderItem): MappedOrderItem {
  const known = new Set([
    'item_id',
    'sku',
    'name',
    'qty_ordered',
    'qty_invoiced',
    'qty_refunded',
    'qty_shipped',
    'price',
    'discount_amount',
    'tax_amount',
    'row_total',
    'product_id',
  ]);
  const attributes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!known.has(k)) attributes[k] = v;
  }
  return {
    magentoOrderItemId: String(raw.item_id),
    sku: raw.sku,
    name: raw.name,
    qtyOrdered: toDecimalString(raw.qty_ordered),
    qtyInvoiced: toDecimalString(raw.qty_invoiced ?? 0),
    qtyRefunded: toDecimalString(raw.qty_refunded ?? 0),
    qtyShipped: toDecimalString(raw.qty_shipped ?? 0),
    price: toDecimalString(raw.price),
    discountAmount: toDecimalString(raw.discount_amount ?? 0),
    taxAmount: toDecimalString(raw.tax_amount ?? 0),
    rowTotal: toDecimalString(raw.row_total),
    attributes,
  };
}

function mapHistory(raw: {
  status: string;
  comment?: string | null | undefined;
  created_at: string;
}): MappedStatusHistory {
  return {
    status: raw.status,
    state: null, // Magento's status_histories doesn't carry state
    comment: raw.comment ?? null,
    createdAt: parseUtc(raw.created_at),
  };
}

function addressToJson(addr: MagentoAddress | Record<string, unknown>): Record<string, unknown> {
  // Pass-through but coerce the shape to a plain object — Prisma's Json
  // column needs JSON-serializable values.
  return JSON.parse(JSON.stringify(addr)) as Record<string, unknown>;
}

function parseUtc(iso: string): Date {
  // Magento returns 'YYYY-MM-DD HH:mm:ss' UTC. Force ISO + Z.
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid Magento timestamp: ${iso}`);
  }
  return d;
}

function toDecimalString(v: number): string {
  // Prisma accepts a string or Decimal; using string keeps full precision
  // through the driver without depending on Decimal.js here.
  if (Number.isNaN(v) || !Number.isFinite(v)) return '0';
  return v.toString();
}

/**
 * MagentoOrder uses `.passthrough()` so unmodelled fields (coupon_code,
 * discount_description, applied_rule_ids) live on the raw payload as
 * `unknown`. Read them with explicit string narrowing.
 */
function getStringField(raw: unknown, key: string): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const v = (raw as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

function emptyToNull(v: string | null): string | null {
  if (v === null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}
