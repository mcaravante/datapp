import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import type { MagentoCart } from '@datapp/magento-client';
import { PrismaService } from '../../db/prisma.service';
import { MagentoClientFactory } from '../magento/magento-client.factory';
import { MagentoStoreService } from '../magento/magento-store.service';

/**
 * A cart is considered abandoned once Magento hasn't touched it for
 * this many minutes. Anything fresher is still in active use and is
 * skipped by the sweep.
 */
const ABANDON_THRESHOLD_MINUTES = 24 * 60; // 24h

/**
 * Carts in `open` that disappear from Magento and have no matching
 * order recovery beyond this window are considered lost permanently
 * (`expired`). Phase 3 nudge campaigns will use this to stop targeting
 * them.
 */
const EXPIRY_WINDOW_DAYS = 30;

/** Hard cap on how many carts we ingest in a single sweep. */
const MAX_CARTS_PER_SWEEP = 5_000;

const PAGE_SIZE = 100;

export interface AbandonedCartSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  recovered: number;
  expired: number;
  purged: number;
  durationMs: number;
}

/**
 * State machine for the `abandoned_cart` table:
 *
 *   open ──(matching order placed)──▶ recovered
 *   open ──(disappears, age > 30d)─▶ expired
 *   open ──(disappears, age ≤ 30d)─▶ purged
 *
 * Terminal states (recovered / expired / purged) are never reverted.
 * The sweep is fully idempotent — safe to run from the BullMQ cron and
 * the one-shot CLI without coordination.
 */
@Injectable()
export class AbandonedCartSyncService {
  private readonly logger = new Logger(AbandonedCartSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stores: MagentoStoreService,
    private readonly factory: MagentoClientFactory,
  ) {}

