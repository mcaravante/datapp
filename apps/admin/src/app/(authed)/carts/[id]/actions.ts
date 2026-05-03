'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-client';
import type { SendRecoveryResponse } from '@/lib/types';

export async function sendRecoveryNow(
  cartId: string,
  stageId: string,
  dispatch: boolean,
): Promise<SendRecoveryResponse> {
  const result = await apiFetch<SendRecoveryResponse>(
    `/v1/admin/carts/abandoned/${cartId}/send-recovery`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, dispatch }),
    },
  );
  revalidatePath(`/carts/${cartId}`);
  return result;
}
