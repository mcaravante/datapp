import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import { TwoFactorPanel } from '@/components/two-factor-panel';
import type { MeResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Security' };

export default async function SecurityPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');

  const me = await apiFetch<MeResponse>('/v1/auth/me');
  const t = await getTranslations('security');

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <TwoFactorPanel initialEnabled={me.has_2fa} />
    </div>
  );
}
