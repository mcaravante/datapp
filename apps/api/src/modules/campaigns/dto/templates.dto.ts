import { z } from 'zod';

export const EmailTemplateChannelSchema = z.enum([
  'abandoned_cart',
  'transactional',
  'marketing',
]);

export const EmailTemplateFormatSchema = z.enum(['mjml', 'html']);

/**
 * Minimal JSON-Schema-shaped variables hint. We only enforce `required`
 * (the renderer fail-fasts on missing keys) for now.
 */
export const TemplateVariablesSchema = z
  .object({
    required: z.array(z.string().min(1).max(100)).max(50).optional(),
    description: z.string().max(2000).optional(),
  })
  .strict()
  .optional();

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const CreateEmailTemplateSchema = z.object({
  channel: EmailTemplateChannelSchema,
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(SLUG_REGEX, 'Lower-case letters, digits, and hyphens only'),
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1).max(200_000),
  bodyText: z.string().max(50_000).optional().nullable(),
  variables: TemplateVariablesSchema,
  format: EmailTemplateFormatSchema.default('html'),
  isActive: z.boolean().default(true),
});
export type CreateEmailTemplateBody = z.infer<typeof CreateEmailTemplateSchema>;

export const UpdateEmailTemplateSchema = CreateEmailTemplateSchema.partial().extend({
  // slug is immutable post-create — we never allow renames here because
  // active campaigns reference by id, not slug, but slug lookups are
  // operator-facing identity.
  slug: z.never().optional(),
});
export type UpdateEmailTemplateBody = z.infer<typeof UpdateEmailTemplateSchema>;

export const PreviewEmailTemplateSchema = z.object({
  /** Variable context to use for the preview render. */
  variables: z.record(z.string(), z.unknown()).default({}),
});
export type PreviewEmailTemplateBody = z.infer<typeof PreviewEmailTemplateSchema>;

export interface EmailTemplateSummary {
  id: string;
  channel: 'abandoned_cart' | 'transactional' | 'marketing';
  slug: string;
  name: string;
  subject: string;
  format: 'mjml' | 'html';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateDetail extends EmailTemplateSummary {
  body_html: string;
  body_text: string | null;
  variables: Record<string, unknown>;
}

export interface EmailTemplatePreviewResponse {
  subject: string;
  html: string;
  text: string | null;
}
