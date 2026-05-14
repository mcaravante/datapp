import { z } from 'zod';
import { AnalyticsRangeSchema } from './range.dto';

/**
 * Attribution report — revenue driven by items added to cart from a
 * tracked surface (today, the related-products carousel on the PDP).
 * Source data is the first-touch attribution captured by the Magento
 * `Pupe_RelatedProductsAttribution` module and synced into the
 * `order_item.added_from / source_product_id / source_product_sku`
 * columns.
 */
export const AttributionQuerySchema = AnalyticsRangeSchema.extend({
  /** Optional source filter; today only `related_products_pdp` exists. */
  source: z.string().min(1).max(64).optional(),
  /** Limit for the per-product breakdown. */
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AttributionQuery = z.infer<typeof AttributionQuerySchema>;

export interface AttributionTotals {
  /** Distinct order_items added from the tracked surface. */
  itemsCount: number;
  /** Sum of units actually ordered (qty_ordered). */
  unitsOrdered: number;
  /** Distinct orders that contain at least one attributed item. */
  ordersCount: number;
  /** Revenue from attributed items (sum of row_total). */
  revenue: string;
}

export interface AttributionProductRow {
  /** SKU sold from the carousel. */
  sku: string;
  /** Product name (longest variant title). */
  name: string;
  /** Units ordered of this SKU from the carousel. */
  units: number;
  /** Orders that included this SKU from the carousel. */
  orders: number;
  /** Revenue from this SKU from the carousel. */
  revenue: string;
}

export interface AttributionResponse {
  range: { from: string; to: string };
  totals: AttributionTotals;
  bySource: { source: string; itemsCount: number; ordersCount: number; revenue: string }[];
  topProducts: AttributionProductRow[];
}
