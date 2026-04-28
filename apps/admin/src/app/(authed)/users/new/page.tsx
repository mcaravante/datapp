import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { createUser } from '../actions';
import type { AdminRole } from '@/lib/types';

export const metadata = { title: 'CDP Admin · New user' };

const ROLES: readonly AdminRole[] = ['super_admin', 'admin', 'analyst', 'viewer'];
const ALLOWED: readonly AdminRole[] = ['super_admin', 'admin'];

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewUserPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');
  const currentRole = (session.user?.role ?? 'viewer') as AdminRole;
  if (!ALLOWED.includes(currentRole)) redirect('/');

  const sp = await searchParams;
  const t = await getTranslations('users');
  const tCommon = await getTranslations('common');

  async function submit(formData: FormData): Promise<void> {
    'use server';
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const name = String(formData.get('name') ?? '').trim();
    const role = String(formData.get('role') ?? '') as AdminRole;
    const password = String(formData.get('password') ?? '');

    if (!email || !name || !role || !password) {
      redirect('/users/new?error=missing');
    }

    try {
      const created = await createUser({ email, name, role, password });
      redirect(`/users/${created.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (msg.includes('NEXT_REDIRECT')) throw err;
      redirect(`/users/new?error=${encodeURIComponent(msg).slice(0, 200)}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <Link
          href="/users"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          {t('form.back')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {t('form.createTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('form.createSubtitle')}</p>
      </div>

      {sp.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {sp.error === 'missing'
            ? t('form.missingFields')
            : t('form.errorPrefix', { message: decodeURIComponent(sp.error) })}
        </p>
      )}

      <form
        action={submit}
        className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-card"
      >
        <Field id="name" label={t('form.name')} required>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            placeholder={t('form.namePlaceholder')}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <Field id="email" label={t('form.email')} required>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={254}
            placeholder={t('form.emailPlaceholder')}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <RoleField currentRole={currentRole} />

        <Field id="password" label={t('form.password')} required>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            placeholder={t('form.passwordPlaceholder')}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
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
            {t('form.submitCreate')}
          </button>
        </div>
      </form>
    </div>
  );
}

async function RoleField({ currentRole }: { currentRole: AdminRole }): Promise<React.ReactElement> {
  const t = await getTranslations('users');
  const tRoles = await getTranslations('users.roles');
  const tRoleHints = await getTranslations('users.roleHints');
  // Only super_admins can grant the super_admin role.
  const assignable = ROLES.filter(
    (r) => r !== 'super_admin' || currentRole === 'super_admin',
  );
  return (
    <Field id="role" label={t('form.role')} required>
      <select
        id="role"
        name="role"
        required
        defaultValue="viewer"
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        {assignable.map((r) => (
          <option key={r} value={r}>
            {tRoles(r)} — {tRoleHints(r)}
          </option>
        ))}
      </select>
    </Field>
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
