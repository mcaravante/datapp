import { Injectable } from '@nestjs/common';
import { Prisma } from '@cdp/db';
import { PrismaService } from '../../db/prisma.service';
import { resolveRange, type AnalyticsRange, type ResolvedRange } from './dto/range.dto';
import type { TopProductRow, TopProductsQuery, TopProductsResponse } from './dto/top-products.dto';
import type { GeoQuery, GeoRegionRow, GeoResponse, GeoUnmatchedRow } from './dto/geo.dto';
import type {
  CadenceBucket,
  HeatmapCell,
  TimingQuery,
  TimingResponse,
} from './dto/timing.dto';
import type { CohortRow, CohortsQuery, CohortsResponse } from './dto/cohorts.dto';
import type {
  ProductAffinityItem,
  ProductAffinityQuery,
  ProductAffinityResponse,
} from './dto/product-affinity.dto';
import type { CouponRow, CouponsQuery, CouponsResponse } from './dto/coupons.dto';

const BA_TZ = 'America/Argentina/Buenos_Aires';

const CADENCE_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '0–7 d', min: 0, max: 7 },
  { label: '8–14 d', min: 8, max: 14 },
  { label: '15–30 d', min: 15, max: 30 },
  { label: '31–60 d', min: 31, max: 60 },
  { label: '61–90 d', min: 61, max: 90 },
  { label: '91–180 d', min: 91, max: 180 },
  { label: '181–365 d', min: 181, max: 365 },
  { label: '> 365 d', min: 366, max: null },
];

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

  async topProductsExport(
    tenantId: string,
    query: TopProductsQuery,
    cap = 50_000,
  ): Promise<{ headers: string[]; rows: unknown[][] }> {
    const result = await this.topProducts(tenantId, { ...query, limit: cap });
    return {
      headers: ['sku', 'name', 'units', 'revenue', 'orders'],
      rows: result.data.map((r) => [r.sku, r.name, r.units, r.revenue, r.orders]),
    };
  }

  async geoExport(
    tenantId: string,
    query: GeoQuery,
  ): Promise<{ headers: string[]; rows: unknown[][] }> {
    const result = await this.geo(tenantId, query);
    return {
      headers: [
        'region_id',
        'region_code',
        'region_name',
        'customers',
        'buyers',
        'orders',
        'revenue',
      ],
      rows: result.data.map((r) => [
        r.region_id,
        r.region_code,
        r.region_name,
        r.customers,
        r.buyers,
        r.orders,
        r.revenue,
      ]),
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

  /**
   * Day-of-week × hour-of-day heatmap + time-between-orders cadence
   * for the given range. Heatmap dow/hour are bucketed in Buenos Aires
   * local time so a 22:00 BA order doesn't show up as 01:00 UTC.
   */
  async timing(tenantId: string, query: TimingQuery): Promise<TimingResponse> {
    const r = resolveRange(query);

    // 1) Heatmap — single GROUP BY on (dow, hour) at BA local time.
    const heatmapRows = await this.prisma.$queryRaw<
      { dow: number; hour: number; orders: bigint; revenue: Prisma.Decimal | null }[]
    >(Prisma.sql`
      SELECT
        EXTRACT(DOW  FROM placed_at AT TIME ZONE ${BA_TZ})::int AS dow,
        EXTRACT(HOUR FROM placed_at AT TIME ZONE ${BA_TZ})::int AS hour,
        COUNT(*)::bigint                                          AS orders,
        COALESCE(SUM(real_revenue), 0)::numeric(20,4)             AS revenue
      FROM "order"
      WHERE tenant_id = ${tenantId}::uuid
        AND placed_at >= ${r.from}
        AND placed_at <  ${r.to}
      GROUP BY 1, 2
    `);

    // Dense 7×24 grid — fill missing cells with zero so the UI can render
    // a regular matrix without sparse-array gymnastics.
    const heatmap: HeatmapCell[] = [];
    const seen = new Map<string, { orders: number; revenue: string }>();
    for (const row of heatmapRows) {
      seen.set(`${row.dow}-${row.hour}`, {
        orders: Number(row.orders),
        revenue: (row.revenue ?? new Prisma.Decimal(0)).toString(),
      });
    }
    for (let dow = 0; dow < 7; dow += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const cell = seen.get(`${dow}-${hour}`);
        heatmap.push({
          dow,
          hour,
          orders: cell?.orders ?? 0,
          revenue: cell?.revenue ?? '0',
        });
      }
    }

    // 2) Cadence — gap (in days) between each order and the customer's
    //    previous order. We compute over orders placed in the range,
    //    pulling each order's previous one regardless of where it falls,
    //    so a "first order in range from a long-time customer" still
    //    contributes a meaningful gap.
    const gapRows = await this.prisma.$queryRaw<{ gap_days: number }[]>(Prisma.sql`
      WITH ranked AS (
        SELECT
          customer_profile_id,
          placed_at,
          LAG(placed_at) OVER (
            PARTITION BY customer_profile_id
            ORDER BY placed_at
          ) AS prev_at
        FROM "order"
        WHERE tenant_id = ${tenantId}::uuid
          AND customer_profile_id IS NOT NULL
      )
      SELECT
        EXTRACT(EPOCH FROM (placed_at - prev_at)) / 86400.0 AS gap_days
      FROM ranked
      WHERE prev_at IS NOT NULL
        AND placed_at >= ${r.from}
        AND placed_at <  ${r.to}
    `);

    const gaps = gapRows.map((row) => Number(row.gap_days)).filter((v) => Number.isFinite(v));
    const buckets: CadenceBucket[] = CADENCE_BUCKETS.map((b) => {
      const count = gaps.filter(
        (g) => g >= b.min && (b.max === null ? true : g <= b.max),
      ).length;
      return {
        days_min: b.min,
        days_max: b.max,
        label: b.label,
        count,
        percent: 0,
      };
    });
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    if (total > 0) {
      for (const b of buckets) {
        b.percent = Math.round((b.count / total) * 10_000) / 100;
      }
    }

    const repeatCustomersRow = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT customer_profile_id
        FROM "order"
        WHERE tenant_id = ${tenantId}::uuid
          AND customer_profile_id IS NOT NULL
        GROUP BY customer_profile_id
        HAVING COUNT(*) > 1
      ) sub
    `);

    return {
      range: { from: r.from.toISOString(), to: r.to.toISOString() },
      timezone: BA_TZ,
      heatmap,
      cadence: {
        repeat_customers: Number(repeatCustomersRow[0]?.count ?? 0n),
        median_days: median(gaps),
        buckets,
      },
    };
  }

  /**
   * Cohort retention. A cohort is the calendar month (in Buenos Aires
   * local time) of a customer's *first ever* order. Cells = distinct
   * customers from that cohort who placed an order N months later.
   * Future cells (offsets that haven't elapsed yet) come back as null
   * so the UI can render N/A instead of a misleading 0.
   */
  async cohorts(tenantId: string, query: CohortsQuery): Promise<CohortsResponse> {
    const cohortCount = query.cohorts;
    const horizon = query.horizon;

    const rows = await this.prisma.$queryRaw<
      { cohort_month: Date; offset: number; customers: bigint; cohort_size: bigint }[]
    >(Prisma.sql`
      WITH customer_first AS (
        SELECT
          customer_profile_id,
          DATE_TRUNC('month', MIN(placed_at) AT TIME ZONE ${BA_TZ}) AS cohort_month_local
        FROM "order"
        WHERE tenant_id = ${tenantId}::uuid
          AND customer_profile_id IS NOT NULL
        GROUP BY customer_profile_id
      ),
      cohort_sizes AS (
        SELECT cohort_month_local, COUNT(*)::bigint AS cohort_size
        FROM customer_first
        GROUP BY cohort_month_local
      ),
      orders_local AS (
        SELECT
          o.customer_profile_id,
          DATE_TRUNC('month', o.placed_at AT TIME ZONE ${BA_TZ}) AS order_month_local
        FROM "order" o
        WHERE o.tenant_id = ${tenantId}::uuid
          AND o.customer_profile_id IS NOT NULL
        GROUP BY o.customer_profile_id, order_month_local
      ),
      retention AS (
        SELECT
          cf.cohort_month_local                                    AS cohort_month,
          (
            (EXTRACT(YEAR  FROM ol.order_month_local)
              - EXTRACT(YEAR  FROM cf.cohort_month_local)) * 12
            + (EXTRACT(MONTH FROM ol.order_month_local)
              - EXTRACT(MONTH FROM cf.cohort_month_local))
          )::int                                                   AS month_offset,
          COUNT(DISTINCT ol.customer_profile_id)::bigint           AS customers
        FROM customer_first cf
        JOIN orders_local ol ON ol.customer_profile_id = cf.customer_profile_id
        GROUP BY cf.cohort_month_local, month_offset
      )
      SELECT
        r.cohort_month     AS cohort_month,
        r.month_offset     AS "offset",
        r.customers        AS customers,
        cs.cohort_size     AS cohort_size
      FROM retention r
      JOIN cohort_sizes cs ON cs.cohort_month_local = r.cohort_month
      WHERE r.cohort_month >= (
              DATE_TRUNC('month', NOW() AT TIME ZONE ${BA_TZ})
              - (${cohortCount - 1} || ' months')::interval
            )
        AND r.month_offset >= 0
        AND r.month_offset <= ${horizon}
      ORDER BY r.cohort_month ASC, r.month_offset ASC
    `);

    // Group rows by cohort_month and lay them out into a dense matrix.
    const byCohort = new Map<string, { size: number; cells: Map<number, number> }>();
    for (const row of rows) {
      const key = row.cohort_month.toISOString();
      let entry = byCohort.get(key);
      if (!entry) {
        entry = { size: Number(row.cohort_size), cells: new Map() };
        byCohort.set(key, entry);
      }
      entry.cells.set(row.offset, Number(row.customers));
    }

    // Build the requested last `cohortCount` months in chronological order,
    // even if some have zero customers (so the UI has a stable y-axis).
    const nowMonth = monthFloor(new Date());
    const cohortMonths: Date[] = [];
    for (let i = cohortCount - 1; i >= 0; i -= 1) {
      cohortMonths.push(monthsAgo(nowMonth, i));
    }

    const cohorts: CohortRow[] = cohortMonths.map((monthDate) => {
      const key = monthDate.toISOString();
      const entry = byCohort.get(key);
      const size = entry?.size ?? 0;
      const elapsed = monthsBetween(monthDate, nowMonth);

      const retained: (number | null)[] = [];
      for (let offset = 0; offset <= horizon; offset += 1) {
        if (offset > elapsed) {
          retained.push(null);
        } else {
          retained.push(entry?.cells.get(offset) ?? 0);
        }
      }
      return {
        cohort_month: monthDate.toISOString(),
        size,
        retained,
      };
    });

    return {
      timezone: BA_TZ,
      horizon,
      cohorts,
    };
  }

  /**
   * Coupon usage report. Aggregates orders in the range whose
   * `coupon_code` is set, alongside totals for cart-rule-only
   * promotions (no coupon code, but `discount_amount > 0`) so the user
   * can compare coupon-driven vs auto-promotion revenue.
   *
   * `discount_amount` lives on the order as a negative number (Magento
   * convention); we report it as positive (`abs`) so "discount given"
   * reads naturally.
   */
  async coupons(tenantId: string, query: CouponsQuery): Promise<CouponsResponse> {
    const r = resolveRange(query);

    const rows = await this.prisma.$queryRaw<
      {
        code: string;
        name: string | null;
        orders: bigint;
        customers: bigint;
        gross_revenue: Prisma.Decimal | null;
        discount_total: Prisma.Decimal | null;
        net_revenue: Prisma.Decimal | null;
        first_used_at: Date;
        last_used_at: Date;
      }[]
    >(Prisma.sql`
      WITH best_name AS (
        SELECT DISTINCT ON (coupon_code)
          coupon_code,
          discount_description AS name
        FROM "order"
        WHERE tenant_id = ${tenantId}::uuid
          AND coupon_code IS NOT NULL
          AND discount_description IS NOT NULL
        ORDER BY coupon_code, placed_at DESC
      )
      SELECT
        o.coupon_code                                              AS code,
        bn.name                                                    AS name,
        COUNT(*)::bigint                                           AS orders,
        COUNT(DISTINCT customer_profile_id)::bigint                AS customers,
        COALESCE(SUM(grand_total), 0)::numeric(20,4)               AS gross_revenue,
        COALESCE(SUM(ABS(discount_amount)), 0)::numeric(20,4)      AS discount_total,
        COALESCE(SUM(real_revenue), 0)::numeric(20,4)              AS net_revenue,
        MIN(placed_at)                                             AS first_used_at,
        MAX(placed_at)                                             AS last_used_at
      FROM "order" o
      LEFT JOIN best_name bn ON bn.coupon_code = o.coupon_code
      WHERE o.tenant_id = ${tenantId}::uuid
        AND o.coupon_code IS NOT NULL
        AND o.placed_at >= ${r.from}
        AND o.placed_at <  ${r.to}
      GROUP BY o.coupon_code, bn.name
      ORDER BY gross_revenue DESC, orders DESC, o.coupon_code ASC
    `);

    const data: CouponRow[] = rows.map((row) => ({
      code: row.code,
      name: row.name,
      orders: Number(row.orders),
      customers: Number(row.customers),
      gross_revenue: (row.gross_revenue ?? new Prisma.Decimal(0)).toString(),
      discount_total: (row.discount_total ?? new Prisma.Decimal(0)).toString(),
      net_revenue: (row.net_revenue ?? new Prisma.Decimal(0)).toString(),
      first_used_at: row.first_used_at.toISOString(),
      last_used_at: row.last_used_at.toISOString(),
    }));

    const couponTotals = data.reduce(
      (acc, c) => ({
        orders: acc.orders + c.orders,
        revenue: acc.revenue.plus(c.gross_revenue),
        discount: acc.discount.plus(c.discount_total),
      }),
      {
        orders: 0,
        revenue: new Prisma.Decimal(0),
        discount: new Prisma.Decimal(0),
      },
    );

    const [autoPromoRow] = await this.prisma.$queryRaw<
      { orders: bigint; discount: Prisma.Decimal | null }[]
    >(Prisma.sql`
      SELECT
        COUNT(*)::bigint                                       AS orders,
        COALESCE(SUM(ABS(discount_amount)), 0)::numeric(20,4)  AS discount
      FROM "order"
      WHERE tenant_id = ${tenantId}::uuid
        AND coupon_code IS NULL
        AND discount_amount <> 0
        AND placed_at >= ${r.from}
        AND placed_at <  ${r.to}
    `);

    return {
      range: { from: r.from.toISOString(), to: r.to.toISOString() },
      totals: {
        coupon_orders: couponTotals.orders,
        coupon_revenue: couponTotals.revenue.toString(),
        discount_total: couponTotals.discount.toString(),
        auto_promo_orders: Number(autoPromoRow?.orders ?? 0n),
        auto_promo_discount: (autoPromoRow?.discount ?? new Prisma.Decimal(0)).toString(),
      },
      data,
    };
  }

  /**
   * Frequently bought together. For all orders containing the focus
   * SKU, count co-occurring SKUs and compute confidence (P(co | focus))
   * and lift (confidence / P(co)). The denominator for lift is total
   * orders in the tenant — gives a stable baseline regardless of date
   * window.
   *
   * Includes only co-SKUs that appear in at least 2 orders together
   * with the focus to avoid noisy long-tail single-coincidences.
   */
  async productAffinity(
    tenantId: string,
    query: ProductAffinityQuery,
  ): Promise<ProductAffinityResponse> {
    const totalsRow = await this.prisma.$queryRaw<
      { focus_orders: bigint; total_orders: bigint; focus_name: string | null }[]
    >(Prisma.sql`
      WITH focus_orders AS (
        SELECT DISTINCT oi.order_id
        FROM order_item oi
        JOIN "order" o ON o.id = oi.order_id
        WHERE o.tenant_id = ${tenantId}::uuid
          AND oi.sku = ${query.sku}
          AND oi.row_total > 0
      ),
      total_orders AS (
        SELECT COUNT(*)::bigint AS c
        FROM "order"
        WHERE tenant_id = ${tenantId}::uuid
      ),
      focus_name AS (
        SELECT (ARRAY_AGG(oi.name ORDER BY length(oi.name) DESC, oi.name ASC))[1] AS name
        FROM order_item oi
        JOIN "order" o ON o.id = oi.order_id
        WHERE o.tenant_id = ${tenantId}::uuid
          AND oi.sku = ${query.sku}
      )
      SELECT
        (SELECT COUNT(*) FROM focus_orders)::bigint AS focus_orders,
        (SELECT c FROM total_orders)                AS total_orders,
        (SELECT name FROM focus_name)               AS focus_name
    `);

    const focusOrders = Number(totalsRow[0]?.focus_orders ?? 0n);
    const totalOrders = Number(totalsRow[0]?.total_orders ?? 0n);
    const focusName = totalsRow[0]?.focus_name ?? null;

    if (focusOrders === 0) {
      return {
        sku: query.sku,
        name: focusName,
        focus_orders: 0,
        total_orders: totalOrders,
        data: [],
      };
    }

    const rows = await this.prisma.$queryRaw<
      { sku: string; name: string; co_orders: bigint; total_orders: bigint }[]
    >(Prisma.sql`
      WITH focus_orders AS (
        SELECT DISTINCT oi.order_id
        FROM order_item oi
        JOIN "order" o ON o.id = oi.order_id
        WHERE o.tenant_id = ${tenantId}::uuid
          AND oi.sku = ${query.sku}
          AND oi.row_total > 0
      ),
      co_items AS (
        SELECT
          oi.sku,
          oi.name,
          oi.order_id
        FROM order_item oi
        JOIN focus_orders fo ON fo.order_id = oi.order_id
        WHERE oi.sku <> ${query.sku}
          AND oi.row_total > 0
      ),
      sku_totals AS (
        SELECT oi.sku, COUNT(DISTINCT oi.order_id)::bigint AS total_orders
        FROM order_item oi
        JOIN "order" o ON o.id = oi.order_id
        WHERE o.tenant_id = ${tenantId}::uuid
          AND oi.row_total > 0
        GROUP BY oi.sku
      )
      SELECT
        ci.sku,
        (ARRAY_AGG(ci.name ORDER BY length(ci.name) DESC, ci.name ASC))[1] AS name,
        COUNT(DISTINCT ci.order_id)::bigint                                AS co_orders,
        st.total_orders                                                    AS total_orders
      FROM co_items ci
      JOIN sku_totals st ON st.sku = ci.sku
      GROUP BY ci.sku, st.total_orders
      HAVING COUNT(DISTINCT ci.order_id) >= 2
      ORDER BY co_orders DESC, ci.sku ASC
      LIMIT ${query.limit}
    `);

    const data: ProductAffinityItem[] = rows.map((r) => {
      const co = Number(r.co_orders);
      const tot = Number(r.total_orders);
      const confidence = co / focusOrders;
      const baseline = totalOrders > 0 ? tot / totalOrders : 0;
      const lift = baseline > 0 ? confidence / baseline : 0;
      return {
        sku: r.sku,
        name: r.name,
        co_orders: co,
        total_orders: tot,
        confidence: Math.round(confidence * 10_000) / 10_000,
        lift: Math.round(lift * 100) / 100,
      };
    });

    return {
      sku: query.sku,
      name: focusName,
      focus_orders: focusOrders,
      total_orders: totalOrders,
      data,
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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[mid]! * 100) / 100;
  return Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 100) / 100;
}

function monthFloor(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function monthsAgo(reference: Date, n: number): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - n, 1));
}

function monthsBetween(earlier: Date, later: Date): number {
  return (
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    (later.getUTCMonth() - earlier.getUTCMonth())
  );
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
