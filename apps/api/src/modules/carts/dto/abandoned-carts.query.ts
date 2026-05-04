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
  /** 1-based page number. */
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  /** Cap on how many carts to return per page. */
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

export type AbandonedCartsQuery = z.infer<typeof AbandonedCartsQuerySchema>;
