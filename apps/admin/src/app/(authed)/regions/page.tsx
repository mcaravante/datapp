import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { formatCurrencyArs, formatNumber } from '@/lib/format';
import type { GeoResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Regions' };

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

const PRESETS = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
] as const;

function rangeFromPreset(presetId: string): { from: string; to: string } {
  const to = new Date();
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[3];
  if (!preset || preset.days === null) {
    return { from: '2010-01-01T00:00:00.000Z', to: to.toISOString() };
  }
  const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async function RegionsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { window: windowParam = 'all' } = await searchParams;
  const range = rangeFromPreset(windowParam);
  const params = new URLSearchParams({ from: range.from, to: range.to, country: 'AR' });
  const result = await apiFetch<GeoResponse>(`/v1/admin/analytics/geo?${params.toString()}`);

  const maxRevenue = result.data.reduce((max, row) => Math.max(max, Number(row.revenue)), 0);
  const maxCustomers = result.data.reduce((max, row) => Math.max(max, row.customers), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Regions · Argentina
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customers + orders + revenue per INDEC province. Customer counts are snapshot
            (independent of date range); buyers / orders / revenue are window-bound.
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
          {PRESETS.map((p) => {
            const active = windowParam === p.id;
            return (
              <Link
                key={p.id}
                href={`/regions?window=${p.id}`}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Tile label="Customers" value={formatNumber(result.totals.customers)} />
        <Tile label="Buyers in window" value={formatNumber(result.totals.buyers)} />
        <Tile label="Orders in window" value={formatNumber(result.totals.orders)} />
        <Tile label="Revenue" value={formatCurrencyArs(result.totals.revenue)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-3 text-right font-semibold">#</th>
              <th className="w-12 px-3 py-3 font-semibold">Code</th>
              <th className="px-3 py-3 font-semibold">Province</th>
              <th className="px-3 py-3 text-right font-semibold">Customers</th>
              <th className="px-3 py-3 font-semibold">Customer share</th>
              <th className="px-3 py-3 text-right font-semibold">Buyers</th>
              <th className="px-3 py-3 text-right font-semibold">Orders</th>
              <th className="px-3 py-3 text-right font-semibold">Revenue</th>
              <th className="px-3 py-3 font-semibold">Revenue share</th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                  No regions configured.
                </td>
              </tr>
            )}
            {result.data.map((row, i) => (
              <tr
                key={row.region_id}
                className="border-b border-border last:border-0 transition hover:bg-muted/30"
              >
                <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">
                  {i + 1}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                  {row.region_code}
                </td>
                <td className="px-3 py-3 text-foreground">{row.region_name}</td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground/80">
                  {formatNumber(row.customers)}
                </td>
                <td className="px-3 py-3">
                  <Bar value={row.customers} max={maxCustomers} tone="primary" />
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatNumber(row.buyers)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatNumber(row.orders)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-foreground">
                  {formatCurrencyArs(row.revenue)}
                </td>
                <td className="px-3 py-3">
                  <Bar value={Number(row.revenue)} max={maxRevenue} tone="success" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.unmatched.length > 0 && (
        <details className="rounded-lg border border-border bg-card p-5 shadow-card">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Unmatched regions ({result.unmatched.length})
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            Magento sent us these region values that didn&apos;t match any row in the INDEC table.
            They&apos;re audit-only — fix the matcher in the region resolver if any of these
            represent a real province.
          </p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Region (raw)</th>
                <th className="px-3 py-2 font-semibold">City</th>
                <th className="px-3 py-2 font-semibold">Postal</th>
                <th className="px-3 py-2 text-right font-semibold">Occurrences</th>
              </tr>
            </thead>
            <tbody>
              {result.unmatched.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground">{row.region_raw ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.city_raw ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {row.postal_code ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground/80">
                    {formatNumber(row.occurrences)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card transition hover:shadow-elevated">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

interface BarProps {
  value: number;
  max: number;
  tone: 'primary' | 'success';
}

function Bar({ value, max, tone }: BarProps): React.ReactElement {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill = tone === 'primary' ? 'bg-primary' : 'bg-success';
  return (
    <div className="flex h-2 w-32 items-center overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full ${fill} transition-all`}
        style={{ width: `${pct.toFixed(1)}%` }}
      />
    </div>
  );
}
