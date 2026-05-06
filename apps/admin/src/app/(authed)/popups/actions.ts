'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import type {
  PopupDetail,
  PopupDisplayFrequency,
  PopupField,
  PopupKind,
  PopupPageMatchRule,
  PopupStatus,
  PopupTrigger,
} from '@/lib/types';

export interface PopupFormInput {
  slug?: string;
  name: string;
  kind: PopupKind;
  status: PopupStatus;
  headline?: string | null;
  subheadline?: string | null;
  bodyHtml?: string | null;
  imageUrl?: string | null;
  primaryCtaLabel?: string | null;
  primaryColor?: string | null;
  consentText?: string | null;
  successMessage?: string | null;
  fields: PopupField[];
  trigger: PopupTrigger;
  triggerDelaySeconds: number;
  displayFrequency: PopupDisplayFrequency;
  pageMatchRules: PopupPageMatchRule[];
  displayPriority: number;
  showCap?: number | null;
  submissionCap?: number | null;
}

export async function createPopup(input: PopupFormInput): Promise<PopupDetail> {
  const created = await apiFetch<PopupDetail>('/v1/admin/popups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/popups');
  redirect(`/popups/${created.id}`);
}

export async function updatePopup(
  id: string,
  input: Omit<PopupFormInput, 'slug'>,
): Promise<PopupDetail> {
  const updated = await apiFetch<PopupDetail>(`/v1/admin/popups/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/popups');
  revalidatePath(`/popups/${id}`);
  return updated;
}

export async function archivePopup(id: string): Promise<void> {
  await apiFetch<undefined>(`/v1/admin/popups/${id}`, { method: 'DELETE' });
  revalidatePath('/popups');
  redirect('/popups');
}
