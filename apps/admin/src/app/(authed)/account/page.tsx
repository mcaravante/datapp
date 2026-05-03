import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { LocaleToggle } from '@/components/locale-toggle';
import { ThemeToggle } from '@/components/theme-toggle';
import type { AdminRole } from '@/lib/types';

export const metadata = { title: 'Datapp · My account' };

export default async function AccountPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');

  const t = await getTranslations('account');
  const tRoles = await getTranslations('users.roles');
  const role = (session.user?.role ?? 'viewer') as AdminRole;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold text-foreground">{t('identity.title')}</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('identity.name')}
            </dt>
            <dd className="mt-1 text-foreground">{session.user?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('identity.email')}
            </dt>
            <dd className="mt-1 text-foreground">{session.user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('identity.role')}
            </dt>
            <dd className="mt-1 text-foreground">{tRoles(role)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('identity.security')}
            </dt>
            <dd className="mt-1">
              <Link href="/security" className="text-primary hover:underline">
                {t('identity.manageSecurity')} →
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold text-foreground">{t('preferences.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('preferences.body')}</p>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">{t('preferences.theme')}</div>
              <div className="text-xs text-muted-foreground">{t('preferences.themeHint')}</div>
            </div>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">{t('preferences.language')}</div>
              <div className="text-xs text-muted-foreground">{t('preferences.languageHint')}</div>
            </div>
            <LocaleToggle />
          </div>
        </div>
      </section>
    </div>
  );
}
