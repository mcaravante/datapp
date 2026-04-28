import { z } from 'zod';

export const AbandonedCartsQuerySchema = z.object({
  /**
   * Minimum minutes a cart must have been idle (`now - updated_at >=
   * minutes_idle`) to count as abandoned. Default 60.
   */
  minutes_idle: z.coerce.number().int().min(1).max(60 * 24 * 30).default(60),
  /** Cap on how many carts to return. Default 100, max 500. */
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /** 1-based page index over the Magento search. */
  page: z.coerce.number().int().min(1).default(1),
});

export type AbandonedCartsQuery = z.infer<typeof AbandonedCartsQuerySchema>;
