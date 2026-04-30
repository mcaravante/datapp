import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import type { ListOrdersQuery } from './dto/list-orders.query';

export interface OrderListItem {
  id: string;
  magento_order_number: string;
  customer_id: string | null;
  customer_email: string;
  customer_name: string | null;
  status: string;
  state: string;
  currency_code: string;
  grand_total: string;
  real_revenue: string | null;
  coupon_code: string | null;
  item_count: number;
  placed_at: string;
}

export interface OrderListPage {
  data: OrderListItem[];
  next_cursor: string | null;
}

export interface OrderDetail extends OrderListItem {
  magento_order_id: string;
  subtotal: string;
  total_tax: string;
  shipping_amount: string;
  discount_amount: string;
  total_invoiced: string;
  total_refunded: string;
  total_paid: string;
  total_shipped: string;
  payment_method: string | null;
  shipping_method: string | null;
  discount_description: string | null;
  applied_rule_ids: string | null;
  sku_count: number;
  billing_address: Record<string, unknown>;
  shipping_address: Record<string, unknown>;
  items: OrderItemView[];
  history: OrderHistoryEntry[];
  attributes: Record<string, unknown>;
  magento_updated_at: string;
}

export interface OrderItemView {
  id: string;
  sku: string;
  name: string;
  qty_ordered: string;
  qty_invoiced: string;
  qty_refunded: string;
  qty_shipped: string;
  price: string;
  discount_amount: string;
  tax_amount: string;
  row_total: string;
}

export interface OrderHistoryEntry {
  id: string;
  status: string;
  state: string | null;
  comment: string | null;
  created_at: string;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async exportRows(
    tenantId: string,
    query: Omit<ListOrdersQuery, 'cursor' | 'limit'>,
    cap = 50_000,
  ): Promise<{ headers: string[]; rows: unknown[][] }> {
    const where: Prisma.OrderWhereInput = { tenantId };
    if (query.q) {
      where.OR = [
        { magentoOrderNumber: { contains: query.q, mode: 'insensitive' } },
        { customerEmail: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.customer_id) where.customerProfileId = query.customer_id;
    if (query.coupon_code) {
      where.couponCode = { equals: query.coupon_code, mode: 'insensitive' };
    }
    if (query.status && query.status.length > 0) where.status = { in: query.status };
    if (query.from || query.to) {
      where.placedAt = {};
      if (query.from) where.placedAt.gte = new Date(query.from);
      if (query.to) where.placedAt.lt = new Date(query.to);
    }

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: cap,
      select: {
        id: true,
        magentoOrderNumber: true,
        magentoOrderId: true,
        customerProfileId: true,
        customerEmail: true,
        status: true,
        state: true,
        currencyCode: true,
        subtotal: true,
        totalTax: true,
        shippingAmount: true,
        discountAmount: true,
        grandTotal: true,
        totalInvoiced: true,
        totalRefunded: true,
        realRevenue: true,
        itemCount: true,
        skuCount: true,
        paymentMethod: true,
        shippingMethod: true,
        couponCode: true,
        discountDescription: true,
        placedAt: true,
        magentoUpdatedAt: true,
      },
    });

    return {
      headers: [
        'id',
        'order_number',
        'magento_order_id',
        'customer_id',
        'customer_email',
        'status',
        'state',
        'currency',
        'subtotal',
        'total_tax',
        'shipping_amount',
        'discount_amount',
        'grand_total',
        'total_invoiced',
        'total_refunded',
        'real_revenue',
        'item_count',
        'sku_count',
        'payment_method',
        'shipping_method',
        'coupon_code',
        'discount_description',
        'placed_at',
        'magento_updated_at',
      ],
      rows: rows.map((r) => [
        r.id,
        r.magentoOrderNumber,
        r.magentoOrderId,
        r.customerProfileId ?? '',
        r.customerEmail,
        r.status,
        r.state,
        r.currencyCode,
        r.subtotal.toString(),
        r.totalTax.toString(),
        r.shippingAmount.toString(),
        r.discountAmount.toString(),
        r.grandTotal.toString(),
        r.totalInvoiced.toString(),
        r.totalRefunded.toString(),
        r.realRevenue ? r.realRevenue.toString() : '',
        r.itemCount,
        r.skuCount,
        r.paymentMethod ?? '',
        r.shippingMethod ?? '',
        r.couponCode ?? '',
        r.discountDescription ?? '',
        r.placedAt.toISOString(),
        r.magentoUpdatedAt.toISOString(),
      ]),
    };
  }

