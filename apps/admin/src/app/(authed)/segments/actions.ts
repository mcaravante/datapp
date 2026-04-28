'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import type { SegmentDefinition, SegmentSummary } from '@/lib/types';

interface CreateSegmentInput {
  name: string;
  description?: string;
  definition: SegmentDefinition;
}

export async function createSegment(input: CreateSegmentInput): Promise<SegmentSummary> {
  const segment = await apiFetch<SegmentSummary>('/v1/admin/segments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/segments');
  return segment;
}

export async function refreshSegment(id: string): Promise<void> {
  await apiFetch<SegmentSummary>(`/v1/admin/segments/${id}/refresh`, { method: 'POST' });
  revalidatePath('/segments');
  revalidatePath(`/segments/${id}`);
}

export async function deleteSegment(id: string): Promise<void> {
  await apiFetch<undefined>(`/v1/admin/segments/${id}`, { method: 'DELETE' });
  revalidatePath('/segments');
  redirect('/segments');
}
