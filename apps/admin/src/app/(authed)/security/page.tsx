import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import { TwoFactorPanel } from '@/components/two-factor-panel';
import type { MeResponse, RecoveryCodeCount } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Security' };

interface PageProps {
  searchParams: Promise<{ require?: string }>;
}

export default async function SecurityPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');

  const me = await apiFetch<MeResponse>('/v1/auth/me');
  const recoveryRemaining = me.has_2fa
    ? await apiFetch<RecoveryCodeCount>('/v1/auth/2fa/recovery-codes/count').then(
        (r) => r.remaining,
      )
    : 0;
  const sp = await searchParams;
  const required = sp.require === '1' || me.must_enable_2fa;
  const t = await getTranslations('security');

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      {required && !me.has_2fa && (
        <div
          role="alert"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          {t('enforcementBanner')}
        </div>
      )}
      <TwoFactorPanel
        initialEnabled={me.has_2fa}
        initialRecoveryRemaining={recoveryRemaining}
      />
    </div>
  );
}
