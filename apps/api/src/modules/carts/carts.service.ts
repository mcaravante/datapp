import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import type {
  AbandonedCartRangeFilter,
  AbandonedCartStatusFilter,
  AbandonedCartsQuery,
} from './dto/abandoned-carts.query';

const RECOVERY_KPI_WINDOW_DAYS = 30;

/**
 * Why we believe a recovered cart was recovered:
 *   - `email_coupon` — the recovered order's `couponCode` matches a
 *     coupon we emitted on a recovery email for this cart. Strongest
 *     evidence; this is the headline number for "marketing-driven
 *     recoveries".
 *   - `email`       — at least one recovery email was delivered for
 *     this cart, but the order didn't carry a matching coupon.
 *     Influence is plausible but unproven.
 *   - `organic`     — no recovery email landed; the customer came back
 *     on their own.
 *
 * Computed at read time from `EmailSend` + `Order.couponCode` —
 * deliberately not denormalised on the cart, so backfilling Phase 3
 * email rows automatically updates attribution.
 */
export type RecoveryAttribution = 'organic' | 'email' | 'email_coupon';

export interface AbandonedCartRow {
  /** CDP UUID — used in detail-page URLs and admin actions. */
  id: string;
  /** Magento quote/cart entity id. */
  cart_id: number;
  /** CDP customer profile id (when registered + synced). */
  customer_id: string | null;
  /** Magento customer id (when registered). */
  magento_customer_id: number | null;
  email: string | null;
  customer_name: string | null;
  is_guest: boolean;
  items_count: number;
  items_qty: number;
  subtotal: string;
  grand_total: string;
  currency_code: string | null;
  created_at: string;
  updated_at: string;
  abandoned_at: string;
  status: 'open' | 'recovered' | 'expired';
  recovered_at: string | null;
  recovered_by_order_id: string | null;
  recovered_amount: string | null;
  expired_at: string | null;
  /** Minutes since `abandonedAt` (open) or until recovery (recovered). */
  age_minutes: number;
  /**
   * Marketing attribution. Always populated for `status === 'recovered'`
   * rows; null for everything else (the field would be misleading for
   * an open or expired cart).
   */
  recovery_attribution: RecoveryAttribution | null;
  /** Coupon code on the recovered order (when present). */
  recovery_coupon_code: string | null;
  /** Email send that owns the matching coupon (only for `email_coupon`). */
  recovery_email_send_id: string | null;
  /** Campaign that owns the email send. */
  recovery_email_campaign_id: string | null;
}

export interface RecoveryKpis {
  window_days: number;
  carts_open: number;
  carts_recovered: number;
  carts_expired: number;
  recovered_revenue: string;
  open_at_risk: string;
  recovery_rate: number | null;
  /** Recovered carts in the window with an `email_coupon` attribution. */
  recovered_via_email_coupon: number;
  /** Recovered carts in the window with `email` (no coupon match). */
  recovered_via_email: number;
  /** Sum of recovered_amount for the email + email_coupon buckets. */
  recovered_revenue_attributed: string;
}

export interface AbandonedCartsResponse {
  generated_at: string;
  status: AbandonedCartStatusFilter;
  range: AbandonedCartRangeFilter;
  /** Wall-clock of the last sweep that touched this tenant. */
  last_synced_at: string | null;
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
  totals: {
    carts: number;
    items_qty: number;
    grand_total: string;
    recoverable_customers: number;
    recovered_revenue: string;
  };
  kpis: RecoveryKpis;
  data: AbandonedCartRow[];
}

