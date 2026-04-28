import { z } from 'zod';

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const ListOrdersQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Free text — matches order_number / customer_email (case-insensitive). */
  q: z.string().min(1).max(200).optional(),
  /** Filter by customer profile UUID. */
  customer_id: z.string().uuid().optional(),
  /** Filter by exact coupon code (case-insensitive match). */
  coupon_code: z.string().min(1).max(120).optional(),
  /** Filter by Magento status. Repeatable: `?status=processing&status=complete`. */
  status: z
    .union([z.string().min(1).max(50), z.array(z.string().min(1).max(50))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  /** Inclusive lower bound on placed_at. */
  from: isoDate.optional(),
  /** Exclusive upper bound on placed_at. */
  to: isoDate.optional(),
});

export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;
