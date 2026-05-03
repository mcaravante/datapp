import { z } from 'zod';
import { AnalyticsRangeSchema, CurrencyFilter } from './range.dto';

export const AovHistogramQuerySchema = AnalyticsRangeSchema.extend({
  /** Number of equal-width buckets. */
  buckets: z.coerce.number().int().min(4).max(50).default(20),
  currency: CurrencyFilter.default('ars'),
});
export type AovHistogramQuery = z.infer<typeof AovHistogramQuerySchema>;

export interface AovHistogramBucket {
  /** Lower bound of the bucket (inclusive). */
  min: string;
  /** Upper bound of the bucket (exclusive). */
  max: string;
  /** Count of orders that fell in this bucket. */
  orders: number;
}

export interface AovHistogramResponse {
  range: { from: string; to: string };
  total_orders: number;
  /** Median order value over the range. */
  median: string;
  buckets: AovHistogramBucket[];
}
