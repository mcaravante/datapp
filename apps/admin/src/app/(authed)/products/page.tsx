import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { formatCurrencyArs, formatNumber } from '@/lib/format';
import type { TopProductsResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Top products' };

interface PageProps {
  searchParams: Promise<{
    window?: string;
    order_by?: 'units' | 'revenue';
    limit?: string;
  }>;
}

const PRESETS = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
] as const;

function rangeFromPreset(presetId: string): { from: string; to: string } {
  const to = new Date();
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1]!;
  if (preset.days === null) {
    return { from: '2010-01-01T00:00:00.000Z', to: to.toISOString() };
  }
  const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async function TopProductsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const {
    window: windowParam = 'all',
    order_by: orderBy = 'revenue',
    limit = '50',
  } = await searchParams;
  const range = rangeFromPreset(windowParam);

  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    order_by: orderBy,
    limit,
  });

  const result = await apiFetch<TopProductsResponse>(
    `/v1/admin/analytics/top-products?${params.toString()}`,
  );

  const buildHref = (overrides: Record<string, string>) => {
    const next = new URLSearchParams({ window: windowParam, order_by: orderBy, limit });
    for (const [k, v] of Object.entries(overrides)) next.set(k, v);
    return `/products?${next.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Top products</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Aggregated by SKU. Configurable parents are filtered out automatically.
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-neutral-200 bg-white p-1 text-xs">
          {PRESETS.map((p) => {
            const active = windowParam === p.id;
            return (
              <Link
                key={p.id}
                href={buildHref({ window: p.id })}
                className={
                  active
                    ? 'rounded bg-neutral-900 px-3 py-1.5 font-medium text-white'
                    : 'rounded px-3 py-1.5 text-neutral-700 transition hover:bg-neutral-100'
                }
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-500">Sort by:</span>
        <Link
          href={buildHref({ order_by: 'revenue' })}
          className={
            orderBy === 'revenue'
              ? 'rounded-md bg-neutral-900 px-3 py-1 text-xs text-white'
              : 'rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-100'
          }
        >
          Revenue
        </Link>
        <Link
          href={buildHref({ order_by: 'units' })}
          className={
            orderBy === 'units'
              ? 'rounded-md bg-neutral-900 px-3 py-1 text-xs text-white'
              : 'rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-100'
          }
        >
          Units
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="w-12 px-4 py-3 text-right font-medium">#</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 text-right font-medium">Units</th>
              <th className="px-4 py-3 text-right font-medium">Revenue</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                  No orders in this window.
                </td>
              </tr>
            )}
            {result.data.map((row, i) => (
              <tr key={row.sku} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 text-right font-mono text-xs text-neutral-400">{i + 1}</td>
                <td className="px-4 py-3 text-neutral-900">{row.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">{row.sku}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {formatNumber(row.units)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">
                  {formatCurrencyArs(row.revenue)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{row.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
