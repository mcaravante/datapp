'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import type {
  EmailTemplateChannel,
  EmailTemplateDetail,
  EmailTemplateFormat,
  EmailTemplatePreviewResponse,
} from '@/lib/types';

export interface CreateTemplateInput {
  channel: EmailTemplateChannel;
  slug: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  format: EmailTemplateFormat;
  isActive: boolean;
  variables?: { required?: string[]; description?: string };
}

export async function createTemplate(input: CreateTemplateInput): Promise<EmailTemplateDetail> {
  const created = await apiFetch<EmailTemplateDetail>('/v1/admin/email-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/templates');
  redirect(`/templates/${created.id}`);
}

export interface UpdateTemplateInput {
  channel?: EmailTemplateChannel;
  name?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string | null;
  format?: EmailTemplateFormat;
  isActive?: boolean;
  variables?: { required?: string[]; description?: string };
}

export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
): Promise<EmailTemplateDetail> {
  const updated = await apiFetch<EmailTemplateDetail>(`/v1/admin/email-templates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/templates');
  revalidatePath(`/templates/${id}`);
  return updated;
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch<undefined>(`/v1/admin/email-templates/${id}`, { method: 'DELETE' });
  revalidatePath('/templates');
  redirect('/templates');
}

export async function previewTemplate(
  id: string,
  variables: Record<string, unknown>,
): Promise<EmailTemplatePreviewResponse> {
  return apiFetch<EmailTemplatePreviewResponse>(`/v1/admin/email-templates/${id}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variables }),
  });
}

export type SendTestResult =
  | { status: 'sent'; messageId: string }
  | { status: 'suppressed'; reason: string; message: string }
  | { status: 'failed'; message: string };

/**
 * Send the rendered template to a single email address through Resend
 * (still gated by EmailSuppressionService, so under EMAIL_DRY_RUN the
 * recipient must be in the allowlist). Used by the "Enviar prueba"
 * button on /templates/[id] so operators don't have to wait on the
 * abandoned-cart scheduler to validate a render.
 */
export async function sendTestTemplate(
  id: string,
  to: string,
  variables: Record<string, unknown>,
): Promise<SendTestResult> {
  return apiFetch<SendTestResult>(`/v1/admin/email-templates/${id}/send-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, variables }),
  });
}
