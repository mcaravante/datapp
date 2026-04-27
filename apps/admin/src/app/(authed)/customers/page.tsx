import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import type { CustomerListPage } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Customers' };

interface PageProps {
  searchParams: Promise<{ q?: string; cursor?: string; limit?: string }>;
}

export default async function CustomersListPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { q = '', cursor = '', limit = '50' } = await searchParams;

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit);

  const page = await apiFetch<CustomerListPage>(`/v1/admin/customers?${params.toString()}`);

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `/customers?${qs}` : '/customers';
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">{page.data.length} on this page.</p>
        </div>
      </div>

      <form className="flex gap-2" action="/customers">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search email, first name, last name…"
            className="block w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          Search
        </button>
        {q && (
          <Link
            href="/customers"
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Group</th>
              <th className="px-4 py-3 font-semibold">Magento ID</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {page.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No customers match.
                </td>
              </tr>
            )}
            {page.data.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${c.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    {c.email}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground/80">
                  {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.customer_group ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {c.magento_customer_id}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.magento_updated_at ? formatBuenosAires(c.magento_updated_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Cursor pagination — sorted by Magento updated_at desc.
        </span>
        {page.next_cursor && (
          <Link
            href={buildHref({ cursor: page.next_cursor })}
            className="rounded-md border border-border bg-card px-4 py-2 text-foreground transition hover:bg-muted"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }): React.ReactElement {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

const FORMATTER = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatBuenosAires(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return FORMATTER.format(d);
}
