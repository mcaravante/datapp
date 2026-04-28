import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@cdp/db';
import type { MagentoCart } from '@cdp/magento-client';
import { PrismaService } from '../../db/prisma.service';
import { MagentoClientFactory } from '../magento/magento-client.factory';
import { MagentoStoreService } from '../magento/magento-store.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly stores: MagentoStoreService,
    private readonly factory: MagentoClientFactory,
  ) {}

  /**
   * Live read against Magento `/V1/carts/search`, filtered to active
   * carts whose `updated_at` is older than `minutes_idle` and whose
   * `items_count > 0`. Magento customer ids are joined to CDP profiles
   * so the UI can link to /customers/:id when available.
   *
   * No persistence — abandoned-cart visualization is read-only in
   * Phase 1. When Phase 3 ships email recovery we'll snapshot here.
   */
  async listAbandoned(
    tenantId: string,
    query: AbandonedCartsQuery,
  ): Promise<AbandonedCartsResponse> {
    const store = await this.stores.findFirstByTenant(tenantId);
    const client = this.factory.forStore(store);

    const now = new Date();
    const cutoff = new Date(now.getTime() - query.minutes_idle * 60_000);
    // Magento expects the timestamp in store-server local time; UTC
    // works on Cloud (server runs UTC) and is the safer default. The
    // operator can tighten the threshold if they see fresher carts
    // showing up than expected.
    const cutoffMagento = formatMagentoDate(cutoff);

    const result = await client.carts.search({
      pageSize: query.limit,
      currentPage: query.page,
      sortOrders: [{ field: 'updated_at', direction: 'DESC' }],
      filterGroups: [
        [{ field: 'is_active', value: 1, condition_type: 'eq' }],
        [{ field: 'items_count', value: 0, condition_type: 'gt' }],
        [{ field: 'updated_at', value: cutoffMagento, condition_type: 'lt' }],
      ],
    });

    // Resolve Magento customer ids to CDP profile ids so the UI can
    // open the right Customer 360.
    const magentoCustomerIds = uniqueDefined(
      result.items.map((c) => extractMagentoCustomerId(c)),
    );
    const profilesByMagentoId = new Map<string, string>();
    if (magentoCustomerIds.length > 0) {
      const profiles = await this.prisma.customerProfile.findMany({
        where: {
          tenantId,
          magentoCustomerId: { in: magentoCustomerIds.map(String) },
        },
        select: { id: true, magentoCustomerId: true },
      });
      for (const p of profiles) {
        profilesByMagentoId.set(p.magentoCustomerId, p.id);
      }
    }

    const data: AbandonedCartRow[] = result.items.map((c) => toRow(c, profilesByMagentoId, now));

    const totalGrand = data.reduce((acc, c) => acc.plus(c.grand_total), new Prisma.Decimal(0));
    const totalQty = data.reduce((acc, c) => acc + c.items_qty, 0);
    const recoverable = data.filter((c) => c.customer_id !== null).length;

    return {
      generated_at: now.toISOString(),
      threshold_minutes: query.minutes_idle,
      totals: {
        carts: data.length,
        items_qty: totalQty,
        grand_total: totalGrand.toString(),
        recoverable_customers: recoverable,
      },
      data,
    };
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
    c?.quote_currency_code ?? c?.store_currency_code ?? c?.global_currency_code ?? c?.base_currency_code ?? null
  );
}

function toRow(
  cart: MagentoCart,
  profilesByMagentoId: Map<string, string>,
  now: Date,
): AbandonedCartRow {
  const magentoId = extractMagentoCustomerId(cart);
  const customerId = magentoId !== null ? (profilesByMagentoId.get(String(magentoId)) ?? null) : null;
  const updated = parseUtc(cart.updated_at);
  const minutesIdle = Math.max(0, Math.round((now.getTime() - updated.getTime()) / 60_000));

  return {
    cart_id: cart.id,
    customer_id: customerId,
    magento_customer_id: magentoId,
    email: extractEmail(cart),
    customer_name: extractName(cart),
    is_guest: isGuest(cart),
    items_count: cart.items_count,
    items_qty: cart.items_qty,
    subtotal: (cart.subtotal ?? 0).toString(),
    grand_total: (cart.grand_total ?? 0).toString(),
    currency_code: pickCurrency(cart),
    created_at: parseUtc(cart.created_at).toISOString(),
    updated_at: updated.toISOString(),
    minutes_idle: minutesIdle,
  };
}

function parseUtc(iso: string): Date {
  // Magento returns `YYYY-MM-DD HH:mm:ss` in server local time (UTC on
  // Cloud). Treat it as UTC to be consistent with the rest of the CDP.
  const safe = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid Magento timestamp: ${iso}`);
  }
  return d;
}

function formatMagentoDate(d: Date): string {
  // Magento expects `YYYY-MM-DD HH:mm:ss`.
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
