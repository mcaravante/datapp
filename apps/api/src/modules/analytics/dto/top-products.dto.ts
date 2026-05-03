import { z } from 'zod';
import { AnalyticsRangeSchema } from './range.dto';

export const TopProductsSortField = z.enum(['revenue', 'units', 'orders', 'sku', 'name']);
export type TopProductsSortField = z.infer<typeof TopProductsSortField>;

export const TopProductsQuerySchema = AnalyticsRangeSchema.extend({
  /** Free-text filter applied as ILIKE on sku and name. */
  q: z.string().min(1).max(200).optional(),
  sort: TopProductsSortField.default('revenue'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});
export type TopProductsQuery = z.infer<typeof TopProductsQuerySchema>;

export interface TopProductRow {
  sku: string;
  name: string;
  units: number;
  revenue: string; // Decimal serialized as string
  orders: number;
}

export interface TopProductsResponse {
  range: { from: string; to: string };
  sort: TopProductsSortField;
  dir: 'asc' | 'desc';
  data: TopProductRow[];
}
