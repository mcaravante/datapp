import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import { SortableHeader } from '@/components/sortable-header';
import { buildListHref, parseSort, type SortState } from '@/lib/list-state';
import { formatBuenosAires } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { AdminRole, UsersListResponse, UserSummary } from '@/lib/types';

export const metadata = { title: 'Datapp · Users' };

const ALLOWED: readonly AdminRole[] = ['super_admin', 'admin'];

const SORT_FIELDS = ['name', 'email', 'role', 'last_login_at', 'created_at'] as const;
type SortField = (typeof SORT_FIELDS)[number];
const DEFAULT_SORT: SortState<SortField> = { field: 'created_at', dir: 'desc' };

const ROLE_ORDER: Record<AdminRole, number> = {
  super_admin: 0,
  admin: 1,
  analyst: 2,
  viewer: 3,
};

const ROLE_FILTERS: readonly (AdminRole | 'all')[] = [
  'all',
  'super_admin',
  'admin',
  'analyst',
  'viewer',
];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function compareUsers(a: UserSummary, b: UserSummary, field: SortField): number {
  switch (field) {
    case 'name':
      return normalize(a.name).localeCompare(normalize(b.name));
    case 'email':
      return a.email.localeCompare(b.email);
    case 'role':
      return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    case 'last_login_at': {
      const aTs = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
      const bTs = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
      return aTs - bTs;
    }
    case 'created_at':
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }
}

function applyUserFilters(
  rows: UserSummary[],
  q: string,
  role: AdminRole | null,
): UserSummary[] {
  const needle = normalize(q.trim());
  return rows.filter((u) => {
    if (role && u.role !== role) return false;
    if (
      needle &&
      !normalize(u.name).includes(needle) &&
      !u.email.toLowerCase().includes(needle)
    ) {
      return false;
    }
    return true;
  });
}

interface PageProps {
  searchParams: Promise<{ q?: string; role?: string; sort?: string; dir?: string }>;
}

export default async function UsersListPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user?.role ?? 'viewer') as AdminRole;
  if (!ALLOWED.includes(role)) redirect('/');

  const sp = await searchParams;
  const q = sp.q ?? '';
  const roleFilter =
    sp.role && (ALLOWED as readonly string[]).concat(['analyst', 'viewer']).includes(sp.role)
      ? (sp.role as AdminRole)
      : null;
  const sort = parseSort<SortField>(sp, SORT_FIELDS, DEFAULT_SORT);

  const { data: users } = await apiFetch<UsersListResponse>('/v1/admin/users');

  const filtered = applyUserFilters(users, q, roleFilter);
  const sorted = [...filtered].sort((a, b) => {
    const cmp = compareUsers(a, b, sort.field);
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const currentParams: Record<string, string | string[] | undefined> = {
    q,
    role: roleFilter ?? undefined,
    sort: sort.field === DEFAULT_SORT.field ? undefined : sort.field,
    dir: sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir ? undefined : sort.dir,
  };

  const buildFilterHref = (overrides: Record<string, string | undefined>): string =>
    buildListHref('/users', currentParams, overrides);

  const t = await getTranslations('users');
  const tCommon = await getTranslations('common');
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

      <form className="flex flex-wrap items-center gap-2" action="/users">
        {roleFilter && <input type="hidden" name="role" value={roleFilter} />}
        {sort.field !== DEFAULT_SORT.field && <input type="hidden" name="sort" value={sort.field} />}
        {!(sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir) && (
          <input type="hidden" name="dir" value={sort.dir} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t('searchPlaceholder')}
          className="block w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          {tCommon('search')}
        </button>
        {(q || roleFilter) && (
          <Link
            href={buildFilterHref({ q: undefined, role: undefined })}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            {tCommon('clear')}
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('roleFilterLabel')}</span>
        {ROLE_FILTERS.map((r) => {
          const active = (r === 'all' && !roleFilter) || r === roleFilter;
          return (
            <Link
              key={r}
              href={buildFilterHref({ role: r === 'all' ? undefined : r })}
              className={
                active
                  ? 'rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-md border border-border bg-card px-3 py-1 text-xs text-foreground transition hover:bg-muted'
              }
            >
              {r === 'all' ? t('roleFilterAll') : tRoles(r)}
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-4 py-3">
                <SortableHeader
                  field="name"
                  current={sort}
                  defaultDir="asc"
                  basePath="/users"
                  currentParams={currentParams}
                >
                  {t('table.name')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="email"
                  current={sort}
                  defaultDir="asc"
                  basePath="/users"
                  currentParams={currentParams}
                >
                  {t('table.email')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="role"
                  current={sort}
                  defaultDir="asc"
                  basePath="/users"
                  currentParams={currentParams}
                >
                  {t('table.role')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="last_login_at"
                  current={sort}
                  basePath="/users"
                  currentParams={currentParams}
                >
                  {t('table.lastLogin')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="created_at"
                  current={sort}
                  basePath="/users"
                  currentParams={currentParams}
                >
                  {t('table.created')}
                </SortableHeader>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {sorted.map((u) => (
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
          <SignInBadge hasPassword={user.has_password} />
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

function SignInBadge({ hasPassword }: { hasPassword: boolean }): React.ReactElement {
  return (
    <span
      className="inline-flex items-center rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
      title={hasPassword ? 'email + Google' : 'Google only'}
    >
      {hasPassword ? 'pw + Google' : 'Google only'}
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
