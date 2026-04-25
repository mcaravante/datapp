import { z } from 'zod';

/** Tenant slug — kebab-case, 2..32 chars. Used in URLs and the X-Crm-Tenant header. */
export const TenantSlugSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug must be kebab-case alphanumeric');

export type TenantSlug = z.infer<typeof TenantSlugSchema>;

export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;
