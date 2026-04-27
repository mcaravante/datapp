import { z } from 'zod';
import { AnalyticsRangeSchema } from './range.dto';

export const GeoQuerySchema = AnalyticsRangeSchema.extend({
  /** ISO 3166-1 alpha-2. Defaults to AR. */
  country: z.string().length(2).toUpperCase().default('AR'),
});
export type GeoQuery = z.infer<typeof GeoQuerySchema>;

export interface GeoRegionRow {
  region_id: number;
  region_code: string;
  region_name: string;
  /** Distinct customers with at least one address in the region. */
  customers: number;
  /** Customers from the region who placed at least one order in the window. */
  buyers: number;
  /** Orders placed by buyers from the region in the window. */
  orders: number;
  /** Sum of real_revenue from those orders, Decimal as string. */
  revenue: string;
}

export interface GeoUnmatchedRow {
  region_raw: string | null;
  city_raw: string | null;
  postal_code: string | null;
  occurrences: number;
  last_seen_at: string;
}

export interface GeoResponse {
  range: { from: string; to: string };
  country: string;
  totals: {
    customers: number;
    buyers: number;
    orders: number;
    revenue: string;
  };
  data: GeoRegionRow[];
  unmatched: GeoUnmatchedRow[];
}
