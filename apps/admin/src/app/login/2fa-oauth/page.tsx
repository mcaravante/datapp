import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { signIn, auth } from '@/auth';
import { LocaleToggle } from '@/components/locale-toggle';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata = { title: 'Datapp · 2FA challenge' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ ct?: string; email?: string; error?: string; recovery?: string }>;
}

export default async function OAuthTwoFactorPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (session) redirect('/');

  const sp = await searchParams;
  const challenge = sp.ct ?? '';
  const email = sp.email ?? '';
  if (!challenge || !email) {
    redirect('/login');
  }

  const error = sp.error;
  const recoveryFlag = sp.recovery === '1';
  const t = await getTranslations('login');

  async function submitChallenge(formData: FormData): Promise<void> {
    'use server';
    const ct = String(formData.get('challenge_token') ?? '');
    const em = String(formData.get('email') ?? '');
    const totpRaw = String(formData.get('totp') ?? '').trim();
    const recoveryRaw = String(formData.get('recovery_code') ?? '').trim();

    const baseQs = new URLSearchParams({ ct, email: em });

    try {
      await signIn('oauth-2fa', {
        challenge_token: ct,
        ...(totpRaw ? { totp: totpRaw } : {}),
        ...(recoveryRaw ? { recovery_code: recoveryRaw } : {}),
        redirectTo: '/',
      });
    } catch (err) {
      if (err instanceof AuthError) {
        const code = (err as { code?: string }).code;
        const recoveryQs = recoveryRaw ? '&recovery=1' : '';
        if (code === '2fa_required') {
          // Wrong TOTP — same challenge token still valid until expiry.
          redirect(`/login/2fa-oauth?${baseQs.toString()}&error=invalid${recoveryQs}`);
        }
        if (code === 'rate_limited' || code === 'account_locked') {
          redirect(`/login?error=${code}`);
        }
        // Challenge expired or otherwise unusable — back to /login.
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
        action={submitChallenge}
        className="relative w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-8 shadow-card"
      >
        <input type="hidden" name="challenge_token" value={challenge} />
        <input type="hidden" name="email" value={email} />

        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t('oauthTwoFactorTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('oauthTwoFactorSubtitle', { email })}
          </p>
        </div>

        {error === 'invalid' && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {recoveryFlag ? t('errorInvalidRecovery') : t('errorInvalidTotp')}
          </div>
        )}

        {!recoveryFlag && (
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
              href={`/login/2fa-oauth?ct=${encodeURIComponent(challenge)}&email=${encodeURIComponent(email)}&recovery=1`}
              className="block text-xs text-muted-foreground transition hover:text-foreground"
            >
              {t('useRecoveryCode')}
            </Link>
          </div>
        )}

        {recoveryFlag && (
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
              href={`/login/2fa-oauth?ct=${encodeURIComponent(challenge)}&email=${encodeURIComponent(email)}`}
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
          {t('oauthTwoFactorSubmit')}
        </button>

        <div className="text-center">
          <Link
            href="/login"
            className="text-xs text-muted-foreground transition hover:text-foreground"
          >
            {t('oauthBackToLogin')}
          </Link>
        </div>
      </form>
    </main>
  );
}
