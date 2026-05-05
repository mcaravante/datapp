import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import { RfmService } from '../rfm/rfm.service';
import { ExcludedEmailsService } from '../analytics/excluded-emails.service';
import type { CustomerSortField, ListCustomersQuery } from './dto/list-customers.query';

/** Maps direct CustomerProfile column sort fields to Prisma keys. */
const CUSTOMER_SORT_COLUMN: Record<
  'email' | 'magento_updated_at' | 'magento_created_at' | 'customer_group',
  keyof Prisma.CustomerProfileOrderByWithRelationInput
> = {
  email: 'email',
  magento_updated_at: 'magentoUpdatedAt',
  magento_created_at: 'magentoCreatedAt',
  customer_group: 'customerGroup',
};

function buildCustomerOrderBy(
  sort: CustomerSortField,
  dir: 'asc' | 'desc',
): Prisma.CustomerProfileOrderByWithRelationInput[] {
  // Sorting by RFM-sourced metrics (total orders / total spent) goes
  // through the `rfmScore` relation. The matching `where` clause filters
  // to customers that actually have an RFM row (see `buildCustomerWhere`)
  // because Postgres defaults to NULLS FIRST on DESC, which would surface
  // empty profiles instead of the real top spenders.
  if (sort === 'total_orders') {
    return [{ rfmScore: { frequency: dir } }, { id: 'desc' }];
  }
  if (sort === 'total_spent') {
    return [{ rfmScore: { monetary: dir } }, { id: 'desc' }];
  }
  const column = CUSTOMER_SORT_COLUMN[sort];
  return [
    { [column]: dir } as Prisma.CustomerProfileOrderByWithRelationInput,
    { id: 'desc' },
  ];
}

function buildCustomerWhere(
  tenantId: string,
  query: Pick<ListCustomersQuery, 'q' | 'region_id' | 'customer_group' | 'rfm_segment' | 'sort'>,
): Prisma.CustomerProfileWhereInput {
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
  if (query.rfm_segment !== undefined && query.rfm_segment.length > 0) {
    where.rfmScore = { is: { segment: { in: query.rfm_segment } } };
  }
  // Sorting by RFM-sourced metrics requires the row to actually exist —
  // otherwise Postgres surfaces empty (NULL) profiles first under DESC
  // and the table reads as broken. Restricting the resultset to scored
  // customers is the right behavior anyway: ordering by "lifetime spend"
  // for a guest with no orders has no defined answer.
  if (query.sort === 'total_orders' || query.sort === 'total_spent') {
    if (where.rfmScore !== undefined) {
      // Already constrained by `rfm_segment` — keep that filter.
    } else {
      where.rfmScore = { isNot: null };
    }
  }
  return where;
}

export interface CustomerListItem {
  id: string;
  magento_customer_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  /// Raw `group_id` from Magento (string). Kept for backwards
  /// compatibility with consumers that filter by id; new surfaces should
  /// prefer `customer_group_name`.
  customer_group: string | null;
  /// Human-readable group name resolved through the FK to `customer_group`.
  /// Null when the profile has no group_id set or the FK hasn't been
  /// linked yet (new ingest awaiting the next sync).
  customer_group_name: string | null;
  magento_created_at: string | null;
  magento_updated_at: string | null;
  /// Total orders ever placed. Sourced from RFM (`frequency`) — at
  /// most ~24h stale. Null when the nightly RFM job hasn't covered
  /// this customer yet (very new account).
  total_orders: number | null;
  /// Lifetime spend (sum of `real_revenue`). Sourced from RFM
  /// (`monetary`). Decimal-safe string; null when no RFM row.
  total_spent: string | null;
  /// True when the customer's email matches the tenant's exclusion list
  /// (either the literal email or its bare-domain rule). Drives the
  /// per-row "Excluir/Incluir" toggle on /customers without a per-cell
  /// round-trip.
  is_excluded: boolean;
}

