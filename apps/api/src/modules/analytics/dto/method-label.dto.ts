import { z } from 'zod';

export const MethodKindSchema = z.enum(['payment', 'shipping']);

export const UpsertMethodLabelSchema = z.object({
  kind: MethodKindSchema,
  code: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  /**
   * Optional pointer to the canonical code this row is an alias of.
   * Set this on the legacy code to fold its orders into the new one
   * (e.g. `mercadopago_basic` → `mercadopago_adbpayment_checkout_pro`).
   * Empty string means "no alias" — same as omitting.
   */
  mergeIntoCode: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});
export type UpsertMethodLabelDto = z.infer<typeof UpsertMethodLabelSchema>;
