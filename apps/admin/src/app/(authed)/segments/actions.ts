'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '@/lib/api-client';

export interface SyncResult {
  ok: boolean;
  scanned?: number;
  upserted?: number;
  profileLinks?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Triggers an on-demand sync against Magento's customer-groups endpoint.
 * The same logic also runs every night at 04:32 UTC; this action is the
 * "I just edited the catalog in Magento and don't want to wait" path.
 */
export async function syncCustomerGroups(): Promise<SyncResult> {
  try {
    const result = await apiFetch<{
      scanned: number;
      upserted: number;
      profileLinks: number;
      durationMs: number;
    }>('/v1/admin/customer-groups/sync', { method: 'POST' });
    revalidatePath('/segments');
    return { ok: true, ...result };
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
