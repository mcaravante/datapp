import { z } from 'zod';
import { AnalyticsRangeSchema, CurrencyFilter } from './range.dto';

export const TimingQuerySchema = AnalyticsRangeSchema.extend({
  currency: CurrencyFilter.default('ars'),
});
export type TimingQuery = z.infer<typeof TimingQuerySchema>;

export interface HeatmapCell {
  /** 0 = Sunday … 6 = Saturday (Postgres extract(dow)). */
  dow: number;
  /** 0..23 in America/Argentina/Buenos_Aires. */
  hour: number;
  orders: number;
  revenue: string;
}

export interface CadenceBucket {
  /** Inclusive lower bound in days. */
  days_min: number;
  /** Exclusive upper bound in days; null = open-ended. */
  days_max: number | null;
  label: string;
  /** Number of customer-gaps that fall in this bucket. */
  count: number;
  percent: number;
}

export interface TimingResponse {
  range: { from: string; to: string };
  timezone: 'America/Argentina/Buenos_Aires';
  heatmap: HeatmapCell[];
  cadence: {
    repeat_customers: number;
    /** Median days between consecutive orders across all gaps. */
    median_days: number | null;
    buckets: CadenceBucket[];
  };
}
