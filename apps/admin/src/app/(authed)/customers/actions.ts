'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '@/lib/api-client';
import { revalidateTenantCache } from '../system/actions';

interface ExcludedRow {
  id: string;
  email: string;
}

export interface ToggleExclusionResult {
  ok: boolean;
  excluded: boolean;
  error?: string;
}

/**
 * Toggle a customer email in the analytics-exclusion list. Wraps the
 * existing `/v1/admin/analytics/excluded-emails` endpoints so the
 * /customers row toggle stays a one-click action — adding goes through
 * POST, removing resolves the row id via the existing GET (the API
 * doesn't expose DELETE-by-email and adding one for a one-row lookup
 * isn't worth the surface area).
 *
 * After mutating, revalidate the tenant cache so any analytics page
 * refresh sees the new exclusion immediately.
 */
export async function setCustomerExcluded(
  email: string,
  exclude: boolean,
): Promise<ToggleExclusionResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: false, excluded: false, error: 'email vacío' };
  try {
    if (exclude) {
      try {
        await apiFetch('/v1/admin/analytics/excluded-emails', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: normalized }),
        });
      } catch (err) {
        // 409 = already excluded → treat as success, the UI is asking
        // for the same end state.
        if (!(err instanceof ApiError && err.status === 409)) throw err;
      }
    } else {
      const list = await apiFetch<{ data: ExcludedRow[] }>(
        '/v1/admin/analytics/excluded-emails',
      );
      const row = list.data.find((r) => r.email.toLowerCase() === normalized);
      // Bare-domain rules (`@example.com`) match this email but can't be
      // unticked from a single customer row — surface that to the
      // caller so the UI can explain why "Incluir" did nothing.
      if (!row) {
        return {
          ok: false,
          excluded: true,
          error:
            'El email queda excluido por una regla de dominio (en /system). Quitala desde ahí si querés incluirlo.',
        };
      }
      await apiFetch(`/v1/admin/analytics/excluded-emails/${row.id}`, {
        method: 'DELETE',
      });
    }
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
    return { ok: false, excluded: !exclude, error: message };
  }
  await revalidateTenantCache();
  revalidatePath('/customers');
  revalidatePath('/system');
  return { ok: true, excluded: exclude };
}