  async sweepStore(tenantId: string, storeName?: string): Promise<AbandonedCartSyncResult> {
    const startedAt = Date.now();
    const store = storeName
      ? await this.stores.findByTenantAndName(tenantId, storeName)
      : await this.stores.findFirstByTenant(tenantId);
    const client = this.factory.forStore(store);

    const now = new Date();
    const cutoff = new Date(now.getTime() - ABANDON_THRESHOLD_MINUTES * 60_000);
    const cutoffMagento = formatMagentoDate(cutoff);

    let fetched = 0;
    let inserted = 0;
    let updated = 0;
    const seenCartIds = new Set<number>();

    // Phase 1: pull every active Magento cart that has been idle past
    // the threshold and either insert (new abandonment) or refresh
    // totals (existing open row).
    for (let page = 1; ; page += 1) {
      const result = await client.carts.search({
        pageSize: PAGE_SIZE,
        currentPage: page,
        sortOrders: [{ field: 'updated_at', direction: 'DESC' }],
        filterGroups: [
          [{ field: 'is_active', value: 1, condition_type: 'eq' }],
          [{ field: 'items_count', value: 0, condition_type: 'gt' }],
          [{ field: 'updated_at', value: cutoffMagento, condition_type: 'lt' }],
        ],
      });

      if (result.items.length === 0) break;
      fetched += result.items.length;

      const profilesByMagentoId = await this.lookupCustomerProfiles(
        tenantId,
        result.items.map((c) => extractMagentoCustomerId(c)),
      );

      for (const cart of result.items) {
        const outcome = await this.upsertOpenCart(tenantId, store.id, cart, profilesByMagentoId);
        if (outcome === 'inserted') inserted += 1;
        else if (outcome === 'updated') updated += 1;
        seenCartIds.add(cart.id);
      }

      if (result.items.length < PAGE_SIZE) break;
      if (fetched >= MAX_CARTS_PER_SWEEP) {
        this.logger.warn(
          `Reached MAX_CARTS_PER_SWEEP=${String(MAX_CARTS_PER_SWEEP)} for tenant=${tenantId} store=${store.name}; rest will be picked up next sweep`,
        );
        break;
      }
    }

    // Phase 2: transition `open` rows that no longer come back from
    // Magento. Try to recover via `order.magento_quote_id`; otherwise
    // expire (older than the window) or purge (younger).
    const openRows = await this.prisma.abandonedCart.findMany({
      where: { tenantId, magentoStoreId: store.id, status: 'open' },
      select: { id: true, magentoCartId: true, abandonedAt: true, grandTotal: true },
    });

    let recovered = 0;
    let expired = 0;
    let purged = 0;

    const expiryCutoff = new Date(now.getTime() - EXPIRY_WINDOW_DAYS * 24 * 60 * 60_000);

    // Subset that needs terminal resolution: open rows that didn't come
    // back from Magento. Skip the rest in a single pass.
    const disappeared = openRows.filter((r) => !seenCartIds.has(r.magentoCartId));

    if (disappeared.length > 0) {
      // Batch lookup: one query for all candidate orders. Indexed by
      // (tenant_id, magento_store_id, magento_quote_id), so this is a
      // single index scan regardless of the open-set size.
      const candidateOrders = await this.prisma.order.findMany({
        where: {
          tenantId,
          magentoStoreId: store.id,
          magentoQuoteId: { in: disappeared.map((r) => String(r.magentoCartId)) },
        },
        select: {
          id: true,
          magentoQuoteId: true,
          realRevenue: true,
          grandTotal: true,
          placedAt: true,
        },
        orderBy: { placedAt: 'asc' },
      });

      // Group by quote_id and keep the earliest order per cart that
      // post-dates the abandonment (matches the previous semantics).
      const ordersByQuote = new Map<
        string,
        { id: string; realRevenue: Prisma.Decimal | null; grandTotal: Prisma.Decimal; placedAt: Date }
      >();
      for (const o of candidateOrders) {
        if (!o.magentoQuoteId) continue;
        if (!ordersByQuote.has(o.magentoQuoteId)) {
          ordersByQuote.set(o.magentoQuoteId, {
            id: o.id,
            realRevenue: o.realRevenue,
            grandTotal: o.grandTotal,
            placedAt: o.placedAt,
          });
        }
      }

      for (const row of disappeared) {
        const order = ordersByQuote.get(String(row.magentoCartId));
        if (order && order.placedAt.getTime() >= row.abandonedAt.getTime()) {
          const recoveredAmount =
            order.realRevenue !== null && order.realRevenue.gt(0)
              ? order.realRevenue
              : order.grandTotal;
          await this.prisma.abandonedCart.update({
            where: { id: row.id },
            data: {
              status: 'recovered',
              recoveredAt: order.placedAt,
              recoveredByOrderId: order.id,
              recoveredAmount,
              syncedAt: now,
            },
          });
          recovered += 1;
          continue;
        }

        if (row.abandonedAt.getTime() < expiryCutoff.getTime()) {
          await this.prisma.abandonedCart.update({
            where: { id: row.id },
            data: { status: 'expired', expiredAt: now, syncedAt: now },
          });
          expired += 1;
        } else {
          await this.prisma.abandonedCart.update({
            where: { id: row.id },
            data: { status: 'purged', expiredAt: now, syncedAt: now },
          });
          purged += 1;
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `Sweep tenant=${tenantId} store=${store.name}: fetched=${fetched} inserted=${inserted} updated=${updated} recovered=${recovered} expired=${expired} purged=${purged} durationMs=${durationMs}`,
    );
    return { fetched, inserted, updated, recovered, expired, purged, durationMs };
  }

  private async lookupCustomerProfiles(
    tenantId: string,
    candidates: (number | null)[],
  ): Promise<Map<string, string>> {
    const ids = uniqueDefined(candidates);
    if (ids.length === 0) return new Map();
    const profiles = await this.prisma.customerProfile.findMany({
      where: { tenantId, magentoCustomerId: { in: ids.map(String) } },
      select: { id: true, magentoCustomerId: true },
    });
    const out = new Map<string, string>();
    for (const p of profiles) out.set(p.magentoCustomerId, p.id);
    return out;
  }

  private async upsertOpenCart(
    tenantId: string,
    storeId: string,
    cart: MagentoCart,
    profilesByMagentoId: Map<string, string>,
  ): Promise<'inserted' | 'updated' | 'skipped'> {
    const existing = await this.prisma.abandonedCart.findUnique({
      where: {
        tenantId_magentoStoreId_magentoCartId: {
          tenantId,
          magentoStoreId: storeId,
          magentoCartId: cart.id,
        },
      },
      select: { id: true, status: true },
    });

    // Already terminal: keep the historical record untouched. (A cart
    // id won't be reissued by Magento; this is mostly defensive.)
    if (existing && existing.status !== 'open') return 'skipped';

    const magentoId = extractMagentoCustomerId(cart);
    const customerProfileId =
      magentoId !== null ? (profilesByMagentoId.get(String(magentoId)) ?? null) : null;
    const now = new Date();

    const snapshot = {
      customerProfileId,
      magentoCustomerId: magentoId !== null ? String(magentoId) : null,
      customerEmail: extractEmail(cart),
      customerName: extractName(cart),
      isGuest: isGuest(cart),
      itemsCount: cart.items_count,
      itemsQty: cart.items_qty,
      subtotal: new Prisma.Decimal(cart.subtotal ?? 0),
      grandTotal: new Prisma.Decimal(cart.grand_total ?? 0),
      currencyCode: pickCurrency(cart),
      magentoCreatedAt: parseUtc(cart.created_at),
      magentoUpdatedAt: parseUtc(cart.updated_at),
      syncedAt: now,
    };

    if (existing) {
      await this.prisma.abandonedCart.update({
        where: { id: existing.id },
        data: snapshot,
      });
      return 'updated';
    }

    await this.prisma.abandonedCart.create({
      data: {
        tenantId,
        magentoStoreId: storeId,
        magentoCartId: cart.id,
        abandonedAt: now,
        status: 'open',
        ...snapshot,
      },
    });
    return 'inserted';
  }
}

function uniqueDefined(values: (number | null | undefined)[]): number[] {
  const out = new Set<number>();
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) out.add(v);
  }
  return [...out];
}

function extractMagentoCustomerId(cart: MagentoCart): number | null {
  const fromNested = cart.customer?.id;
  if (typeof fromNested === 'number') return fromNested;
  return null;
}

function extractEmail(cart: MagentoCart): string | null {
  return cart.customer?.email ?? cart.customer_email ?? null;
}

function extractName(cart: MagentoCart): string | null {
  const first = cart.customer?.firstname ?? cart.customer_firstname ?? null;
  const last = cart.customer?.lastname ?? cart.customer_lastname ?? null;
  const parts = [first, last].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

function isGuest(cart: MagentoCart): boolean {
  if (typeof cart.customer_is_guest === 'boolean') return cart.customer_is_guest;
  if (typeof cart.customer_is_guest === 'number') return cart.customer_is_guest === 1;
  return extractMagentoCustomerId(cart) === null;
}

function pickCurrency(cart: MagentoCart): string | null {
  const c = cart.currency;
  return (
    c?.quote_currency_code ??
    c?.store_currency_code ??
    c?.global_currency_code ??
    c?.base_currency_code ??
    null
  );
}

function parseUtc(iso: string): Date {
  const safe = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid Magento timestamp: ${iso}`);
  return d;
}

function formatMagentoDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
