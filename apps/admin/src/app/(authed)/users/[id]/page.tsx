import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatBuenosAires } from '@/lib/format';
import { DeleteUserButton } from '@/components/user-actions';
import { ResetTwoFactorButton } from '@/components/reset-two-factor-button';
import { updateUser } from '../actions';
import type { Locale } from '@/i18n/config';
import type { AdminRole, UserSummary } from '@/lib/types';

export const metadata = { title: 'Datapp · Edit user' };

const ROLES: readonly AdminRole[] = ['super_admin', 'admin', 'analyst', 'viewer'];
const ALLOWED: readonly AdminRole[] = ['super_admin', 'admin'];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}

export default async function EditUserPage({
  params,
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');
  const currentRole = (session.user?.role ?? 'viewer') as AdminRole;
  const currentEmail = (session.user?.email ?? '').toLowerCase();
  if (!ALLOWED.includes(currentRole)) redirect('/');

  const { id } = await params;
  const sp = await searchParams;

  let user: UserSummary;
  try {
    user = await apiFetch<UserSummary>(`/v1/admin/users/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const t = await getTranslations('users');
  const tForm = await getTranslations('users.form');
  const tRoles = await getTranslations('users.roles');
  const tRoleHints = await getTranslations('users.roleHints');
  const tCommon = await getTranslations('common');
  const locale = (await getLocale()) as Locale;

  const isYou = user.email.toLowerCase() === currentEmail;

  // Role assignability:
  //   - non-super_admin admins cannot grant or modify super_admin
  //   - everyone else can pick from the four roles
  const assignable = ROLES.filter((r) => {
    if (r === 'super_admin' && currentRole !== 'super_admin') return false;
    return true;
  });

  async function submit(formData: FormData): Promise<void> {
    'use server';
    const name = String(formData.get('name') ?? '').trim();
    const role = String(formData.get('role') ?? '') as AdminRole;
    const password = String(formData.get('password') ?? '');

    const update: { name?: string; role?: AdminRole; password?: string } = {};
    if (name && name !== user.name) update.name = name;
    if (role && role !== user.role) update.role = role;
    if (password.length > 0) update.password = password;

    if (Object.keys(update).length === 0) {
      redirect(`/users/${id}?saved=1`);
    }

    try {
      await updateUser(id, update);
      redirect(`/users/${id}?saved=1`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (msg.includes('NEXT_REDIRECT')) throw err;
      redirect(`/users/${id}?error=${encodeURIComponent(msg).slice(0, 200)}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <Link
          href="/users"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          {tForm('back')}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {tForm('editTitle')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{tForm('editSubtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {user.has_2fa && (
              <ResetTwoFactorButton
                userId={user.id}
                userEmail={user.email}
                has2fa={user.has_2fa}
              />
            )}
            {!isYou && <DeleteUserButton userId={user.id} userEmail={user.email} />}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-md border border-border bg-card/60 p-4 text-xs sm:grid-cols-3">
        <div>
          <dt className="uppercase tracking-wider text-muted-foreground">
            {t('table.lastLogin')}
          </dt>
          <dd className="mt-0.5 text-foreground">
            {user.last_login_at
              ? formatBuenosAires(user.last_login_at, locale)
              : t('table.neverLoggedIn')}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wider text-muted-foreground">{t('table.created')}</dt>
          <dd className="mt-0.5 text-foreground">{formatBuenosAires(user.created_at, locale)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wider text-muted-foreground">{t('table.role')}</dt>
          <dd className="mt-0.5 text-foreground">{tRoles(user.role)}</dd>
        </div>
      </dl>

      {sp.saved && (
        <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          ✓
        </p>
      )}
      {sp.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {tForm('errorPrefix', { message: decodeURIComponent(sp.error) })}
        </p>
      )}

      <form
        action={submit}
        className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-card"
      >
        <Field id="email" label={tForm('email')}>
          <input
            id="email"
            type="email"
            value={user.email}
            readOnly
            className="block w-full cursor-not-allowed rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">{tForm('emailReadonly')}</p>
        </Field>

        <Field id="name" label={tForm('name')} required>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            defaultValue={user.name}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <Field id="role" label={tForm('role')} required>
          <select
            id="role"
            name="role"
            required
            defaultValue={user.role}
            disabled={isYou}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {assignable.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)} — {tRoleHints(r)}
              </option>
            ))}
          </select>
        </Field>

        <Field id="password" label={tForm('passwordOptional')}>
          <input
            id="password"
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            placeholder={tForm('passwordPlaceholder')}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <p className="text-xs text-muted-foreground">{tForm('passwordHint')}</p>
        </Field>

        <div className="flex justify-end gap-2 border-t border-border pt-5">
          <Link
            href="/users"
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            {tCommon('cancel')}
          </Link>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            {tForm('submitUpdate')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
