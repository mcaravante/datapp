import { z } from 'zod';

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

/**
 * Whitelisted sort fields for `/orders`. Anything not in this set is
 * coerced back to the default — protects the indexed orderBy from
 * being driven by arbitrary input.
 */
export const OrderSortField = z.enum([
  'placed_at',
  'grand_total',
  'magento_order_number',
  'customer_email',
  'status',
  'item_count',
]);
export type OrderSortField = z.infer<typeof OrderSortField>;

export const ListOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
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
  /** CDP region id (Int autoincrement, see `region` table). */
  region: z.coerce.number().int().positive().optional(),
  sort: OrderSortField.default('placed_at'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;
