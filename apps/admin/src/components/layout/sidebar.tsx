'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AdminRole, AdminSection } from '@/lib/types';

type NavLabelKey =
  | 'overview'
  | 'customers'
  | 'segments'
  | 'orders'
  | 'carts'
  | 'products'
  | 'coupons'
  | 'regions'
  | 'insights'
  | 'sync'
  | 'users'
  | 'permissions';

interface NavItem {
  href: string;
  labelKey: NavLabelKey;
  icon: (props: { className?: string }) => React.ReactElement;
  match?: (pathname: string) => boolean;
  /** Roles allowed to see this entry. Omit = everyone authenticated. */
  roles?: readonly AdminRole[];
  /**
   * Section key in the role/section access matrix. When present, the
   * entry is only shown if the active user's role has that section
   * allowed (admin and super_admin always see everything).
   */
  section?: AdminSection;
}

const ADMIN_ROLES: readonly AdminRole[] = ['super_admin', 'admin'];

const NAV: readonly NavItem[] = [
  {
    href: '/',
    labelKey: 'overview',
    icon: HomeIcon,
    match: (p) => p === '/',
    section: 'overview',
  },
  {
    href: '/customers',
    labelKey: 'customers',
    icon: UsersIcon,
    match: (p) => p.startsWith('/customers'),
    section: 'customers',
  },
  {
    href: '/segments',
    labelKey: 'segments',
    icon: TagIcon,
    match: (p) => p.startsWith('/segments'),
    section: 'segments',
  },
  {
    href: '/orders',
    labelKey: 'orders',
    icon: ReceiptIcon,
    match: (p) => p.startsWith('/orders'),
    section: 'orders',
  },
  {
    href: '/carts',
    labelKey: 'carts',
    icon: CartIcon,
    match: (p) => p.startsWith('/carts'),
    section: 'carts',
  },
  {
    href: '/products',
    labelKey: 'products',
    icon: BoxIcon,
    match: (p) => p.startsWith('/products'),
    section: 'products',
  },
  {
    href: '/coupons',
    labelKey: 'coupons',
    icon: TicketIcon,
    match: (p) => p.startsWith('/coupons'),
    section: 'coupons',
  },
  {
    href: '/regions',
    labelKey: 'regions',
    icon: MapIcon,
    match: (p) => p.startsWith('/regions'),
    section: 'regions',
  },
  {
    href: '/insights',
    labelKey: 'insights',
    icon: ActivityIcon,
    match: (p) => p.startsWith('/insights'),
    section: 'insights',
  },
  {
    href: '/sync',
    labelKey: 'sync',
    icon: RefreshIcon,
    match: (p) => p.startsWith('/sync'),
    section: 'sync',
  },
  {
    href: '/users',
    labelKey: 'users',
    icon: ShieldIcon,
    match: (p) => p.startsWith('/users'),
    roles: ADMIN_ROLES,
  },
  {
    href: '/permissions',
    labelKey: 'permissions',
    icon: KeyIcon,
    match: (p) => p.startsWith('/permissions'),
    roles: ADMIN_ROLES,
  },
];

interface SidebarProps {
  role: AdminRole;
  /** Section visibility for the active user. Admin/super_admin = all true. */
  access: Record<AdminSection, boolean>;
}

export function Sidebar({ role, access }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const tNav = useTranslations('nav');
  const tApp = useTranslations('app');
  const visibleNav = NAV.filter((item) => {
    if (item.roles && !item.roles.includes(role)) return false;
    if (item.section && access[item.section] !== true) return false;
    return true;
  });

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-soft">
          <SparkIcon className="h-4 w-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {tApp('title')}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {tApp('tagline')}
          </span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-3 text-sm">
        {visibleNav.map((item) => {
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
              <span>{tNav(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
        <span className="font-mono">{tApp('version')}</span>
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

function KeyIcon({ className }: { className?: string }): React.ReactElement {
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
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10 13l10-10" />
      <path d="M16 7l3 3" />
      <path d="M14 9l3 3" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
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

function CartIcon({ className }: { className?: string }): React.ReactElement {
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
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" />
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
