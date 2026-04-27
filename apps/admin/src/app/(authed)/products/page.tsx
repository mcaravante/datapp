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
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1];
  if (!preset || preset.days === null) {
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

  const maxRevenue = result.data.reduce((max, row) => Math.max(max, Number(row.revenue)), 0);
  const maxUnits = result.data.reduce((max, row) => Math.max(max, row.units), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Top products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregated by SKU. Configurable parents are filtered out automatically.
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
          {PRESETS.map((p) => {
            const active = windowParam === p.id;
            return (
              <Link
                key={p.id}
                href={buildHref({ window: p.id })}
                className={
                  active
                    ? 'rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground'
                    : 'rounded px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground'
                }
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Sort by:</span>
        <Link
          href={buildHref({ order_by: 'revenue' })}
          className={
            orderBy === 'revenue'
              ? 'rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
              : 'rounded-md border border-border bg-card px-3 py-1 text-xs text-foreground transition hover:bg-muted'
          }
        >
          Revenue
        </Link>
        <Link
          href={buildHref({ order_by: 'units' })}
          className={
            orderBy === 'units'
              ? 'rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
              : 'rounded-md border border-border bg-card px-3 py-1 text-xs text-foreground transition hover:bg-muted'
          }
        >
          Units
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-3 text-right font-semibold">#</th>
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">SKU</th>
              <th className="px-4 py-3 text-right font-semibold">Units</th>
              <th className="px-4 py-3 text-right font-semibold">Revenue</th>
              <th className="px-4 py-3 text-right font-semibold">Orders</th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No orders in this window.
                </td>
              </tr>
            )}
            {result.data.map((row, i) => {
              const max = orderBy === 'revenue' ? maxRevenue : maxUnits;
              const value = orderBy === 'revenue' ? Number(row.revenue) : row.units;
              const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
              return (
                <tr
                  key={row.sku}
                  className="relative border-b border-border last:border-0 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3 text-foreground">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.sku}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground/80">
                    {formatNumber(row.units)}
                  </td>
                  <td className="relative px-4 py-3 text-right">
                    <div className="relative inline-flex items-center justify-end gap-2">
                      <span className="tabular-nums font-medium text-foreground">
                        {formatCurrencyArs(row.revenue)}
                      </span>
                    </div>
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-1 right-0 hidden rounded-l bg-primary/10 lg:block"
                      style={{ width: `${pct.toFixed(1)}%`, maxWidth: '60%' }}
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {row.orders}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
