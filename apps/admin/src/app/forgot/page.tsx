import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';
import { LocaleToggle } from '@/components/locale-toggle';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata = { title: 'Datapp · Forgot password' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ sent?: string; email?: string }>;
}

export default async function ForgotPasswordPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (session) redirect('/');

  const sp = await searchParams;
  const sent = sp.sent === '1';
  const t = await getTranslations('forgotPassword');

  async function submit(formData: FormData): Promise<void> {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    const env = getServerEnv();
    // Always succeed silently — backend returns 204 regardless of email
    // existence. We still ignore network failures so error states never
    // reveal whether an email is on file.
    try {
      await fetch(`${env.APP_URL_API}/v1/auth/password/forgot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* swallow — see comment above */
    }
    redirect(`/forgot?sent=1&email=${encodeURIComponent(email)}`);
  }

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
            {sent ? t('successTitle') : t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {sent ? t('successBody') : t('subtitle')}
          </p>
        </div>

        {!sent && (
          <form action={submit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                {t('email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={sp.email ?? ''}
                placeholder={t('emailPlaceholder')}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
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

        <div className="text-center">
          <Link
            href="/login"
            className="text-xs text-muted-foreground transition hover:text-foreground"
          >
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    </main>
  );
}
