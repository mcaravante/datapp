'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  match?: (pathname: string) => boolean;
}

const NAV: readonly NavItem[] = [
  { href: '/', label: 'Overview', icon: HomeIcon, match: (p) => p === '/' },
  {
    href: '/customers',
    label: 'Customers',
    icon: UsersIcon,
    match: (p) => p.startsWith('/customers'),
  },
  {
    href: '/segments',
    label: 'Segments',
    icon: TagIcon,
    match: (p) => p.startsWith('/segments'),
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: ReceiptIcon,
    match: (p) => p.startsWith('/orders'),
  },
  {
    href: '/products',
    label: 'Top products',
    icon: BoxIcon,
    match: (p) => p.startsWith('/products'),
  },
  {
    href: '/coupons',
    label: 'Coupons',
    icon: TicketIcon,
    match: (p) => p.startsWith('/coupons'),
  },
  {
    href: '/regions',
    label: 'Regions',
    icon: MapIcon,
    match: (p) => p.startsWith('/regions'),
  },
  {
    href: '/insights',
    label: 'Insights',
    icon: ActivityIcon,
    match: (p) => p.startsWith('/insights'),
  },
  { href: '/sync', label: 'Sync', icon: RefreshIcon, match: (p) => p.startsWith('/sync') },
];

export function Sidebar(): React.ReactElement {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-soft">
          <SparkIcon className="h-4 w-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-foreground">CDP Admin</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Customer Data Platform
          </span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-3 text-sm">
        {NAV.map((item) => {
          const active = item.match ? item.match(pathname) : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'flex items-center gap-2.5 rounded-md bg-primary/10 px-3 py-2 font-medium text-primary'
                  : 'flex items-center gap-2.5 rounded-md px-3 py-2 text-muted-foreground transition hover:bg-muted hover:text-foreground'
              }
            >
              <item.icon
                className={
                  active ? 'h-4 w-4 text-primary' : 'h-4 w-4 text-muted-foreground'
                }
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
        <span className="font-mono">v0.1 · Phase 1</span>
      </div>
    </aside>
  );
}

function SparkIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="m5.5 5.5 13 13" />
      <path d="m18.5 5.5-13 13" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9.5 12 3l9 6.5V21H3z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.59 13.41 13 21a2 2 0 0 1-2.83 0L3 13.83V4a1 1 0 0 1 1-1h9.83l6.76 6.76a2 2 0 0 1 0 2.83z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

function ReceiptIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-2-2z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </svg>
  );
}

function BoxIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0L4 6.27A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4.04a2 2 0 0 0 2 0l7-4.04A2 2 0 0 0 21 16z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function TicketIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 9V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />
      <path d="M13 5v2" />
      <path d="M13 11v2" />
      <path d="M13 17v2" />
    </svg>
  );
}

function MapIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
