'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-client';
import type { BrandingDto } from '@/lib/types';

export interface UpdateBrandingInput {
  logoMediaAssetId?: string | null;
  logoMaxWidthPx?: number;
  primaryColor?: string | null;
  footerHtml?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  unsubscribeText?: string;
}

export async function updateBranding(input: UpdateBrandingInput): Promise<BrandingDto> {
  const updated = await apiFetch<BrandingDto>('/v1/admin/email-branding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/settings/email-branding');
  return updated;
}
