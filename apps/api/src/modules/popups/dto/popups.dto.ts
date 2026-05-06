import { z } from 'zod';

export const FormKindSchema = z.enum(['popup', 'inline', 'bar']);
export const FormStatusSchema = z.enum(['draft', 'active', 'paused', 'archived']);
export const FormTriggerSchema = z.enum([
  'immediate',
  'time_on_page',
  'scroll_depth',
  'exit_intent',
]);
export const FormDisplayFrequencySchema = z.enum([
  'once_per_session',
  'once_per_visitor',
  'every_visit',
]);

const HEX_COLOR = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * One field of the popup's form. The MVP renders only `email` (with
 * optional `first_name`); the schema is open so future popups can ask
 * for phone, dob, custom attributes, etc. without another migration.
 */
export const PopupFieldSchema = z.object({
  name: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  type: z.enum(['email', 'text', 'tel', 'checkbox']),
  required: z.boolean().default(true),
  placeholder: z.string().max(120).optional(),
});

/** URL-path matcher used by the loader to decide which popups to show. */
export const PageMatchRuleSchema = z.object({
  kind: z.enum(['equals', 'starts_with', 'regex']),
  value: z.string().min(1).max(500),
});

const PopupBaseSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(SLUG_REGEX, 'Lower-case letters, digits, and hyphens only'),
  name: z.string().min(1).max(120),
  kind: FormKindSchema.default('popup'),
  status: FormStatusSchema.default('draft'),
  headline: z.string().max(200).nullable().optional(),
  subheadline: z.string().max(400).nullable().optional(),
  bodyHtml: z.string().max(10_000).nullable().optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  primaryCtaLabel: z.string().max(120).nullable().optional(),
  primaryColor: z.string().regex(HEX_COLOR).nullable().optional(),
  consentText: z.string().max(2000).nullable().optional(),
  successMessage: z.string().max(1000).nullable().optional(),
  fields: z.array(PopupFieldSchema).max(10).default([]),
  trigger: FormTriggerSchema.default('time_on_page'),
  triggerDelaySeconds: z.coerce.number().int().min(0).max(600).default(5),
  displayFrequency: FormDisplayFrequencySchema.default('once_per_session'),
  pageMatchRules: z.array(PageMatchRuleSchema).max(20).default([]),
  displayPriority: z.coerce.number().int().min(0).max(1000).default(0),
  showCap: z.coerce.number().int().min(1).nullable().optional(),
  submissionCap: z.coerce.number().int().min(1).nullable().optional(),
  marketingListId: z.string().uuid().nullable().optional(),
});

export const CreatePopupSchema = PopupBaseSchema;
export type CreatePopupBody = z.infer<typeof CreatePopupSchema>;

/** Slug is immutable post-create — analytics references it by id, but
 *  operators reference it in URLs we'd rather not break on rename. */
export const UpdatePopupSchema = PopupBaseSchema.partial().extend({
  slug: z.never().optional(),
});
export type UpdatePopupBody = z.infer<typeof UpdatePopupSchema>;

export const PopupSubmissionIngestSchema = z.object({
  /** Public loader includes the popup slug, not the uuid. */
  formSlug: z.string().min(1).max(80),
  email: z.string().email().max(320),
  /** Page where the visitor submitted. URL only — no query string with
   *  PII. The loader strips searchParams before posting. */
  pageUrl: z.string().url().max(2000),
  /** Anonymous device id stored by the loader in localStorage. UUID v7
   *  generated client-side; we trust it but pin it to the visitor row
   *  per (tenant, anonymousId). */
  anonymousId: z.string().min(8).max(64),
  /** Honeypot field. Bots fill it; real users don't (it's hidden via
   *  CSS). Non-empty value = silently dropped on the server. */
  honeypot: z.string().max(500).optional(),
  /** Additional payload fields (eg. first_name when the popup asks). */
  extra: z.record(z.string(), z.string().max(2000)).default({}),
});
export type PopupSubmissionIngestBody = z.infer<typeof PopupSubmissionIngestSchema>;

export interface PopupSummary {
  id: string;
  slug: string;
  name: string;
  kind: 'popup' | 'inline' | 'bar';
  status: 'draft' | 'active' | 'paused' | 'archived';
  trigger: 'immediate' | 'time_on_page' | 'scroll_depth' | 'exit_intent';
  trigger_delay_seconds: number;
  display_frequency: 'once_per_session' | 'once_per_visitor' | 'every_visit';
  display_priority: number;
  page_match_rules: { kind: 'equals' | 'starts_with' | 'regex'; value: string }[];
  show_count: number;
  submission_count: number;
  last_submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PopupDetail extends PopupSummary {
  headline: string | null;
  subheadline: string | null;
  body_html: string | null;
  image_url: string | null;
  primary_cta_label: string | null;
  primary_color: string | null;
  consent_text: string | null;
  success_message: string | null;
  fields: { name: string; label: string; type: string; required: boolean; placeholder?: string }[];
  show_cap: number | null;
  submission_cap: number | null;
  marketing_list_id: string | null;
}

/** Shape returned to the public loader. Strict denylist on internal
 *  state so the response carries only what the script needs to render. */
export interface LoaderPopup {
  id: string;
  slug: string;
  kind: 'popup' | 'inline' | 'bar';
  trigger: 'immediate' | 'time_on_page' | 'scroll_depth' | 'exit_intent';
  trigger_delay_seconds: number;
  display_frequency: 'once_per_session' | 'once_per_visitor' | 'every_visit';
  display_priority: number;
  headline: string | null;
  subheadline: string | null;
  body_html: string | null;
  image_url: string | null;
  primary_cta_label: string | null;
  primary_color: string | null;
  consent_text: string | null;
  success_message: string | null;
  fields: { name: string; label: string; type: string; required: boolean; placeholder?: string }[];
}

export interface SubmissionRow {
  id: string;
  form_id: string;
  form_slug: string;
  form_name: string;
  email: string | null;
  page_url: string | null;
  payload: Record<string, unknown>;
  submitted_at: string;
}

export interface SubmissionsPage {
  data: SubmissionRow[];
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
}
