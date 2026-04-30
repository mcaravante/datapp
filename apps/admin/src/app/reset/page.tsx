import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';
import { LocaleToggle } from '@/components/locale-toggle';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata = { title: 'Datapp · Reset password' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ token?: string; error?: string; success?: string }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (session) redirect('/');

  const sp = await searchParams;
  const t = await getTranslations('resetPassword');
  const success = sp.success === '1';
  const token = sp.token ?? '';

  async function submit(formData: FormData): Promise<void> {
    'use server';
    const tokenValue = String(formData.get('token') ?? '');
    const password = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirm') ?? '');

    const tokenQs = `?token=${encodeURIComponent(tokenValue)}`;

    if (!tokenValue) {
      redirect(`/reset${tokenQs}&error=missing_token`);
    }
    if (password !== confirm) {
      redirect(`/reset${tokenQs}&error=mismatch`);
    }
    if (password.length < 12) {
      redirect(`/reset${tokenQs}&error=too_short`);
    }

    const env = getServerEnv();
    const res = await fetch(`${env.APP_URL_API}/v1/auth/password/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenValue, password }),
    });

    if (!res.ok) {
      redirect(`/reset${tokenQs}&error=invalid`);
    }
    redirect('/reset?success=1');
  }

  const errorKey =
    sp.error === 'mismatch'
      ? 'errorMismatch'
      : sp.error === 'too_short'
        ? 'errorTooShort'
        : sp.error === 'missing_token'
          ? 'errorMissingToken'
          : sp.error === 'invalid'
            ? 'errorInvalid'
            : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,hsl(var(--primary)/0.10),transparent_45%),radial-gradient(circle_at_85%_85%,hsl(var(--accent)/0.10),transparent_45%)]"
      />

      <div className="absolute right-6 top-6 flex items-center gap-2">
        <LocaleToggle />
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-8 shadow-card">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {success ? t('successTitle') : t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {success ? t('successBody') : t('subtitle')}
          </p>
        </div>

        {success ? (
          <Link
            href="/login"
            className="block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            {t('goToLogin')}
          </Link>
        ) : (
          <form action={submit} className="space-y-5">
            <input type="hidden" name="token" value={token} />

            {errorKey && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {t(errorKey)}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                {t('password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <p className="text-xs text-muted-foreground">{t('passwordHint')}</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm" className="block text-sm font-medium text-foreground">
                {t('confirm')}
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>

            <button
              type="submit"
              className="block w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
            >
              {t('submit')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
