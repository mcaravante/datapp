import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import type { MagentoCart } from '@datapp/magento-client';
import { PrismaService } from '../../db/prisma.service';
import { MagentoClientFactory } from '../magento/magento-client.factory';
import { MagentoStoreService } from '../magento/magento-store.service';

/**
 * The Magento search returns carts ordered by updated_at DESC. We pull
 * carts whose `updated_at` is older than this window — anything fresher
 * is still in active use and the UI doesn't surface it as abandoned. A
 * generous minimum (30 minutes) keeps the table small enough to be
 * filtered in the UI by any threshold the operator picks.
 */
const MIN_IDLE_MINUTES = 30;

/** Pull at most this many carts per sweep. Hard cap to keep run time bounded. */
const MAX_CARTS_PER_SWEEP = 5_000;

const PAGE_SIZE = 100;

export interface AbandonedCartSyncResult {
  fetched: number;
  upserted: number;
  removed: number;
  durationMs: number;
}

/**
 * Pulls active Magento carts whose `updated_at` is older than
 * `MIN_IDLE_MINUTES` and snapshots them into `abandoned_cart`. Carts
 * that no longer come back from Magento (converted to orders, deleted,
 * emptied) are dropped from the table. The admin UI reads from this
 * table only — no live round-trip — so /carts is fast and resilient
 * to Magento downtime.
 */
@Injectable()
export class AbandonedCartSyncService {
  private readonly logger = new Logger(AbandonedCartSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stores: MagentoStoreService,
    private readonly factory: MagentoClientFactory,
  ) {}

  /**
   * Sweep abandoned carts for one tenant + store. Idempotent: safe to
   * run as cron every N minutes and as a one-shot CLI.
   */
  async sweepStore(tenantId: string, storeName?: string): Promise<AbandonedCartSyncResult> {
    const startedAt = Date.now();
    const store = storeName
      ? await this.stores.findByTenantAndName(tenantId, storeName)
      : await this.stores.findFirstByTenant(tenantId);
    const client = this.factory.forStore(store);

    const now = new Date();
    const cutoff = new Date(now.getTime() - MIN_IDLE_MINUTES * 60_000);
    const cutoffMagento = formatMagentoDate(cutoff);

    let fetched = 0;
    let upserted = 0;
    const seenCartIds: number[] = [];

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

      const magentoCustomerIds = uniqueDefined(
        result.items.map((c) => extractMagentoCustomerId(c)),
      );
      const profilesByMagentoId = new Map<string, string>();
      if (magentoCustomerIds.length > 0) {
        const profiles = await this.prisma.customerProfile.findMany({
          where: { tenantId, magentoCustomerId: { in: magentoCustomerIds.map(String) } },
          select: { id: true, magentoCustomerId: true },
        });
        for (const p of profiles) profilesByMagentoId.set(p.magentoCustomerId, p.id);
      }

      for (const cart of result.items) {
        await this.upsertCart(tenantId, store.id, cart, profilesByMagentoId);
        upserted += 1;
        seenCartIds.push(cart.id);
      }

      if (result.items.length < PAGE_SIZE) break;
      if (fetched >= MAX_CARTS_PER_SWEEP) {
        this.logger.warn(
          `Reached MAX_CARTS_PER_SWEEP=${String(MAX_CARTS_PER_SWEEP)} for tenant=${tenantId} store=${store.name}; rest will be picked up next sweep`,
        );
        break;
      }
    }

    // Drop rows that didn't come back this sweep (cart converted to
    // order, deleted, or aged past whatever Magento search returns).
    const deleted = await this.prisma.abandonedCart.deleteMany({
      where: {
        tenantId,
        magentoStoreId: store.id,
        ...(seenCartIds.length > 0 ? { magentoCartId: { notIn: seenCartIds } } : {}),
      },
    });

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `Sweep tenant=${tenantId} store=${store.name}: fetched=${fetched} upserted=${upserted} removed=${deleted.count} durationMs=${durationMs}`,
    );
    return { fetched, upserted, removed: deleted.count, durationMs };
  }

  private async upsertCart(
    tenantId: string,
    storeId: string,
    cart: MagentoCart,
    profilesByMagentoId: Map<string, string>,
  ): Promise<void> {
    const magentoId = extractMagentoCustomerId(cart);
    const customerProfileId =
      magentoId !== null ? (profilesByMagentoId.get(String(magentoId)) ?? null) : null;
    const data = {
      tenantId,
      magentoStoreId: storeId,
      magentoCartId: cart.id,
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
      syncedAt: new Date(),
    };

    await this.prisma.abandonedCart.upsert({
      where: {
        tenantId_magentoStoreId_magentoCartId: {
          tenantId,
          magentoStoreId: storeId,
          magentoCartId: cart.id,
        },
      },
      create: data,
      update: data,
    });
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
