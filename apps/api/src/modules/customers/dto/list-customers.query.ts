import { z } from 'zod';

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
});

export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;
