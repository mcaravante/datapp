'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-client';
import type {
  EnrollResponse,
  RecoveryCodesResponse,
  VerifyTwoFactorResponse,
} from '@/lib/types';

export async function enrollTwoFactor(): Promise<EnrollResponse> {
  return apiFetch<EnrollResponse>('/v1/auth/2fa/enroll', { method: 'POST' });
}

export async function verifyTwoFactor(code: string): Promise<VerifyTwoFactorResponse> {
  const result = await apiFetch<VerifyTwoFactorResponse>('/v1/auth/2fa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  revalidatePath('/security');
  return result;
}

export async function disableTwoFactor(password: string): Promise<void> {
  await apiFetch<undefined>('/v1/auth/2fa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  revalidatePath('/security');
}

export async function regenerateRecoveryCodes(password: string): Promise<RecoveryCodesResponse> {
  const result = await apiFetch<RecoveryCodesResponse>(
    '/v1/auth/2fa/recovery-codes/regenerate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    },
  );
  revalidatePath('/security');
  return result;
}
