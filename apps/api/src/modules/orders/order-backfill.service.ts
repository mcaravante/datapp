import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';
import { RegionResolverService } from '../geo/region-resolver.service';
import { MagentoStoreService } from '../magento/magento-store.service';
import { MagentoClientFactory } from '../magento/magento-client.factory';

const SHIPPING_CHUNK = 100;
const REGION_BATCH = 500;

export interface BackfillReport {
  /** How many rows were NULL when the run started. */
  pending: number;
  /** Rows that ended up filled in. */
  updated: number;
  /** Rows still NULL after the run (because Magento didn't return a value
   *  or the address didn't resolve). */
  stillNull: number;
  /** Wall time, ms. */
  durationMs: number;
}

/**
 * Reusable backfill logic for `order.shipping_method` and
 * `order.region_id`. Lives as a Nest service so both the manual CLI
 * and the scheduled BullMQ cron drive the same code path. Idempotent:
 * each run only touches rows whose target column is still NULL.
 *
 * - shipping: re-fetches each Magento order and reads
 *   `extension_attributes.shipping_assignments[0].shipping.method`.
 *   Cost: one Magento API call per pending order — slow on large
 *   tenants.
 * - region:   re-runs the in-process resolver against the stored
 *   billing/shipping addresses. No external calls — fast.
 */
@Injectable()
export class OrderBackfillService {
  private readonly logger = new Logger(OrderBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: RegionResolverService,
    private readonly stores: MagentoStoreService,
    private readonly factory: MagentoClientFactory,
  ) {}

  async backfillShippingForStore(
    tenantId: string,
    storeName?: string,
  ): Promise<BackfillReport> {
    const startedAt = Date.now();
    const store = storeName
      ? await this.stores.findByTenantAndName(tenantId, storeName)
      : await this.stores.findFirstByTenant(tenantId);
    const client = this.factory.forStore(store);

    const pendingRows = await this.prisma.order.findMany({
      where: { tenantId, magentoStoreId: store.id, shippingMethod: null },
      select: { id: true, magentoOrderId: true },
      orderBy: { placedAt: 'desc' },
    });
    const pending = pendingRows.length;
    if (pending === 0) {
      return { pending: 0, updated: 0, stillNull: 0, durationMs: 0 };
    }

    // Index by magento_order_id (string) so we can resolve the CDP row
    // from the Magento response without re-querying the DB.
    const idxByMagentoId = new Map(pendingRows.map((r) => [r.magentoOrderId, r.id]));

    let updated = 0;
    let stillNull = 0;

    // Bulk-fetch shipping in chunks via `/V1/orders?searchCriteria…` with
    // `fields=` projection — one HTTP call per ~100 orders instead of one
    // per order. On large tenants this is the difference between minutes
    // and hours.
    for (let i = 0; i < pendingRows.length; i += SHIPPING_CHUNK) {
      const chunk = pendingRows.slice(i, i + SHIPPING_CHUNK);
      const ids = chunk.map((r) => Number(r.magentoOrderId));
      let projection: Awaited<ReturnType<typeof client.orders.searchShippingByIds>> = [];
      try {
        projection = await client.orders.searchShippingByIds(ids);
      } catch (err) {
        // Whole-chunk failures (network, 401, 5xx) — log and move on.
        this.logger.warn(
          `shipping backfill chunk failed ids=${ids.length} firstId=${ids[0]?.toString() ?? '?'}: ${err instanceof Error ? err.message : String(err)}`,
        );
        stillNull += chunk.length;
        continue;
      }

      const methodByMagentoId = new Map<string, string>();
      for (const row of projection) {
        if (row.method !== null) {
          methodByMagentoId.set(String(row.entityId), row.method);
        }
      }

      const updates: { id: string; method: string }[] = [];
      for (const row of chunk) {
        const method = methodByMagentoId.get(row.magentoOrderId);
        const cdpId = idxByMagentoId.get(row.magentoOrderId);
        if (method && cdpId) {
          updates.push({ id: cdpId, method });
        } else {
          stillNull += 1;
        }
      }

      if (updates.length > 0) {
        await this.prisma.$transaction(
          updates.map((u) =>
            this.prisma.order.update({
              where: { id: u.id },
              data: { shippingMethod: u.method },
              select: { id: true },
            }),
          ),
        );
        updated += updates.length;
      }
    }

    return {
      pending,
      updated,
      stillNull,
      durationMs: Date.now() - startedAt,
    };
  }

  async backfillRegionForTenant(tenantId: string): Promise<BackfillReport> {
    const startedAt = Date.now();
    const stores = await this.prisma.magentoStore.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, defaultCountry: true },
    });
    const defaultCountryByStore = new Map(
      stores.map((s) => [s.id, s.defaultCountry] as const),
    );

    const pending = await this.prisma.order.count({
      where: { tenantId, regionId: null },
    });
    if (pending === 0) {
      return { pending: 0, updated: 0, stillNull: 0, durationMs: 0 };
    }

    let processed = 0;
    let matched = 0;

    while (processed < pending) {
      const batch = await this.prisma.order.findMany({
        where: { tenantId, regionId: null },
        select: {
          id: true,
          magentoStoreId: true,
          shippingAddress: true,
          billingAddress: true,
        },
        orderBy: { placedAt: 'asc' },
        take: REGION_BATCH,
      });
      if (batch.length === 0) break;

      const updates = batch
        .map((row) => ({
          id: row.id,
          regionId: this.pickRegionId(
            defaultCountryByStore.get(row.magentoStoreId) ?? 'AR',
            row,
          ),
        }))
        .filter((u): u is { id: string; regionId: number } => u.regionId !== null);

      if (updates.length > 0) {
        await this.prisma.$transaction(
          updates.map((u) =>
            this.prisma.order.update({
              where: { id: u.id },
              data: { regionId: u.regionId },
              select: { id: true },
            }),
          ),
        );
        matched += updates.length;
      }

      processed += batch.length;

      // Avoid an infinite loop when a whole batch fails to match — the
      // WHERE still returns those same rows on the next iteration.
      if (updates.length === 0) break;
    }

    return {
      pending,
      updated: matched,
      stillNull: pending - matched,
      durationMs: Date.now() - startedAt,
    };
  }

  private pickRegionId(
    defaultCountry: string,
    row: { shippingAddress: unknown; billingAddress: unknown },
  ): number | null {
    for (const addr of [row.shippingAddress, row.billingAddress]) {
      if (!addr || typeof addr !== 'object') continue;
      const obj = addr as Record<string, unknown>;
      const country =
        typeof obj.country_id === 'string' && obj.country_id.length > 0
          ? obj.country_id
          : defaultCountry;
      const region = obj.region;
      if (!region) continue;
      const { regionId } = this.resolver.resolve(country, region);
      if (regionId !== null) return regionId;
    }
    return null;
  }
}
