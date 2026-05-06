/**
 * Mirror of the API's LoaderPopup shape (apps/api/src/modules/popups/dto/popups.dto.ts).
 * Kept duplicated here on purpose — the loader is built independently
 * of the api package so we don't drag NestJS / Prisma into the
 * browser bundle. The CI gate that catches drift is the e2e
 * integration test in iter 3 that posts a known popup config and
 * asserts the rendered DOM.
 */
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
  fields: PopupField[];
}

export interface PopupField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
}

export interface LoaderConfig {
  tenantSlug: string;
  apiUrl: string;
}

export interface SubmissionPayload {
  formSlug: string;
  email: string;
  pageUrl: string;
  anonymousId: string;
  honeypot: string;
  extra: Record<string, string>;
}

export interface SubmissionResponse {
  status: 'ok' | 'rate_limited' | 'origin_denied' | 'honeypot' | 'unknown_form';
}
