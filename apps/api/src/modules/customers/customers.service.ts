import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import { RfmService } from '../rfm/rfm.service';
import type { ListCustomersQuery } from './dto/list-customers.query';

export interface CustomerListItem {
  id: string;
  magento_customer_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  customer_group: string | null;
  magento_created_at: string | null;
  magento_updated_at: string | null;
}

export interface CustomerListPage {
  data: CustomerListItem[];
  next_cursor: string | null;
}

export interface CustomerProductRow {
  sku: string;
  name: string;
  product_id: string | null;
  units: string; // Decimal as string (qty_ordered can be fractional)
  revenue: string; // Decimal as string
  orders: number;
  first_purchased_at: string;
  last_purchased_at: string;
}

export interface CustomerProductsResponse {
  data: CustomerProductRow[];
}

export interface CustomerDetail extends CustomerListItem {
  phone: string | null;
  dob: string | null;
  gender: string | null;
  is_subscribed: boolean;
  subscription_status: string;
  attributes: Record<string, unknown>;
  addresses: {
    id: string;
    type: string;
    is_default_billing: boolean;
    is_default_shipping: boolean;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    street1: string | null;
    street2: string | null;
    city: string | null;
    region: { id: number; name: string } | null;
    region_raw: string | null;
    postal_code: string | null;
    country_code: string;
    phone: string | null;
  }[];
  metrics: {
    total_orders: number;
    total_spent: string; // Decimal serialized as string to preserve precision
    aov: string;
    first_order_at: string | null;
    last_order_at: string | null;
  };
  rfm: {
    segment: string;
    recency_days: number;
    frequency: number;
    monetary: string;
    recency_score: number;
    frequency_score: number;
    monetary_score: number;
    calculated_at: string;
  } | null;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rfm: RfmService,
  ) {}

  /**
   * CSV-shaped export of all customers matching the same filters as
   * `list()`, but without cursor pagination. Capped to keep memory and
   * download size reasonable.
   */
  async exportRows(
    tenantId: string,
    query: Omit<ListCustomersQuery, 'cursor' | 'limit'>,
    cap = 50_000,
  ): Promise<{ headers: string[]; rows: unknown[][] }> {
    const where: Prisma.CustomerProfileWhereInput = { tenantId };
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: 'insensitive' } },
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.region_id !== undefined && query.region_id.length > 0) {
      where.addresses = { some: { regionId: { in: query.region_id } } };
    }
    if (query.customer_group !== undefined) {
      where.customerGroup = query.customer_group;
    }

    const rows = await this.prisma.customerProfile.findMany({
      where,
      orderBy: [{ magentoUpdatedAt: 'desc' }, { id: 'desc' }],
      take: cap,
      select: {
        id: true,
        magentoCustomerId: true,
        email: true,
        firstName: true,
        lastName: true,
        customerGroup: true,
        phone: true,
        isSubscribed: true,
        magentoCreatedAt: true,
        magentoUpdatedAt: true,
      },
    });

    return {
      headers: [
        'id',
        'magento_customer_id',
        'email',
        'first_name',
        'last_name',
        'customer_group',
        'phone',
        'is_subscribed',
        'magento_created_at',
        'magento_updated_at',
      ],
      rows: rows.map((r) => [
        r.id,
        r.magentoCustomerId,
        r.email,
        r.firstName ?? '',
        r.lastName ?? '',
        r.customerGroup ?? '',
        r.phone ?? '',
        r.isSubscribed ? 'true' : 'false',
        r.magentoCreatedAt?.toISOString() ?? '',
        r.magentoUpdatedAt?.toISOString() ?? '',
      ]),
    };
  }

  async list(tenantId: string, query: ListCustomersQuery): Promise<CustomerListPage> {
    const where: Prisma.CustomerProfileWhereInput = { tenantId };
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: 'insensitive' } },
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.region_id !== undefined && query.region_id.length > 0) {
      where.addresses = { some: { regionId: { in: query.region_id } } };
    }
    if (query.customer_group !== undefined) {
      where.customerGroup = query.customer_group;
    }

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor) {
      where.OR = [
        { magentoUpdatedAt: { lt: cursor.magentoUpdatedAt } },
        {
          magentoUpdatedAt: cursor.magentoUpdatedAt,
          id: { lt: cursor.id },
        },
      ];
    }

    const rows = await this.prisma.customerProfile.findMany({
      where,
      orderBy: [{ magentoUpdatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        magentoCustomerId: true,
        email: true,
        firstName: true,
        lastName: true,
        customerGroup: true,
        magentoCreatedAt: true,
        magentoUpdatedAt: true,
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last && last.magentoUpdatedAt
        ? encodeCursor(last.magentoUpdatedAt, last.id)
        : null;

    return {
      data: page.map((r) => ({
        id: r.id,
        magento_customer_id: r.magentoCustomerId,
        email: r.email,
        first_name: r.firstName,
        last_name: r.lastName,
        customer_group: r.customerGroup,
        magento_created_at: r.magentoCreatedAt?.toISOString() ?? null,
        magento_updated_at: r.magentoUpdatedAt?.toISOString() ?? null,
      })),
      next_cursor: nextCursor,
    };
  }

  /**
   * Aggregate every SKU this customer has ever bought, with units +
   * revenue + first/last purchase. SKU is the unit of aggregation; the
   * `row_total > 0` filter drops the zero-priced parent shells of
   * configurable products so units and revenue match what the customer
   * actually paid for.
   */
  async products(tenantId: string, customerId: string): Promise<CustomerProductsResponse> {
    // Make sure the customer belongs to this tenant before we expose
    // their order_item history (defense in depth — the controller has
    // already JwtGuard'd, but tenant scoping must be explicit).
    const profile = await this.prisma.customerProfile.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException(`Customer ${customerId} not found`);

    const rows = await this.prisma.$queryRaw<
      {
        sku: string;
        name: string;
        product_id: string | null;
        units: Prisma.Decimal;
        revenue: Prisma.Decimal;
        orders: bigint;
        first_at: Date;
        last_at: Date;
      }[]
    >(Prisma.sql`
      SELECT
        oi.sku,
        (ARRAY_AGG(oi.name ORDER BY length(oi.name) DESC, oi.name ASC))[1] AS name,
        (ARRAY_AGG(oi.product_id) FILTER (WHERE oi.product_id IS NOT NULL))[1] AS product_id,
        SUM(oi.qty_ordered) FILTER (WHERE oi.row_total > 0)::numeric(20,4) AS units,
        SUM(oi.row_total)::numeric(20,4)                                    AS revenue,
        COUNT(DISTINCT oi.order_id)::bigint                                 AS orders,
        MIN(o.placed_at)                                                    AS first_at,
        MAX(o.placed_at)                                                    AS last_at
      FROM order_item oi
      JOIN "order" o ON o.id = oi.order_id
      WHERE o.tenant_id = ${tenantId}::uuid
        AND o.customer_profile_id = ${customerId}::uuid
      GROUP BY oi.sku
      HAVING SUM(oi.row_total) > 0
      ORDER BY revenue DESC NULLS LAST, oi.sku ASC
    `);

    return {
      data: rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        product_id: r.product_id,
        units: r.units.toString(),
        revenue: r.revenue.toString(),
        orders: Number(r.orders),
        first_purchased_at: r.first_at.toISOString(),
        last_purchased_at: r.last_at.toISOString(),
      })),
    };
  }

  async get(tenantId: string, id: string): Promise<CustomerDetail> {
    const profile = await this.prisma.customerProfile.findFirst({
      where: { id, tenantId },
      include: { addresses: { include: { region: true } } },
    });
    if (!profile) throw new NotFoundException(`Customer ${id} not found`);

    // Lifetime metrics — computed live for now. Memoized projection to follow
    // when orders sync lands. `real_revenue` is the GENERATED column.
    const aggregate = await this.prisma.order.aggregate({
      where: { tenantId, customerProfileId: id },
      _count: { _all: true },
      _sum: { realRevenue: true },
      _min: { placedAt: true },
      _max: { placedAt: true },
    });

    const total = aggregate._count._all;
    const sum = aggregate._sum.realRevenue;
    const aov = total > 0 && sum ? sum.div(total) : null;

    const rfm = await this.rfm.forCustomer(tenantId, id);

    return {
      id: profile.id,
      magento_customer_id: profile.magentoCustomerId,
      email: profile.email,
      first_name: profile.firstName,
      last_name: profile.lastName,
      customer_group: profile.customerGroup,
      phone: profile.phone,
      dob: profile.dob ? profile.dob.toISOString().slice(0, 10) : null,
      gender: profile.gender,
      is_subscribed: profile.isSubscribed,
      subscription_status: profile.subscriptionStatus,
      attributes: (profile.attributes as Record<string, unknown>) ?? {},
      magento_created_at: profile.magentoCreatedAt?.toISOString() ?? null,
      magento_updated_at: profile.magentoUpdatedAt?.toISOString() ?? null,
      addresses: profile.addresses.map((a) => ({
        id: a.id,
        type: a.type,
        is_default_billing: a.isDefaultBilling,
        is_default_shipping: a.isDefaultShipping,
        first_name: a.firstName,
        last_name: a.lastName,
        company: a.company,
        street1: a.street1,
        street2: a.street2,
        city: a.city,
        region: a.region ? { id: a.region.id, name: a.region.name } : null,
        region_raw: a.regionRaw,
        postal_code: a.postalCode,
        country_code: a.countryCode,
        phone: a.phone,
      })),
      metrics: {
        total_orders: total,
        total_spent: (sum ?? new Prisma.Decimal(0)).toString(),
        aov: (aov ?? new Prisma.Decimal(0)).toString(),
        first_order_at: aggregate._min.placedAt?.toISOString() ?? null,
        last_order_at: aggregate._max.placedAt?.toISOString() ?? null,
      },
      rfm: rfm
        ? {
            segment: rfm.segment,
            recency_days: rfm.recencyDays,
            frequency: rfm.frequency,
            monetary: rfm.monetary,
            recency_score: rfm.recencyScore,
            frequency_score: rfm.frequencyScore,
            monetary_score: rfm.monetaryScore,
            calculated_at: rfm.calculatedAt,
          }
        : null,
    };
  }
}

interface DecodedCursor {
  magentoUpdatedAt: Date;
  id: string;
}

function encodeCursor(magentoUpdatedAt: Date, id: string): string {
  return Buffer.from(`${magentoUpdatedAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): DecodedCursor | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const [iso, id] = decoded.split('|');
    if (!iso || !id) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return { magentoUpdatedAt: date, id };
  } catch {
    return null;
  }
}
