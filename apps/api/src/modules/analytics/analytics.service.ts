import { Injectable } from '@nestjs/common';
import { Prisma } from '@cdp/db';
import { PrismaService } from '../../db/prisma.service';
import { resolveRange, type AnalyticsRange, type ResolvedRange } from './dto/range.dto';
import type { TopProductRow, TopProductsQuery, TopProductsResponse } from './dto/top-products.dto';
import type { GeoQuery, GeoRegionRow, GeoResponse, GeoUnmatchedRow } from './dto/geo.dto';

export interface KpiBlock {
  /** Sum of `real_revenue` over orders placed in the period (Decimal as string). */
  revenue: string;
  /** Total orders count. */
  orders: number;
  /** Average order value (`revenue / orders`). */
  aov: string;
  /** Distinct customers with at least one order in the period. */
  customers: number;
  /** Customers whose first ever order falls inside the period. */
  new_customers: number;
  /** Customers in the period who already had orders before it. */
  returning_customers: number;
  /** `returning_customers / max(1, customers)`, 0..1. */
  repeat_purchase_rate: number;
}

export interface KpisResponse {
  range: { from: string; to: string };
  previous_range: { from: string; to: string };
  current: KpiBlock;
  previous: KpiBlock;
  delta: {
    revenue_pct: number | null;
    orders_pct: number | null;
    aov_pct: number | null;
    customers_pct: number | null;
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async kpis(tenantId: string, range: AnalyticsRange): Promise<KpisResponse> {
    const r = resolveRange(range);
    const [current, previous] = await Promise.all([
      this.computeKpiBlock(tenantId, r.from, r.to),
      this.computeKpiBlock(tenantId, r.previousFrom, r.previousTo),
    ]);
    return {
      range: { from: r.from.toISOString(), to: r.to.toISOString() },
      previous_range: { from: r.previousFrom.toISOString(), to: r.previousTo.toISOString() },
      current,
      previous,
      delta: {
        revenue_pct: pctDelta(current.revenue, previous.revenue),
        orders_pct: pctDeltaInt(current.orders, previous.orders),
        aov_pct: pctDelta(current.aov, previous.aov),
        customers_pct: pctDeltaInt(current.customers, previous.customers),
      },
    };
  }

  async topProducts(tenantId: string, query: TopProductsQuery): Promise<TopProductsResponse> {
    const r: ResolvedRange = resolveRange(query);
    const orderColumn = query.order_by === 'units' ? 'units' : 'revenue';
    // Aggregate by SKU only — configurable products generate two order_items
    // per purchase (parent shell + child variant) sharing the SKU but with
    // slightly different `name`. The longest name keeps the more descriptive
    // variant title; the `row_total > 0` filter drops the price-zero parent
    // shell from units + revenue totals.
    const rows = await this.prisma.$queryRaw<
      { sku: string; name: string; units: number; revenue: Prisma.Decimal; orders: bigint }[]
    >(Prisma.sql`
      SELECT
        oi.sku,
        (ARRAY_AGG(oi.name ORDER BY length(oi.name) DESC, oi.name ASC))[1] AS name,
        SUM(oi.qty_ordered) FILTER (WHERE oi.row_total > 0)::float8 AS units,
        SUM(oi.row_total)::numeric(20,4) AS revenue,
        COUNT(DISTINCT oi.order_id) AS orders
      FROM order_item oi
      JOIN "order" o ON o.id = oi.order_id
      WHERE o.tenant_id = ${tenantId}::uuid
        AND o.placed_at >= ${r.from}
        AND o.placed_at <  ${r.to}
      GROUP BY oi.sku
      HAVING SUM(oi.row_total) > 0
      ORDER BY ${Prisma.raw(orderColumn)} DESC NULLS LAST, oi.sku ASC
      LIMIT ${query.limit}
    `);

    const data: TopProductRow[] = rows.map((row) => ({
      sku: row.sku,
      name: row.name,
      units: Number(row.units),
      revenue: row.revenue.toString(),
      orders: Number(row.orders),
    }));

    return {
      range: { from: r.from.toISOString(), to: r.to.toISOString() },
      order_by: query.order_by,
      data,
    };
  }

  /**
   * Aggregate revenue / orders / customers per region for a country.
   *
   * - "customers": distinct customer profiles with any address in the
   *   region (snapshot — not bound to the date range).
   * - "buyers" + "orders" + "revenue": only counts orders placed in the
   *   range whose customer's default-billing (or first) address sits in
   *   the region. Customers without an address resolved to a region are
   *   surfaced separately in the `unmatched` payload.
   */
  async geo(tenantId: string, query: GeoQuery): Promise<GeoResponse> {
    const r = resolveRange(query);

    // Per-region aggregate. The customer ↔ region link is resolved via
    // the customer's default billing address, falling back to whichever
    // address has a region; this mirrors what most ecommerce reports do.
    const rows = await this.prisma.$queryRaw<
      {
        region_id: number;
        region_code: string;
        region_name: string;
        customers: bigint;
        buyers: bigint;
        orders: bigint;
        revenue: Prisma.Decimal | null;
      }[]
    >(Prisma.sql`
      WITH customer_region AS (
        SELECT
          ca.customer_profile_id,
          ca.region_id,
          ROW_NUMBER() OVER (
            PARTITION BY ca.customer_profile_id
            ORDER BY (CASE WHEN ca.is_default_billing THEN 0 ELSE 1 END),
                     (CASE WHEN ca.is_default_shipping THEN 0 ELSE 1 END),
                     ca.id
          ) AS rn
        FROM customer_address ca
        WHERE ca.tenant_id = ${tenantId}::uuid
          AND ca.region_id IS NOT NULL
          AND ca.country_code = ${query.country}
      ),
      primary_region AS (
        SELECT customer_profile_id, region_id
        FROM customer_region
        WHERE rn = 1
      )
      SELECT
        r.id AS region_id,
        r.code AS region_code,
        r.name AS region_name,
        COUNT(DISTINCT pr.customer_profile_id)::bigint AS customers,
        COUNT(DISTINCT o.customer_profile_id) FILTER (
          WHERE o.id IS NOT NULL
        )::bigint AS buyers,
        COUNT(o.id)::bigint AS orders,
        COALESCE(SUM(o.real_revenue), 0)::numeric(20,4) AS revenue
      FROM region r
      LEFT JOIN primary_region pr ON pr.region_id = r.id
      LEFT JOIN "order" o
        ON o.tenant_id = ${tenantId}::uuid
       AND o.customer_profile_id = pr.customer_profile_id
       AND o.placed_at >= ${r.from}
       AND o.placed_at <  ${r.to}
      WHERE r.country_code = ${query.country}
        AND r.is_active = true
      GROUP BY r.id, r.code, r.name
      ORDER BY revenue DESC NULLS LAST, customers DESC, r.name ASC
    `);

    const data: GeoRegionRow[] = rows.map((row) => ({
      region_id: row.region_id,
      region_code: row.region_code,
      region_name: row.region_name,
      customers: Number(row.customers),
      buyers: Number(row.buyers),
      orders: Number(row.orders),
      revenue: (row.revenue ?? new Prisma.Decimal(0)).toString(),
    }));

    const totals = data.reduce(
      (acc, row) => ({
        customers: acc.customers + row.customers,
        buyers: acc.buyers + row.buyers,
        orders: acc.orders + row.orders,
        revenue: acc.revenue.plus(row.revenue),
      }),
      { customers: 0, buyers: 0, orders: 0, revenue: new Prisma.Decimal(0) },
    );

    const unmatchedRows = await this.prisma.geoUnmatched.findMany({
      where: { tenantId },
      orderBy: [{ occurrences: 'desc' }, { lastSeenAt: 'desc' }],
      take: 20,
    });
    const unmatched: GeoUnmatchedRow[] = unmatchedRows.map((u) => ({
      region_raw: u.regionRaw,
      city_raw: u.cityRaw,
      postal_code: u.postalCode,
      occurrences: u.occurrences,
      last_seen_at: u.lastSeenAt.toISOString(),
    }));

    return {
      range: { from: r.from.toISOString(), to: r.to.toISOString() },
      country: query.country,
      totals: {
        customers: totals.customers,
        buyers: totals.buyers,
        orders: totals.orders,
        revenue: totals.revenue.toString(),
      },
      data,
      unmatched,
    };
  }

  private async computeKpiBlock(tenantId: string, from: Date, to: Date): Promise<KpiBlock> {
    // One pass for headline numbers.
    const [headline] = await this.prisma.$queryRaw<
      {
        revenue: Prisma.Decimal | null;
        orders: bigint;
        customers: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(real_revenue), 0)::numeric(20,4) AS revenue,
        COUNT(*)::bigint AS orders,
        COUNT(DISTINCT customer_profile_id)::bigint AS customers
      FROM "order"
      WHERE tenant_id = ${tenantId}::uuid
        AND placed_at >= ${from}
        AND placed_at <  ${to}
    `);

    const ordersInt = Number(headline?.orders ?? 0n);
    const revenueDec = headline?.revenue ?? new Prisma.Decimal(0);
    const customersInt = Number(headline?.customers ?? 0n);
    const aovDec = ordersInt > 0 ? revenueDec.div(ordersInt) : new Prisma.Decimal(0);

    // Second pass: split distinct customers in range into new vs returning.
    const [splitRow] = await this.prisma.$queryRaw<
      { new_customers: bigint; returning_customers: bigint }[]
    >(Prisma.sql`
      WITH range_customers AS (
        SELECT DISTINCT customer_profile_id
        FROM "order"
        WHERE tenant_id = ${tenantId}::uuid
          AND placed_at >= ${from}
          AND placed_at <  ${to}
          AND customer_profile_id IS NOT NULL
      ),
      first_orders AS (
        SELECT customer_profile_id, MIN(placed_at) AS first_at
        FROM "order"
        WHERE tenant_id = ${tenantId}::uuid
          AND customer_profile_id IS NOT NULL
        GROUP BY customer_profile_id
      )
      SELECT
        COUNT(*) FILTER (WHERE first_at >= ${from})::bigint AS new_customers,
        COUNT(*) FILTER (WHERE first_at <  ${from})::bigint AS returning_customers
      FROM range_customers rc
      JOIN first_orders fo USING (customer_profile_id)
    `);

    const newCustomers = Number(splitRow?.new_customers ?? 0n);
    const returningCustomers = Number(splitRow?.returning_customers ?? 0n);
    const buyersWithProfile = newCustomers + returningCustomers;
    const repeatRate = buyersWithProfile > 0 ? returningCustomers / buyersWithProfile : 0;

    return {
      revenue: revenueDec.toString(),
      orders: ordersInt,
      aov: aovDec.toString(),
      customers: customersInt,
      new_customers: newCustomers,
      returning_customers: returningCustomers,
      repeat_purchase_rate: Math.round(repeatRate * 10_000) / 10_000,
    };
  }
}

function pctDelta(currentStr: string, previousStr: string): number | null {
  const prev = Number(previousStr);
  if (!Number.isFinite(prev) || prev === 0) return null;
  const curr = Number(currentStr);
  return Math.round(((curr - prev) / prev) * 10_000) / 100;
}

function pctDeltaInt(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}
