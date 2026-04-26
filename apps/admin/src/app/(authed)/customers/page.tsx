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
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Customers</h1>
          <p className="mt-1 text-sm text-neutral-500">{page.data.length} on this page.</p>
        </div>
      </div>

      <form className="flex gap-2" action="/customers">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search email, first name, last name…"
          className="block w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
        >
          Search
        </button>
        {q && (
          <Link
            href="/customers"
            className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 font-medium">Magento ID</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {page.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                  No customers match.
                </td>
              </tr>
            )}
            {page.data.map((c) => (
              <tr
                key={c.id}
                className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${c.id}`}
                    className="text-neutral-900 underline-offset-2 hover:underline"
                  >
                    {c.email}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3 text-neutral-500">{c.customer_group ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                  {c.magento_customer_id}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {c.magento_updated_at ? formatBuenosAires(c.magento_updated_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">
          Cursor pagination — sorted by Magento updated_at desc.
        </span>
        {page.next_cursor && (
          <Link
            href={buildHref({ cursor: page.next_cursor })}
            className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-neutral-700 transition hover:bg-neutral-100"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
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
