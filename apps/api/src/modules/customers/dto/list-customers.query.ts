import { z } from 'zod';

export const CustomerSortField = z.enum([
  'email',
  'magento_updated_at',
  'magento_created_at',
  'customer_group',
  /// Total orders ever placed by the customer. Sourced from the nightly
  /// RFM job's `frequency` column, so values are at most ~24h stale.
  'total_orders',
  /// Lifetime spend (sum of `real_revenue`). Sourced from RFM's
  /// `monetary` column for the same reason.
  'total_spent',
]);
export type CustomerSortField = z.infer<typeof CustomerSortField>;

const RFM_SEGMENTS = [
  'champions',
  'loyal',
  'potential_loyalists',
  'new_customers',
  'promising',
  'needing_attention',
  'about_to_sleep',
  'at_risk',
  'cannot_lose_them',
  'hibernating',
  'lost',
] as const;
export const RfmSegmentSchema = z.enum(RFM_SEGMENTS);
export type RfmSegment = z.infer<typeof RfmSegmentSchema>;

export const ListCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Free text — matches email / first_name / last_name (case-insensitive). */
  q: z.string().min(1).max(200).optional(),
  /** Filter by INDEC region id. Repeatable: `?region_id=1&region_id=2`. */
  region_id: z
    .union([z.coerce.number().int().positive(), z.array(z.coerce.number().int().positive())])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  customer_group: z.string().min(1).max(100).optional(),
  /** Repeatable: `?rfm_segment=champions&rfm_segment=loyal`. */
  rfm_segment: z
    .union([RfmSegmentSchema, z.array(RfmSegmentSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  sort: CustomerSortField.default('magento_updated_at'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  /**
   * Filter by analytics-exclusion membership:
   *  - `none` (default) — show every customer regardless
   *  - `only` — only customers whose email is in the exclusion list
   *  - `hide` — drop excluded customers from the result set
   */
  excluded: z.enum(['none', 'only', 'hide']).default('none'),
  /**
   * When sorting by `total_orders` / `total_spent`, the WHERE clause
   * normally restricts to profiles with an RFM row so empty profiles
   * don't surface first under DESC. Setting this flag keeps the empty
   * profiles in the result — useful when the operator wants to audit
   * who hasn't bought anything yet.
   */
  include_inactive: z.coerce.boolean().default(false),
});

export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;
