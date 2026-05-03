import { z } from 'zod';

export const AbandonedCartStatusFilter = z.enum(['open', 'recovered', 'expired']);
export type AbandonedCartStatusFilter = z.infer<typeof AbandonedCartStatusFilter>;

export const AbandonedCartRangeFilter = z.enum(['7d', '30d', '90d', 'all']);
export type AbandonedCartRangeFilter = z.infer<typeof AbandonedCartRangeFilter>;

export const AbandonedCartsQuerySchema = z.object({
  /** Status tab to display. `purged` is intentionally not exposed — it's noise. */
  status: AbandonedCartStatusFilter.default('open'),
  /**
   * Time range applied to `abandonedAt` (open / expired) or `recoveredAt`
   * (recovered). `all` returns the full history.
   */
  range: AbandonedCartRangeFilter.default('30d'),
  /** Cap on how many carts to return. Default 100, max 500. */
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type AbandonedCartsQuery = z.infer<typeof AbandonedCartsQuerySchema>;
