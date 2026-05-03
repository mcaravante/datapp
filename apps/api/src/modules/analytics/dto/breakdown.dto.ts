import { z } from 'zod';
import { AnalyticsRangeSchema, CurrencyFilter } from './range.dto';

/**
 * Single-dimension distribution for the order set in a date range.
 * Used by `/reports` to show how revenue + orders split across
 * payment / shipping methods (and any future categorical column we
 * decide to expose).
 */
export const BreakdownDimension = z.enum(['payment_method', 'shipping_method']);
export type BreakdownDimension = z.infer<typeof BreakdownDimension>;

export const BreakdownQuerySchema = AnalyticsRangeSchema.extend({
  dimension: BreakdownDimension,
  currency: CurrencyFilter.default('ars'),
});
export type BreakdownQuery = z.infer<typeof BreakdownQuerySchema>;

export interface BreakdownRow {
  /** Raw column value (`mercadopago_custom`, `tablerate_bestway`, …). */
  key: string;
  orders: number;
  revenue: string;
  share_orders: number;
  share_revenue: number;
}

export interface BreakdownResponse {
  range: { from: string; to: string };
  dimension: BreakdownDimension;
  total_orders: number;
  total_revenue: string;
  data: BreakdownRow[];
}
