'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-client';
import type { SuppressionRow } from '@/lib/types';

export interface CreateSuppressionInput {
  email: string;
  reason?: 'manual' | 'unsubscribed' | 'invalid_address';
  notes?: string;
}

export async function createSuppression(input: CreateSuppressionInput): Promise<SuppressionRow> {
  const row = await apiFetch<SuppressionRow>('/v1/admin/email-suppressions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/settings/email-suppression');
  return row;
}

export async function deleteSuppression(id: string): Promise<void> {
  await apiFetch<undefined>(`/v1/admin/email-suppressions/${id}`, { method: 'DELETE' });
  revalidatePath('/settings/email-suppression');
}
