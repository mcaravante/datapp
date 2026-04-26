import { z } from 'zod';
import { AnalyticsRangeSchema } from './range.dto';

export const TopProductsQuerySchema = AnalyticsRangeSchema.extend({
  order_by: z.enum(['units', 'revenue']).default('revenue'),
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
  order_by: 'units' | 'revenue';
  data: TopProductRow[];
}
