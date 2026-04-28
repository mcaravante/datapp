import { z } from 'zod';

export const ProductAffinityQuerySchema = z.object({
  /** Focus SKU. Required. */
  sku: z.string().min(1).max(120),
  /** How many co-occurring SKUs to return. Default 10, max 50. */
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type ProductAffinityQuery = z.infer<typeof ProductAffinityQuerySchema>;

export interface ProductAffinityItem {
  sku: string;
  name: string;
  /** Orders containing both the focus SKU and this SKU. */
  co_orders: number;
  /** Orders containing this SKU at all. */
  total_orders: number;
  /**
   * P(this SKU | focus SKU) = co_orders / focus_orders. 0..1.
   * Higher means this SKU appears in a higher fraction of orders that
   * contain the focus.
   */
  confidence: number;
  /**
   * Lift: confidence / P(this SKU). >1 means co-occurrence is stronger
   * than chance; <1 means weaker.
   */
  lift: number;
}

export interface ProductAffinityResponse {
  /** The focus SKU. */
  sku: string;
  /** Best-effort canonical product name for the focus SKU. */
  name: string | null;
  /** Total orders that contain the focus SKU. */
  focus_orders: number;
  /** Total orders in the tenant (denominator for baseline P(this SKU)). */
  total_orders: number;
  data: ProductAffinityItem[];
}
