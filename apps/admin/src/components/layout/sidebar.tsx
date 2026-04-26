import Link from 'next/link';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/customers', label: 'Customers' },
  { href: '/sync', label: 'Sync' },
] as const;

export function Sidebar(): React.ReactElement {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <span className="text-sm font-semibold tracking-tight text-neutral-900">CDP Admin</span>
      </div>
      <nav className="flex-1 px-2 py-3 text-sm">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-neutral-700 transition hover:bg-neutral-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
