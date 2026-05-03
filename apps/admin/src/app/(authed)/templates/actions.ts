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
