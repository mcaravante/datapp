'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { auth } from '@/auth';
import { apiFetch, ApiError } from '@/lib/api-client';

export interface RevalidateResult {
  ok: boolean;
  durationMs: number;
  tag: string | null;
}

/**
 * Drop every cached server-side fetch for the active tenant. Used by
 * the "Refresh cache" button on /system; the tag is also flipped from
 * the API after a sync run so the next page load fetches fresh data.
 *
 * Tag-per-tenant is the safety boundary: super_admin impersonating
 * another tenant only invalidates that tenant's namespace, never a
 * neighbour's.
 */
export async function revalidateTenantCache(): Promise<RevalidateResult> {
  const startedAt = Date.now();
  const session = await auth();
  const tenantId = session?.user?.tenantId ?? null;
  if (!tenantId) {
    return { ok: false, durationMs: Date.now() - startedAt, tag: null };
  }
  const tag = `tenant:${tenantId}`;
  revalidateTag(tag);
  return { ok: true, durationMs: Date.now() - startedAt, tag };
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Add an email to the tenant's analytics-exclusion list. The exclusion
 * cache is also dropped (server-side, in `ExcludedEmailsService`) and
 * the tenant's HTTP cache is busted here so subsequent reports show
 * fresh numbers without the operator having to hit "Refresh cache".
 */
export async function addExcludedEmail(formData: FormData): Promise<ActionResult> {
  const email = (formData.get('email') ?? '').toString().trim();
  const reason = (formData.get('reason') ?? '').toString().trim();
  if (!email) return { ok: false, error: 'Email is required' };
  try {
    await apiFetch('/v1/admin/analytics/excluded-emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, reason: reason || undefined }),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.body || err.message };
    }
    throw err;
  }
  await revalidateTenantCache();
  revalidatePath('/system');
  return { ok: true };
}

export async function removeExcludedEmail(id: string): Promise<ActionResult> {
  try {
    await apiFetch(`/v1/admin/analytics/excluded-emails/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.body || err.message };
    }
    throw err;
  }
  await revalidateTenantCache();
  revalidatePath('/system');
  return { ok: true };
}

/**
 * Upsert a friendly title for a Magento method code. Used by
 * `/reports` to show "Mercado Pago (Debito|Credito)" instead of the
 * technical `mercadopago_basic`.
 */
export async function upsertMethodLabel(formData: FormData): Promise<ActionResult> {
  const kind = (formData.get('kind') ?? '').toString().trim();
  const code = (formData.get('code') ?? '').toString().trim();
  const title = (formData.get('title') ?? '').toString().trim();
  const mergeIntoCode = (formData.get('mergeIntoCode') ?? '').toString().trim();
  if (!kind || !code || !title) return { ok: false, error: 'kind, code and title are required' };
  try {
    await apiFetch('/v1/admin/analytics/method-labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind,
        code,
        title,
        ...(mergeIntoCode ? { mergeIntoCode } : {}),
      }),
    });
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.body || err.message };
    throw err;
  }
  await revalidateTenantCache();
  revalidatePath('/system');
  return { ok: true };
}

export async function removeMethodLabel(id: string): Promise<ActionResult> {
  try {
    await apiFetch(`/v1/admin/analytics/method-labels/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.body || err.message };
    throw err;
  }
  await revalidateTenantCache();
  revalidatePath('/system');
  return { ok: true };
}
