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
  /**
   * Drop carts placed as guest (no Magento customer linked). Defaults
   * to true because there's no email to send a recovery to — guests
   * are dead weight in this surface. The flag is still parsed so
   * legacy URLs (`?hide_guests=true`) keep working, and the admin
   * could in principle pass `?hide_guests=false` to opt back in for
   * debugging.
   */
  hide_guests: z.coerce.boolean().default(true),
});

export type AbandonedCartsQuery = z.infer<typeof AbandonedCartsQuerySchema>;
