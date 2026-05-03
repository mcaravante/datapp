'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import type {
  CouponMode,
  EmailCampaignDetail,
  EmailCampaignStatus,
  EmailCampaignTrigger,
} from '@/lib/types';

export interface StageInput {
  position: number;
  delayHours: number;
  templateId: string;
  couponMode: CouponMode;
  couponStaticCode?: string | null;
  couponDiscount?: string | null;
  couponDiscountType?: 'percent' | 'fixed' | null;
  couponTtlHours?: number | null;
  isActive: boolean;
}

export interface CreateCampaignInput {
  slug: string;
  name: string;
  trigger: EmailCampaignTrigger;
  status: EmailCampaignStatus;
  fromEmail?: string | null;
  replyToEmail?: string | null;
  stages?: StageInput[];
}

export async function createCampaign(input: CreateCampaignInput): Promise<EmailCampaignDetail> {
  const created = await apiFetch<EmailCampaignDetail>('/v1/admin/email-campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/campaigns');
  redirect(`/campaigns/${created.id}`);
}

export interface UpdateCampaignInput {
  name?: string;
  status?: EmailCampaignStatus;
  fromEmail?: string | null;
  replyToEmail?: string | null;
}

export async function updateCampaign(
  id: string,
  input: UpdateCampaignInput,
): Promise<EmailCampaignDetail> {
  const updated = await apiFetch<EmailCampaignDetail>(`/v1/admin/email-campaigns/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${id}`);
  return updated;
}

export async function replaceStages(
  id: string,
  stages: StageInput[],
): Promise<EmailCampaignDetail> {
  const updated = await apiFetch<EmailCampaignDetail>(`/v1/admin/email-campaigns/${id}/stages`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stages }),
  });
  revalidatePath(`/campaigns/${id}`);
  return updated;
}

export async function deleteCampaign(id: string): Promise<void> {
  await apiFetch<undefined>(`/v1/admin/email-campaigns/${id}`, { method: 'DELETE' });
  revalidatePath('/campaigns');
  redirect('/campaigns');
}
