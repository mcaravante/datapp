'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-client';

export async function adminResetTwoFactor(userId: string): Promise<void> {
  await apiFetch<undefined>(`/v1/admin/users/${userId}/2fa/reset`, { method: 'POST' });
  revalidatePath('/users');
  revalidatePath(`/users/${userId}`);
}
