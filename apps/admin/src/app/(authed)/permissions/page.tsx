import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import { PermissionsMatrix } from '@/components/permissions-matrix';
import type { AdminRole, PermissionsResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Permissions' };

const ALLOWED: readonly AdminRole[] = ['super_admin', 'admin'];

export default async function PermissionsPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user?.role ?? 'viewer') as AdminRole;
  if (!ALLOWED.includes(role)) redirect('/');

  const data = await apiFetch<PermissionsResponse>('/v1/admin/permissions');

  const t = await getTranslations('permissions');
  const tUsers = await getTranslations('users.roles');

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('subtitle', {
            analystRole: tUsers('analyst'),
            viewerRole: tUsers('viewer'),
            adminRole: tUsers('admin'),
            superAdminRole: tUsers('super_admin'),
          })}
        </p>
      </div>

      <PermissionsMatrix initial={data} />

      <p className="text-xs text-muted-foreground">
        {t('alwaysVisible', {
          adminRole: tUsers('admin'),
          superAdminRole: tUsers('super_admin'),
        })}
      </p>
    </div>
  );
}
