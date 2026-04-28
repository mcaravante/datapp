import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import { formatBuenosAires } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { AdminRole, UsersListResponse, UserSummary } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Users' };

const ALLOWED: readonly AdminRole[] = ['super_admin', 'admin'];

export default async function UsersListPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user?.role ?? 'viewer') as AdminRole;
  if (!ALLOWED.includes(role)) redirect('/');

  const { data: users } = await apiFetch<UsersListResponse>('/v1/admin/users');

  const t = await getTranslations('users');
  const tRoles = await getTranslations('users.roles');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle', {
              adminRole: tRoles('admin'),
              superAdminRole: tRoles('super_admin'),
            })}
          </p>
        </div>
        <Link
          href="/users/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          + {t('newUser')}
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t('table.name')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.email')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.role')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.lastLogin')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.created')}</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                currentEmail={session.user?.email ?? ''}
                locale={locale}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function UserRow({
  user,
  currentEmail,
  locale,
}: {
  user: UserSummary;
  currentEmail: string;
  locale: Locale;
}): Promise<React.ReactElement> {
  const t = await getTranslations('users');
  const tRoles = await getTranslations('users.roles');
  const isYou = user.email.toLowerCase() === currentEmail.toLowerCase();
  return (
    <tr className="border-b border-border last:border-0 transition hover:bg-muted/40">
      <td className="px-4 py-3">
        <Link
          href={`/users/${user.id}`}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {user.name}
        </Link>
        {isYou && (
          <span className="ml-2 inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
            {t('youBadge')}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-foreground/80">
        {user.email}
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <TwoFactorBadge enabled={user.has_2fa} />
        </div>
      </td>
      <td className="px-4 py-3">
        <RoleBadge role={user.role} label={tRoles(user.role)} />
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {user.last_login_at ? formatBuenosAires(user.last_login_at, locale) : t('table.neverLoggedIn')}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {formatBuenosAires(user.created_at, locale)}
      </td>
    </tr>
  );
}

function TwoFactorBadge({ enabled }: { enabled: boolean }): React.ReactElement {
  // Use the `useTranslations` hook indirectly via a small client-side
  // wrapper would need a 'use client' file; since this lives in a
  // server component, we read translations inline through getTranslations.
  // Render a span — caller passes already-translated label via text.
  return (
    <span
      className={
        enabled
          ? 'inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success'
          : 'inline-flex items-center rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground'
      }
    >
      {enabled ? '2FA' : 'no 2FA'}
    </span>
  );
}

export function RoleBadge({ role, label }: { role: AdminRole; label: string }): React.ReactElement {
  const tone =
    role === 'super_admin'
      ? 'bg-destructive/15 text-destructive'
      : role === 'admin'
        ? 'bg-primary/15 text-primary'
        : role === 'analyst'
          ? 'bg-info/15 text-info'
          : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}
