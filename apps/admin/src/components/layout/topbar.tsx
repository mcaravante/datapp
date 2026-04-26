import { signOut } from '@/auth';

interface TopbarProps {
  user: { name?: string | null | undefined; email?: string | null | undefined };
}

export function Topbar({ user }: TopbarProps): React.ReactElement {
  async function logoutAction(): Promise<void> {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  const display = user.name ?? user.email ?? 'Account';

  return (
    <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-6">
      <div className="text-sm text-neutral-500">Tenant: acme</div>
      <form action={logoutAction} className="flex items-center gap-3 text-sm">
        <span className="text-neutral-700">{display}</span>
        <button
          type="submit"
          className="rounded-md border border-neutral-200 px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-100"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
