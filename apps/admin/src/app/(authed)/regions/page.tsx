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
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[3]!;
  if (preset.days === null) {
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

  // For the heatmap intensity: bucket by revenue decile within active rows.
  const maxRevenue = result.data.reduce((max, row) => Math.max(max, Number(row.revenue)), 0);
  const maxCustomers = result.data.reduce((max, row) => Math.max(max, row.customers), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Regions · Argentina
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Customers + orders + revenue per INDEC province. Customer counts are snapshot
            (independent of date range); buyers / orders / revenue are window-bound.
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-neutral-200 bg-white p-1 text-xs">
          {PRESETS.map((p) => {
            const active = windowParam === p.id;
            return (
              <Link
                key={p.id}
                href={`/regions?window=${p.id}`}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Tile label="Customers" value={formatNumber(result.totals.customers)} />
        <Tile label="Buyers in window" value={formatNumber(result.totals.buyers)} />
        <Tile label="Orders in window" value={formatNumber(result.totals.orders)} />
        <Tile label="Revenue" value={formatCurrencyArs(result.totals.revenue)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="w-10 px-3 py-3 text-right font-medium">#</th>
              <th className="w-12 px-3 py-3 font-medium">Code</th>
              <th className="px-3 py-3 font-medium">Province</th>
              <th className="px-3 py-3 text-right font-medium">Customers</th>
              <th className="px-3 py-3 font-medium">Customer share</th>
              <th className="px-3 py-3 text-right font-medium">Buyers</th>
              <th className="px-3 py-3 text-right font-medium">Orders</th>
              <th className="px-3 py-3 text-right font-medium">Revenue</th>
              <th className="px-3 py-3 font-medium">Revenue share</th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-neutral-500">
                  No regions configured.
                </td>
              </tr>
            )}
            {result.data.map((row, i) => (
              <tr key={row.region_id} className="border-b border-neutral-100 last:border-0">
                <td className="px-3 py-3 text-right font-mono text-xs text-neutral-400">{i + 1}</td>
                <td className="px-3 py-3 font-mono text-xs text-neutral-500">{row.region_code}</td>
                <td className="px-3 py-3 text-neutral-900">{row.region_name}</td>
                <td className="px-3 py-3 text-right tabular-nums text-neutral-700">
                  {formatNumber(row.customers)}
                </td>
                <td className="px-3 py-3">
                  <Bar value={row.customers} max={maxCustomers} tone="indigo" />
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-neutral-500">
                  {formatNumber(row.buyers)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-neutral-500">
                  {formatNumber(row.orders)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-neutral-900">
                  {formatCurrencyArs(row.revenue)}
                </td>
                <td className="px-3 py-3">
                  <Bar value={Number(row.revenue)} max={maxRevenue} tone="emerald" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.unmatched.length > 0 && (
        <details className="rounded-lg border border-neutral-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Unmatched regions ({result.unmatched.length})
          </summary>
          <p className="mt-2 text-sm text-neutral-500">
            Magento sent us these region values that didn&apos;t match any row in the INDEC table.
            They&apos;re audit-only — fix the matcher in the region resolver if any of these
            represent a real province.
          </p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Region (raw)</th>
                <th className="px-3 py-2 font-medium">City</th>
                <th className="px-3 py-2 font-medium">Postal</th>
                <th className="px-3 py-2 text-right font-medium">Occurrences</th>
              </tr>
            </thead>
            <tbody>
              {result.unmatched.map((row, i) => (
                <tr key={i} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-2 text-neutral-900">{row.region_raw ?? '—'}</td>
                  <td className="px-3 py-2 text-neutral-500">{row.city_raw ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">
                    {row.postal_code ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
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
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

interface BarProps {
  value: number;
  max: number;
  tone: 'indigo' | 'emerald';
}

function Bar({ value, max, tone }: BarProps): React.ReactElement {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill = tone === 'indigo' ? 'bg-indigo-500' : 'bg-emerald-500';
  return (
    <div className="flex h-2 w-32 items-center overflow-hidden rounded-full bg-neutral-100">
      <div className={`h-full ${fill}`} style={{ width: `${pct.toFixed(1)}%` }} />
    </div>
  );
}
