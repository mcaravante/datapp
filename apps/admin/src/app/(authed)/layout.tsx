import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { apiFetch } from '@/lib/api-client';
import { fetchSectionAccess } from '@/lib/permissions';
import type { AdminRole, MeResponse } from '@/lib/types';

// Every authed page reads cookies via auth(); skip Next's static prerender.
export const dynamic = 'force-dynamic';

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user?.role ?? 'viewer') as AdminRole;

  // Enforce 2FA for privileged roles when the env flag is on. We let the
  // user reach `/security` so they can actually enroll; everything else
  // bounces them there.
  const me = await apiFetch<MeResponse>('/v1/auth/me');
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (me.must_enable_2fa && !pathname.startsWith('/security')) {
    redirect('/security?require=1');
  }

  const access = await fetchSectionAccess(role);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={role} access={access} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar
          user={{ name: session.user?.name, email: session.user?.email }}
          role={role}
        />
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