export interface CustomerListPage {
  data: CustomerListItem[];
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
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
  /**
   * Tenant-scoped facet cache. We rebuild from a SELECT DISTINCT, which
   * for ~88k customers is sub-50ms but called on every page render of
   * /customers — caching the answer for a minute keeps the dropdown
   * responsive without a stale-data risk worth worrying about.
   */
  private readonly facetCache = new Map<
    string,
    { groups: { id: string; name: string }[]; expiresAt: number }
  >();
  private static readonly FACET_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rfm: RfmService,
    private readonly excludedEmails: ExcludedEmailsService,
  ) {}

  /**
   * Returns the list of customer groups available as filter values on
   * the /customers page. `id` is the raw Magento `group_id` (which is
   * what the URL filter compares against `customer_profile.customer_group`),
   * `name` is the human-readable label sourced from the synced
   * `customer_group` table.
   *
   * Falls back to a DISTINCT over `customer_profile.customer_group` for
   * any orphan id (rare — happens when a profile carries an old group_id
   * that no longer exists in Magento).
   */
  async facets(tenantId: string): Promise<{ customer_groups: { id: string; name: string }[] }> {
    const cached = this.facetCache.get(tenantId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return { customer_groups: cached.groups };
    }
    const [synced, distinctIds] = await Promise.all([
      this.prisma.customerGroup.findMany({
        where: { tenantId },
        select: { magentoGroupId: true, name: true },
        orderBy: { magentoGroupId: 'asc' },
      }),
      this.prisma.customerProfile.findMany({
        where: { tenantId, customerGroup: { not: null } },
        distinct: ['customerGroup'],
        select: { customerGroup: true },
      }),
    ]);
    const byId = new Map(synced.map((g) => [String(g.magentoGroupId), g.name] as const));
    const orphans = distinctIds
      .map((r) => r.customerGroup)
      .filter((id): id is string => Boolean(id))
      .filter((id) => !byId.has(id));
    for (const id of orphans) byId.set(id, id);
    const groups = Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => Number(a.id) - Number(b.id));
    this.facetCache.set(tenantId, { groups, expiresAt: now + CustomersService.FACET_TTL_MS });
    return { customer_groups: groups };
  }

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
    const where = buildCustomerWhere(tenantId, query);

    const rows = await this.prisma.customerProfile.findMany({
      where,
      orderBy: buildCustomerOrderBy(query.sort, query.dir),
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
    const where = buildCustomerWhere(tenantId, query);
    const skip = (query.page - 1) * query.limit;

    const [rows, totalCount, excludedSet] = await Promise.all([
      this.prisma.customerProfile.findMany({
        where,
        orderBy: buildCustomerOrderBy(query.sort, query.dir),
        skip,
        take: query.limit,
        select: {
          id: true,
          magentoCustomerId: true,
          email: true,
          firstName: true,
          lastName: true,
          customerGroup: true,
          magentoCreatedAt: true,
          magentoUpdatedAt: true,
          rfmScore: { select: { frequency: true, monetary: true } },
          group: { select: { name: true } },
        },
      }),
      this.prisma.customerProfile.count({ where }),
      this.excludedEmails.listEmails(tenantId),
    ]);

    // Mirror the analytics matching: literal email OR a bare-domain rule
    // (`@example.com`) covers the same row. Cheap pre-pass so per-row
    // checks stay O(1).
    const excludedLiteral = new Set<string>();
    const excludedDomains: string[] = [];
    for (const e of excludedSet) {
      if (e.startsWith('@')) excludedDomains.push(e);
      else excludedLiteral.add(e);
    }
    const isExcluded = (email: string): boolean => {
      const lc = email.toLowerCase();
      if (excludedLiteral.has(lc)) return true;
      for (const dom of excludedDomains) {
        if (lc.endsWith(dom)) return true;
      }
      return false;
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / query.limit));

    return {
      data: rows.map((r) => ({
        id: r.id,
        magento_customer_id: r.magentoCustomerId,
        email: r.email,
        first_name: r.firstName,
        last_name: r.lastName,
        customer_group: r.customerGroup,
        customer_group_name: r.group?.name ?? null,
        magento_created_at: r.magentoCreatedAt?.toISOString() ?? null,
        magento_updated_at: r.magentoUpdatedAt?.toISOString() ?? null,
        total_orders: r.rfmScore?.frequency ?? null,
        total_spent: r.rfmScore?.monetary?.toString() ?? null,
        is_excluded: isExcluded(r.email),
      })),
      page: query.page,
      limit: query.limit,
      total_count: totalCount,
      total_pages: totalPages,
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
      include: {
        addresses: { include: { region: true } },
        rfmScore: { select: { frequency: true, monetary: true } },
        group: { select: { name: true } },
      },
    });
    if (!profile) throw new NotFoundException(`Customer ${id} not found`);

    const excludedSet = new Set(await this.excludedEmails.listEmails(tenantId));
    const lcEmail = profile.email.toLowerCase();
    let isExcluded = excludedSet.has(lcEmail);
    if (!isExcluded) {
      for (const e of excludedSet) {
        if (e.startsWith('@') && lcEmail.endsWith(e)) {
          isExcluded = true;
          break;
        }
      }
    }

    // Lifetime metrics + RFM are independent of each other and of the
    // profile read — fan out concurrently so the page is gated by the
    // slowest of the two, not their sum.
    const [aggregate, rfm] = await Promise.all([
      this.prisma.order.aggregate({
        where: { tenantId, customerProfileId: id },
        _count: { _all: true },
        _sum: { realRevenue: true },
        _min: { placedAt: true },
        _max: { placedAt: true },
      }),
      this.rfm.forCustomer(tenantId, id),
    ]);

    const total = aggregate._count._all;
    const sum = aggregate._sum.realRevenue;
    const aov = total > 0 && sum ? sum.div(total) : null;

    return {
      id: profile.id,
      magento_customer_id: profile.magentoCustomerId,
      email: profile.email,
      first_name: profile.firstName,
      last_name: profile.lastName,
      customer_group: profile.customerGroup,
      customer_group_name: profile.group?.name ?? null,
      phone: profile.phone,
      dob: profile.dob ? profile.dob.toISOString().slice(0, 10) : null,
      gender: profile.gender,
      is_subscribed: profile.isSubscribed,
      subscription_status: profile.subscriptionStatus,
      attributes: (profile.attributes as Record<string, unknown>) ?? {},
      magento_created_at: profile.magentoCreatedAt?.toISOString() ?? null,
      magento_updated_at: profile.magentoUpdatedAt?.toISOString() ?? null,
      // Detail page already shows aggregated metrics computed live
      // (`metrics` block below), but the list-item shape expects RFM-
      // sourced totals — pass them through too so the type stays
      // consistent.
      total_orders: profile.rfmScore?.frequency ?? null,
      total_spent: profile.rfmScore?.monetary?.toString() ?? null,
      is_excluded: isExcluded,
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

