import { z } from 'zod';

export const AbandonedCartsQuerySchema = z.object({
  /**
   * Minimum minutes a cart must have been idle (`now - magento_updated_at >=
   * minutes_idle`) to count as abandoned. Default 24h.
   */
  minutes_idle: z.coerce.number().int().min(1).max(60 * 24 * 30).default(60 * 24),
  /** Cap on how many carts to return. Default 100, max 500. */
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type AbandonedCartsQuery = z.infer<typeof AbandonedCartsQuerySchema>;
