import Link from 'next/link';
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
  searchParams: Promise<{ error?: string; email?: string; recovery?: string }>;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (session) redirect('/');

  const { error, email: prefillEmail, recovery: recoveryFlag } = await searchParams;
  const needs2fa = error === '2fa';
  const rateLimited = error === 'rate_limited';
  const accountLocked = error === 'account_locked';
  const oauthNotAuthorized = error === 'oauth_not_authorized';
  const useRecoveryCode = needs2fa && recoveryFlag === '1';
  const googleEnabled = process.env['AUTH_GOOGLE_ID']?.length;
  const t = await getTranslations('login');

  async function loginAction(formData: FormData): Promise<void> {
    'use server';
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const totpRaw = String(formData.get('totp') ?? '').trim();
    const recoveryRaw = String(formData.get('recovery_code') ?? '').trim();
    try {
      await signIn('credentials', {
        email,
        password,
        ...(totpRaw ? { totp: totpRaw } : {}),
        ...(recoveryRaw ? { recovery_code: recoveryRaw } : {}),
        redirectTo: '/',
      });
    } catch (err) {
      if (err instanceof AuthError) {
        // CredentialsSignin from a 2fa_required / rate-limit throw
        // bubbles up with `code` on the cause — preserve the email so
        // the user doesn't have to retype it on the second pass.
        const code = (err as { code?: string }).code;
        const recoveryQs = recoveryRaw ? '&recovery=1' : '';
        if (code === '2fa_required') {
          redirect(`/login?error=2fa&email=${encodeURIComponent(email)}${recoveryQs}`);
        }
        if (code === 'rate_limited') {
          redirect(`/login?error=rate_limited&email=${encodeURIComponent(email)}`);
        }
        if (code === 'account_locked') {
          redirect(`/login?error=account_locked&email=${encodeURIComponent(email)}`);
        }
        redirect('/login?error=invalid');
      }
      throw err;
    }
  }

  async function googleSignInAction(): Promise<void> {
    'use server';
    try {
      await signIn('google', { redirectTo: '/' });
    } catch (err) {
      if (err instanceof AuthError) {
        const code = (err as { code?: string }).code;
        if (code === 'oauth_not_authorized') {
          redirect('/login?error=oauth_not_authorized');
        }
        if (code === 'rate_limited') {
          redirect('/login?error=rate_limited');
        }
        if (code === 'account_locked') {
          redirect('/login?error=account_locked');
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

      <div className="relative w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-8 shadow-card">
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

        {error && !needs2fa && !rateLimited && !accountLocked && !oauthNotAuthorized && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t('errorInvalid')}
          </div>
        )}
        {oauthNotAuthorized && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t('errorOauthNotAuthorized')}
          </div>
        )}
        {rateLimited && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t('errorRateLimited')}
          </div>
        )}
        {accountLocked && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t('errorLocked')}
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

        {googleEnabled && !needs2fa && (
          <>
            <form action={googleSignInAction}>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                <GoogleLogo className="h-4 w-4" />
                {t('continueWithGoogle')}
              </button>
            </form>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>{t('or')}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form action={loginAction} className="space-y-5">
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

        {needs2fa && !useRecoveryCode && (
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
            <Link
              href={`/login?error=2fa&recovery=1&email=${encodeURIComponent(prefillEmail ?? '')}`}
              className="block text-xs text-muted-foreground transition hover:text-foreground"
            >
              {t('useRecoveryCode')}
            </Link>
          </div>
        )}

        {useRecoveryCode && (
          <div className="space-y-1.5">
            <label htmlFor="recovery_code" className="block text-sm font-medium text-foreground">
              {t('recoveryCodeLabel')}
            </label>
            <input
              id="recovery_code"
              name="recovery_code"
              type="text"
              required
              maxLength={20}
              autoFocus
              placeholder={t('recoveryCodePlaceholder')}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-base tracking-[0.2em] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="text-xs text-muted-foreground">{t('recoveryCodeHint')}</p>
            <Link
              href={`/login?error=2fa&email=${encodeURIComponent(prefillEmail ?? '')}`}
              className="block text-xs text-muted-foreground transition hover:text-foreground"
            >
              {t('useTotpInstead')}
            </Link>
          </div>
        )}

        <button
          type="submit"
          className="block w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          {t('submit')}
        </button>

        <div className="text-center">
          <Link
            href="/forgot"
            className="text-xs text-muted-foreground transition hover:text-foreground"
          >
            {t('forgotLink')}
          </Link>
        </div>
        </form>
      </div>
    </main>
  );
}

function GoogleLogo({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18a10.99 10.99 0 0 0 0 9.86l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}
