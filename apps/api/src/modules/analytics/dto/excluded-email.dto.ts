import { z } from 'zod';

/**
 * Accept either a full email (`name@domain.com`) or a bare domain
 * (`@domain.com`). Domain entries match every email that ends with
 * that suffix — handy to exclude every staff account in one shot.
 */
const emailOrDomain = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .refine(
    (v) => {
      // Domain form: starts with `@`, then at least one label + dot + TLD.
      if (v.startsWith('@')) {
        return /^@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v);
      }
      // Email form: standard shape (no fancy regex — RFC-compliance is
      // overkill, we just want to keep typos out).
      return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v);
    },
    { message: 'Must be a valid email or @domain' },
  );

export const AddExcludedEmailSchema = z.object({
  email: emailOrDomain,
  reason: z.string().trim().max(500).optional(),
});
export type AddExcludedEmailDto = z.infer<typeof AddExcludedEmailSchema>;
