import { z } from 'zod';
import { AnalyticsRangeSchema } from './range.dto';

export const RevenueGranularity = z.enum(['day', 'week', 'month', 'auto']);
export type RevenueGranularity = z.infer<typeof RevenueGranularity>;

export const RevenueTimeseriesQuerySchema = AnalyticsRangeSchema.extend({
  /**
   * Bucket size. `auto` (default) picks `day` for ≤ 90d windows and
   * `week` otherwise. Use `month` explicitly for YoY-style reports
   * spanning multiple years.
   */
  granularity: RevenueGranularity.default('auto'),
});
export type RevenueTimeseriesQuery = z.infer<typeof RevenueTimeseriesQuerySchema>;

export interface RevenueTimePoint {
  /** ISO date of the bucket start (UTC). */
  bucket: string;
  revenue: string;
  orders: number;
}

export interface RevenueTimeseriesResponse {
  range: { from: string; to: string };
  previous_range: { from: string; to: string };
  granularity: 'day' | 'week' | 'month';
  current: RevenueTimePoint[];
  previous: RevenueTimePoint[];
}
