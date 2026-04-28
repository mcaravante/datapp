'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-client';
import type { AccessMatrix, PermissionsResponse } from '@/lib/types';

export async function savePermissions(matrix: AccessMatrix): Promise<PermissionsResponse> {
  const result = await apiFetch<PermissionsResponse>('/v1/admin/permissions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access: matrix }),
  });
  // Sidebar membership changes — bust the layout cache for everyone
  // who's currently looking at the admin.
  revalidatePath('/', 'layout');
  return result;
}
