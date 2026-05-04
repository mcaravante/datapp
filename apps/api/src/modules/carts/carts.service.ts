import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import type {
  AbandonedCartRangeFilter,
  AbandonedCartStatusFilter,
  AbandonedCartsQuery,
} from './dto/abandoned-carts.query';

const RECOVERY_KPI_WINDOW_DAYS = 30;

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
}

export interface RecoveryKpis {
  window_days: number;
  carts_open: number;
  carts_recovered: number;
  carts_expired: number;
  recovered_revenue: string;
  open_at_risk: string;
  recovery_rate: number | null;
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
        };
      }),
    };
  }

  /**
   * Aggregate KPIs across the recovery window. Used for the tile strip
   * on /carts and (later) for the email-marketing dashboard. Carts in
   * `purged` are excluded — they aren't recoverable.
   */
  private async computeRecoveryKpis(tenantId: string, now: Date): Promise<RecoveryKpis> {
    const windowStart = new Date(now.getTime() - RECOVERY_KPI_WINDOW_DAYS * 24 * 60 * 60_000);

    const [openCount, recoveredAgg, expiredCount, openSubtotal] = await Promise.all([
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
    ]);

    const recoveredCount = recoveredAgg._count._all;
    const expiredOrRecovered = recoveredCount + expiredCount;
    const recoveryRate = expiredOrRecovered === 0 ? null : recoveredCount / expiredOrRecovered;

    return {
      window_days: RECOVERY_KPI_WINDOW_DAYS,
      carts_open: openCount,
      carts_recovered: recoveredCount,
      carts_expired: expiredCount,
      recovered_revenue: (recoveredAgg._sum.recoveredAmount ?? new Prisma.Decimal(0)).toString(),
      open_at_risk: (openSubtotal._sum.grandTotal ?? new Prisma.Decimal(0)).toString(),
      recovery_rate: recoveryRate,
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
