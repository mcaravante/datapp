'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import type { AdminRole, UserSummary } from '@/lib/types';

interface CreateUserInput {
  email: string;
  name: string;
  role: AdminRole;
  /** Optional. Omit to create a Google-only user (no local credentials). */
  password?: string;
}

export async function createUser(input: CreateUserInput): Promise<UserSummary> {
  const user = await apiFetch<UserSummary>('/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/users');
  return user;
}

interface UpdateUserInput {
  name?: string;
  role?: AdminRole;
  password?: string;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserSummary> {
  const user = await apiFetch<UserSummary>(`/v1/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/users');
  revalidatePath(`/users/${id}`);
  return user;
}

export async function deleteUser(id: string): Promise<void> {
  await apiFetch<undefined>(`/v1/admin/users/${id}`, { method: 'DELETE' });
  revalidatePath('/users');
  redirect('/users');
}
