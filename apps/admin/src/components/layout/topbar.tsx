import { getTranslations } from 'next-intl/server';
import { signOut } from '@/auth';
import { LocaleToggle } from '@/components/locale-toggle';
import { ThemeToggle } from '@/components/theme-toggle';

interface TopbarProps {
  user: { name?: string | null | undefined; email?: string | null | undefined };
}

export async function Topbar({ user }: TopbarProps): Promise<React.ReactElement> {
  const t = await getTranslations('app');

  async function logoutAction(): Promise<void> {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  const display = user.name ?? user.email ?? 'Account';
  const initials = (display.match(/[A-Za-z]/g) ?? ['?']).slice(0, 2).join('').toUpperCase();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
          {t('tenant')}: <span className="text-foreground">acme</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <LocaleToggle />
        <ThemeToggle />
        <div className="hidden items-center gap-2 sm:flex">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
            aria-hidden="true"
          >
            {initials}
          </span>
          <span className="text-sm text-muted-foreground">{display}</span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            {t('signOut')}
          </button>
        </form>
      </div>
    </header>
  );
}
