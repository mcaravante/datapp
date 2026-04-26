import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@cdp/db';
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
