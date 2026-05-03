import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import { ExcludedEmailsForm } from './excluded-emails-form';
import { MethodLabelsForm } from './method-labels-form';
import { RefreshCacheButton } from './refresh-button';
import type { ExcludedEmailsResponse, MethodLabelsResponse } from '@/lib/types';

export const metadata = { title: 'Datapp · System' };

export default async function SystemPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');

  const t = await getTranslations('system');
  const [excluded, methodLabels] = await Promise.all([
    apiFetch<ExcludedEmailsResponse>('/v1/admin/analytics/excluded-emails'),
    apiFetch<MethodLabelsResponse>('/v1/admin/analytics/method-labels'),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <section className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold text-foreground">{t('cache.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('cache.body')}</p>
        <RefreshCacheButton />
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold text-foreground">{t('excluded.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('excluded.body')}</p>
        <ExcludedEmailsForm initial={excluded.data} />
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold text-foreground">{t('methodLabels.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('methodLabels.body')}</p>
        <MethodLabelsForm initial={methodLabels.data} />
      </section>
    </div>
  );
}
