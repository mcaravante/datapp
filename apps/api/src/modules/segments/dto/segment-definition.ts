import { z } from 'zod';

/**
 * Filter shape used to compute a static segment's membership. Mirrors
 * the customers list filters plus an RFM segment filter so the user
 * can save a query they already use on the /customers page.
 *
 * Strict object — unknown keys are rejected so we don't silently
 * accept filter shapes the membership computation hasn't implemented.
 */
export const RfmSegmentLabelSchema = z.enum([
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
]);

export const SegmentDefinitionSchema = z
  .object({
    /** Free-text match against email / first_name / last_name. */
    q: z.string().min(1).max(200).optional(),
    /** INDEC region ids; the customer matches if any of their addresses sits in one. */
    region_id: z.array(z.number().int().positive()).max(50).optional(),
    /** Magento customer group. */
    customer_group: z.string().min(1).max(100).optional(),
    /** RFM segment labels; matches if the customer's current label is in the set. */
    rfm_segment: z.array(RfmSegmentLabelSchema).max(11).optional(),
  })
  .strict();

export type SegmentDefinition = z.infer<typeof SegmentDefinitionSchema>;

export const CreateSegmentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  definition: SegmentDefinitionSchema,
});

export type CreateSegmentBody = z.infer<typeof CreateSegmentSchema>;

export const ListSegmentMembersQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListSegmentMembersQuery = z.infer<typeof ListSegmentMembersQuerySchema>;
