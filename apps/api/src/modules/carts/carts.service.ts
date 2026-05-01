import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import type { AbandonedCartsQuery } from './dto/abandoned-carts.query';

export interface AbandonedCartRow {
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
  minutes_idle: number;
}

export interface AbandonedCartsResponse {
  generated_at: string;
  threshold_minutes: number;
  /** Wall-clock of the last sweep that fed this table (most recent synced_at). */
  last_synced_at: string | null;
  totals: {
    carts: number;
    items_qty: number;
    grand_total: string;
    /** Carts whose owner is a known customer (not a guest). */
    recoverable_customers: number;
  };
  data: AbandonedCartRow[];
}

@Injectable()
export class CartsService {
  private readonly logger = new Logger(CartsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read abandoned carts from the local snapshot table populated by the
   * `AbandonedCartSyncService` cron — no live Magento round-trip. The
   * UI threshold (`minutes_idle`) is applied here so the operator can
   * tighten/loosen "what counts as abandoned" without re-syncing.
   */
  async listAbandoned(
    tenantId: string,
    query: AbandonedCartsQuery,
  ): Promise<AbandonedCartsResponse> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - query.minutes_idle * 60_000);

    const rows = await this.prisma.abandonedCart.findMany({
      where: { tenantId, magentoUpdatedAt: { lt: cutoff } },
      orderBy: { magentoUpdatedAt: 'desc' },
      take: query.limit,
    });

    const totalGrand = rows.reduce(
      (acc, c) => acc.plus(c.grandTotal),
      new Prisma.Decimal(0),
    );
    const totalQty = rows.reduce((acc, c) => acc + c.itemsQty, 0);
    const recoverable = rows.filter((c) => c.customerProfileId !== null).length;

    const lastSynced = await this.prisma.abandonedCart.findFirst({
      where: { tenantId },
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    });

    return {
      generated_at: now.toISOString(),
      threshold_minutes: query.minutes_idle,
      last_synced_at: lastSynced?.syncedAt.toISOString() ?? null,
      totals: {
        carts: rows.length,
        items_qty: totalQty,
        grand_total: totalGrand.toString(),
        recoverable_customers: recoverable,
      },
      data: rows.map((c) => ({
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
        minutes_idle: Math.max(
          0,
          Math.round((now.getTime() - c.magentoUpdatedAt.getTime()) / 60_000),
        ),
      })),
    };
  }
}