@Injectable()
export class CartsService {
  private readonly logger = new Logger(CartsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<AbandonedCartRow> {
    const c = await this.prisma.abandonedCart.findUnique({
      where: { id },
      include: { customer: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!c || c.tenantId !== tenantId) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException(`AbandonedCart ${id} not found`);
    }
    const ageReference = c.status === 'recovered' && c.recoveredAt ? c.recoveredAt : c.abandonedAt;
    const attribution =
      c.status === 'recovered'
        ? (await this.computeAttributions(tenantId, [c.id])).get(c.id) ?? {
            recovery_attribution: 'organic' as RecoveryAttribution,
            recovery_coupon_code: null,
            recovery_email_send_id: null,
            recovery_email_campaign_id: null,
          }
        : null;
    return {
      id: c.id,
      cart_id: c.magentoCartId,
      customer_id: c.customerProfileId,
      magento_customer_id: c.magentoCustomerId ? Number(c.magentoCustomerId) : null,
      email: c.customerEmail ?? c.customer?.email ?? null,
      customer_name:
        c.customerName ??
        ([c.customer?.firstName, c.customer?.lastName].filter(Boolean).join(' ') || null),
      is_guest: c.isGuest,
      items_count: c.itemsCount,
      items_qty: c.itemsQty,
      subtotal: c.subtotal.toString(),
      grand_total: c.grandTotal.toString(),
      currency_code: c.currencyCode,
      created_at: c.magentoCreatedAt.toISOString(),
      updated_at: c.magentoUpdatedAt.toISOString(),
      abandoned_at: c.abandonedAt.toISOString(),
      status: c.status as 'open' | 'recovered' | 'expired',
      recovered_at: c.recoveredAt?.toISOString() ?? null,
      recovered_by_order_id: c.recoveredByOrderId,
      recovered_amount: c.recoveredAmount?.toString() ?? null,
      expired_at: c.expiredAt?.toISOString() ?? null,
      age_minutes: Math.max(
        0,
        Math.round((Date.now() - ageReference.getTime()) / 60_000),
      ),
      recovery_attribution: attribution?.recovery_attribution ?? null,
      recovery_coupon_code: attribution?.recovery_coupon_code ?? null,
      recovery_email_send_id: attribution?.recovery_email_send_id ?? null,
      recovery_email_campaign_id: attribution?.recovery_email_campaign_id ?? null,
    };
  }

  async listAbandoned(
    tenantId: string,
    query: AbandonedCartsQuery,
  ): Promise<AbandonedCartsResponse> {
    const now = new Date();
    const rangeStart = startOfRange(now, query.range);
    const dateColumn = query.status === 'recovered' ? 'recoveredAt' : 'abandonedAt';

    const where: Prisma.AbandonedCartWhereInput = {
      tenantId,
      status: query.status,
      ...(rangeStart ? { [dateColumn]: { gte: rangeStart } } : {}),
      ...(query.hide_guests ? { isGuest: false } : {}),
    };

    const orderBy: Prisma.AbandonedCartOrderByWithRelationInput =
      query.status === 'recovered'
        ? { recoveredAt: 'desc' }
        : { abandonedAt: 'desc' };

    const [rows, totalCount] = await Promise.all([
      this.prisma.abandonedCart.findMany({
        where,
        orderBy,
        take: query.limit,
        skip: (query.page - 1) * query.limit,
      }),
      this.prisma.abandonedCart.count({ where }),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalCount / query.limit));

    const totalGrand = rows.reduce(
      (acc, c) => acc.plus(c.grandTotal),
      new Prisma.Decimal(0),
    );
    const totalQty = rows.reduce((acc, c) => acc + c.itemsQty, 0);
    const recoverable = rows.filter((c) => c.customerProfileId !== null).length;
    const recoveredRevenue = rows.reduce(
      (acc, c) => (c.recoveredAmount ? acc.plus(c.recoveredAmount) : acc),
      new Prisma.Decimal(0),
    );

    const lastSynced = await this.prisma.abandonedCart.findFirst({
      where: { tenantId },
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    });

    const kpis = await this.computeRecoveryKpis(tenantId, now);

    // Attribution is only meaningful on the recovered tab — fetch the
    // full set in one batched query against EmailSend + Order, keyed by
    // the visible page's cart ids. Page size is bounded to ≤500 so this
    // stays well within Postgres's IN-list comfort zone.
    const attributions =
      query.status === 'recovered'
        ? await this.computeAttributions(
            tenantId,
            rows.map((r) => r.id),
          )
        : new Map();

    return {
      generated_at: now.toISOString(),
      status: query.status,
      range: query.range,
      last_synced_at: lastSynced?.syncedAt.toISOString() ?? null,
      page: query.page,
      limit: query.limit,
      total_count: totalCount,
      total_pages: totalPages,
      totals: {
        carts: rows.length,
        items_qty: totalQty,
        grand_total: totalGrand.toString(),
        recoverable_customers: recoverable,
        recovered_revenue: recoveredRevenue.toString(),
      },
      kpis,
      data: rows.map((c) => {
        const ageReference =
          c.status === 'recovered' && c.recoveredAt ? c.recoveredAt : c.abandonedAt;
        const attr =
          c.status === 'recovered'
            ? attributions.get(c.id) ?? {
                recovery_attribution: 'organic' as RecoveryAttribution,
                recovery_coupon_code: null,
                recovery_email_send_id: null,
                recovery_email_campaign_id: null,
              }
            : null;
        return {
          id: c.id,
          cart_id: c.magentoCartId,
          customer_id: c.customerProfileId,
          magento_customer_id: c.magentoCustomerId ? Number(c.magentoCustomerId) : null,
          email: c.customerEmail,
          customer_name: c.customerName,
          is_guest: c.isGuest,
          items_count: c.itemsCount,
          items_qty: c.itemsQty,
          subtotal: c.subtotal.toString(),
          grand_total: c.grandTotal.toString(),
          currency_code: c.currencyCode,
          created_at: c.magentoCreatedAt.toISOString(),
          updated_at: c.magentoUpdatedAt.toISOString(),
          abandoned_at: c.abandonedAt.toISOString(),
          status: c.status as 'open' | 'recovered' | 'expired',
          recovered_at: c.recoveredAt?.toISOString() ?? null,
          recovered_by_order_id: c.recoveredByOrderId,
          recovered_amount: c.recoveredAmount?.toString() ?? null,
          expired_at: c.expiredAt?.toISOString() ?? null,
          age_minutes: Math.max(
            0,
            Math.round((now.getTime() - ageReference.getTime()) / 60_000),
          ),
          recovery_attribution: attr?.recovery_attribution ?? null,
          recovery_coupon_code: attr?.recovery_coupon_code ?? null,
          recovery_email_send_id: attr?.recovery_email_send_id ?? null,
          recovery_email_campaign_id: attr?.recovery_email_campaign_id ?? null,
        };
      }),
    };
  }

  /**
   * For a batch of recovered cart ids, decide whether each one should
   * be attributed to a marketing email and (when possible) to a
   * specific coupon-bearing send.
   *
   * Strategy:
   *   1. Pull the recovered orders' coupon codes for the input cart
   *      ids — Order rows are the source of truth for what was applied.
   *   2. Pull EmailSend rows that targeted those carts AND have at
   *      least reached `delivered` (we don't credit emails that never
   *      left the queue).
   *   3. For each cart, prefer the strongest match:
   *        a. send.couponCode (case-insensitive) == order.couponCode
   *           → 'email_coupon' attribution, with the send/campaign id.
   *        b. Otherwise, if any matching send exists → 'email'.
   *        c. Otherwise → not present in the map (caller defaults to
   *           'organic').
   */
  private async computeAttributions(
    tenantId: string,
    cartIds: string[],
  ): Promise<
    Map<
      string,
      {
        recovery_attribution: RecoveryAttribution;
        recovery_coupon_code: string | null;
        recovery_email_send_id: string | null;
        recovery_email_campaign_id: string | null;
      }
    >
  > {
    const out = new Map<
      string,
      {
        recovery_attribution: RecoveryAttribution;
        recovery_coupon_code: string | null;
        recovery_email_send_id: string | null;
        recovery_email_campaign_id: string | null;
      }
    >();
    if (cartIds.length === 0) return out;

    const carts = await this.prisma.abandonedCart.findMany({
      where: { tenantId, id: { in: cartIds } },
      select: {
        id: true,
        recoveredByOrderId: true,
        recoveredByOrder: { select: { couponCode: true } },
      },
    });
    const orderCoupons = new Map<string, string | null>();
    for (const c of carts) {
      orderCoupons.set(c.id, c.recoveredByOrder?.couponCode ?? null);
    }

    const sends = await this.prisma.emailSend.findMany({
      where: {
        tenantId,
        abandonedCartId: { in: cartIds },
        // Anything past the network. `pending`/`queued`/`failed`/
        // `suppressed`/`cancelled` doesn't count — those never reached
        // the customer.
        status: { in: ['delivered', 'bounced', 'complained'] },
      },
      select: {
        id: true,
        abandonedCartId: true,
        couponCode: true,
        campaignId: true,
        sentAt: true,
      },
      orderBy: { sentAt: 'desc' },
    });

    const sendsByCart = new Map<string, typeof sends>();
    for (const s of sends) {
      if (!s.abandonedCartId) continue;
      const list = sendsByCart.get(s.abandonedCartId) ?? [];
      list.push(s);
      sendsByCart.set(s.abandonedCartId, list);
    }

    for (const cartId of cartIds) {
      const cartSends = sendsByCart.get(cartId) ?? [];
      if (cartSends.length === 0) continue;
      const orderCoupon = (orderCoupons.get(cartId) ?? '').trim().toUpperCase();
      const couponMatch = orderCoupon
        ? cartSends.find(
            (s) =>
              s.couponCode !== null &&
              s.couponCode.trim().toUpperCase() === orderCoupon,
          )
        : undefined;
      if (couponMatch) {
        out.set(cartId, {
          recovery_attribution: 'email_coupon',
          recovery_coupon_code: orderCoupons.get(cartId) ?? null,
          recovery_email_send_id: couponMatch.id,
          recovery_email_campaign_id: couponMatch.campaignId,
        });
      } else {
        out.set(cartId, {
          recovery_attribution: 'email',
          recovery_coupon_code: orderCoupons.get(cartId) ?? null,
          recovery_email_send_id: null,
          recovery_email_campaign_id: null,
        });
      }
    }
    return out;
  }

  /**
   * Aggregate KPIs across the recovery window. Used for the tile strip
   * on /carts and (later) for the email-marketing dashboard. Carts in
   * `purged` are excluded — they aren't recoverable.
   */
  private async computeRecoveryKpis(tenantId: string, now: Date): Promise<RecoveryKpis> {
    const windowStart = new Date(now.getTime() - RECOVERY_KPI_WINDOW_DAYS * 24 * 60 * 60_000);

    const [openCount, recoveredAgg, expiredCount, openSubtotal, recoveredInWindow] =
      await Promise.all([
        this.prisma.abandonedCart.count({
          where: { tenantId, status: 'open' },
        }),
        this.prisma.abandonedCart.aggregate({
          where: { tenantId, status: 'recovered', recoveredAt: { gte: windowStart } },
          _count: { _all: true },
          _sum: { recoveredAmount: true },
        }),
        this.prisma.abandonedCart.count({
          where: { tenantId, status: 'expired', expiredAt: { gte: windowStart } },
        }),
        this.prisma.abandonedCart.aggregate({
          where: { tenantId, status: 'open' },
          _sum: { grandTotal: true },
        }),
        this.prisma.abandonedCart.findMany({
          where: { tenantId, status: 'recovered', recoveredAt: { gte: windowStart } },
          select: { id: true, recoveredAmount: true },
        }),
      ]);

    const recoveredCount = recoveredAgg._count._all;
    const expiredOrRecovered = recoveredCount + expiredCount;
    const recoveryRate = expiredOrRecovered === 0 ? null : recoveredCount / expiredOrRecovered;

    // Attribution KPI — same window as the recovery numbers above so
    // the percentages line up. We compute attribution for *every*
    // recovered cart in the window in one batch; this is bounded by
    // RECOVERY_KPI_WINDOW_DAYS (30d), which keeps the working set small
    // for any single tenant on Phase 1 volumes.
    let recoveredViaEmailCoupon = 0;
    let recoveredViaEmail = 0;
    let attributedRevenue = new Prisma.Decimal(0);
    if (recoveredInWindow.length > 0) {
      const attributions = await this.computeAttributions(
        tenantId,
        recoveredInWindow.map((r) => r.id),
      );
      for (const r of recoveredInWindow) {
        const a = attributions.get(r.id);
        if (!a) continue;
        if (a.recovery_attribution === 'email_coupon') recoveredViaEmailCoupon += 1;
        else if (a.recovery_attribution === 'email') recoveredViaEmail += 1;
        if (r.recoveredAmount) {
          attributedRevenue = attributedRevenue.plus(r.recoveredAmount);
        }
      }
    }

    return {
      window_days: RECOVERY_KPI_WINDOW_DAYS,
      carts_open: openCount,
      carts_recovered: recoveredCount,
      carts_expired: expiredCount,
      recovered_revenue: (recoveredAgg._sum.recoveredAmount ?? new Prisma.Decimal(0)).toString(),
      open_at_risk: (openSubtotal._sum.grandTotal ?? new Prisma.Decimal(0)).toString(),
      recovery_rate: recoveryRate,
      recovered_via_email_coupon: recoveredViaEmailCoupon,
      recovered_via_email: recoveredViaEmail,
      recovered_revenue_attributed: attributedRevenue.toString(),
    };
  }
}

function startOfRange(now: Date, range: AbandonedCartRangeFilter): Date | null {
  switch (range) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60_000);
    case 'all':
      return null;
  }
}