  async list(tenantId: string, query: ListOrdersQuery): Promise<OrderListPage> {
    const where: Prisma.OrderWhereInput = { tenantId };

    if (query.q) {
      where.OR = [
        { magentoOrderNumber: { contains: query.q, mode: 'insensitive' } },
        { customerEmail: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.customer_id) where.customerProfileId = query.customer_id;
    if (query.coupon_code) {
      where.couponCode = { equals: query.coupon_code, mode: 'insensitive' };
    }
    if (query.status && query.status.length > 0) where.status = { in: query.status };
    if (query.from || query.to) {
      where.placedAt = {};
      if (query.from) where.placedAt.gte = new Date(query.from);
      if (query.to) where.placedAt.lt = new Date(query.to);
    }

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor) {
      const cursorClause: Prisma.OrderWhereInput = {
        OR: [
          { placedAt: { lt: cursor.placedAt } },
          { placedAt: cursor.placedAt, id: { lt: cursor.id } },
        ],
      };
      where.AND = where.AND
        ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), cursorClause]
        : [cursorClause];
    }

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        magentoOrderNumber: true,
        customerProfileId: true,
        customerEmail: true,
        status: true,
        state: true,
        currencyCode: true,
        grandTotal: true,
        realRevenue: true,
        couponCode: true,
        itemCount: true,
        placedAt: true,
        customer: { select: { firstName: true, lastName: true } },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.placedAt, last.id) : null;

    return {
      data: page.map((r) => ({
        id: r.id,
        magento_order_number: r.magentoOrderNumber,
        customer_id: r.customerProfileId,
        customer_email: r.customerEmail,
        customer_name: fullName(r.customer?.firstName, r.customer?.lastName),
        status: r.status,
        state: r.state,
        currency_code: r.currencyCode,
        grand_total: r.grandTotal.toString(),
        real_revenue: r.realRevenue ? r.realRevenue.toString() : null,
        coupon_code: r.couponCode,
        item_count: r.itemCount,
        placed_at: r.placedAt.toISOString(),
      })),
      next_cursor: nextCursor,
    };
  }

  async get(tenantId: string, id: string): Promise<OrderDetail> {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        history: { orderBy: { createdAt: 'desc' } },
        customer: { select: { firstName: true, lastName: true } },
      },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    return {
      id: order.id,
      magento_order_id: order.magentoOrderId,
      magento_order_number: order.magentoOrderNumber,
      customer_id: order.customerProfileId,
      customer_email: order.customerEmail,
      customer_name: fullName(order.customer?.firstName, order.customer?.lastName),
      status: order.status,
      state: order.state,
      currency_code: order.currencyCode,
      subtotal: order.subtotal.toString(),
      total_tax: order.totalTax.toString(),
      shipping_amount: order.shippingAmount.toString(),
      discount_amount: order.discountAmount.toString(),
      grand_total: order.grandTotal.toString(),
      total_invoiced: order.totalInvoiced.toString(),
      total_refunded: order.totalRefunded.toString(),
      total_paid: order.totalPaid.toString(),
      total_shipped: order.totalShipped.toString(),
      real_revenue: order.realRevenue ? order.realRevenue.toString() : null,
      payment_method: order.paymentMethod,
      shipping_method: order.shippingMethod,
      coupon_code: order.couponCode,
      discount_description: order.discountDescription,
      applied_rule_ids: order.appliedRuleIds,
      item_count: order.itemCount,
      sku_count: order.skuCount,
      billing_address: jsonObject(order.billingAddress),
      shipping_address: jsonObject(order.shippingAddress),
      items: order.items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        qty_ordered: i.qtyOrdered.toString(),
        qty_invoiced: i.qtyInvoiced.toString(),
        qty_refunded: i.qtyRefunded.toString(),
        qty_shipped: i.qtyShipped.toString(),
        price: i.price.toString(),
        discount_amount: i.discountAmount.toString(),
        tax_amount: i.taxAmount.toString(),
        row_total: i.rowTotal.toString(),
      })),
      history: order.history.map((h) => ({
        id: h.id,
        status: h.status,
        state: h.state,
        comment: h.comment,
        created_at: h.createdAt.toISOString(),
      })),
      attributes: jsonObject(order.attributes),
      placed_at: order.placedAt.toISOString(),
      magento_updated_at: order.magentoUpdatedAt.toISOString(),
    };
  }
}

function fullName(first?: string | null, last?: string | null): string | null {
  const parts = [first, last].filter((s): s is string => Boolean(s && s.trim()));
  return parts.length > 0 ? parts.join(' ') : null;
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

interface DecodedCursor {
  placedAt: Date;
  id: string;
}

function encodeCursor(placedAt: Date, id: string): string {
  return Buffer.from(`${placedAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): DecodedCursor | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const [iso, id] = decoded.split('|');
    if (!iso || !id) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return { placedAt: date, id };
  } catch {
    return null;
  }
}
