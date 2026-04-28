import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { signIn, auth } from '@/auth';
import { LocaleToggle } from '@/components/locale-toggle';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata = { title: 'CDP Admin · Sign in' };

// Reads session cookie via auth(); skip Next's static prerender.
export const dynamic = 'force-dynamic';

interface LoginPageProps {
  searchParams: Promise<{ error?: string; email?: string }>;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (session) redirect('/');

  const { error, email: prefillEmail } = await searchParams;
  const needs2fa = error === '2fa';
  const t = await getTranslations('login');

  async function loginAction(formData: FormData): Promise<void> {
    'use server';
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const totpRaw = String(formData.get('totp') ?? '').trim();
    try {
      await signIn('credentials', {
        email,
        password,
        ...(totpRaw ? { totp: totpRaw } : {}),
        redirectTo: '/',
      });
    } catch (err) {
      if (err instanceof AuthError) {
        // CredentialsSignin from a 2fa_required throw bubbles up with
        // code='2fa_required' on the cause — preserve the email so the
        // user doesn't have to retype it on the second pass.
        const code = (err as { code?: string }).code;
        if (code === '2fa_required') {
          redirect(`/login?error=2fa&email=${encodeURIComponent(email)}`);
        }
        redirect('/login?error=invalid');
      }
      throw err;
    }
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

      <form
        action={loginAction}
        className="relative w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-8 shadow-card"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v18" />
                <path d="M3 12h18" />
                <path d="m5.5 5.5 13 13" />
                <path d="m18.5 5.5-13 13" />
              </svg>
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        {error && !needs2fa && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t('errorInvalid')}
          </div>
        )}
        {needs2fa && (
          <div
            role="alert"
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
          >
            {t('totpRequired')}
          </div>
        )}

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
            defaultValue={prefillEmail ?? ''}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            placeholder={t('emailPlaceholder')}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            {t('password')}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        {needs2fa && (
          <div className="space-y-1.5">
            <label htmlFor="totp" className="block text-sm font-medium text-foreground">
              {t('totpLabel')}
            </label>
            <input
              id="totp"
              name="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={10}
              autoFocus
              placeholder={t('totpPlaceholder')}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-base tracking-[0.4em] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="text-xs text-muted-foreground">{t('totpHint')}</p>
          </div>
        )}

        <button
          type="submit"
          className="block w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          {t('submit')}
        </button>
      </form>
    </main>
  );
}
