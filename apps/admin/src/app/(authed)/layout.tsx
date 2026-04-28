import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { fetchSectionAccess } from '@/lib/permissions';
import type { AdminRole } from '@/lib/types';

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
  const access = await fetchSectionAccess(role);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={role} access={access} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar user={{ name: session.user?.name, email: session.user?.email }} />
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
