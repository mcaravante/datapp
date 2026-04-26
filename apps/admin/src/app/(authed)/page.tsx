import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import {
  formatCurrencyArs,
  formatDeltaPct,
  formatNumber,
  formatPercent01,
  deltaTone,
} from '@/lib/format';
import type { KpisResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Overview' };

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; window?: string }>;
}

const PRESETS = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
] as const;

function rangeFromPreset(presetId: string): { from?: string; to: string } {
  const to = new Date();
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1]!;
  if (preset.days === null) {
    return { from: '2010-01-01T00:00:00.000Z', to: to.toISOString() };
  }
  const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async function OverviewPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { from: fromParam, to: toParam, window: windowParam = '30d' } = await searchParams;
  const range =
    fromParam && toParam ? { from: fromParam, to: toParam } : rangeFromPreset(windowParam);

  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  params.set('to', range.to);

  const kpis = await apiFetch<KpisResponse>(`/v1/admin/analytics/kpis?${params.toString()}`);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>
          <p className="mt-1 text-sm text-neutral-500">KPIs vs the equivalent previous period.</p>
        </div>
        <nav className="flex gap-1 rounded-md border border-neutral-200 bg-white p-1 text-xs">
          {PRESETS.map((p) => {
            const active = windowParam === p.id && !fromParam && !toParam;
            return (
              <Link
                key={p.id}
                href={`/?window=${p.id}`}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Revenue"
          value={formatCurrencyArs(kpis.current.revenue)}
          delta={kpis.delta.revenue_pct}
          sub={`vs ${formatCurrencyArs(kpis.previous.revenue)}`}
        />
        <Tile
          label="Orders"
          value={formatNumber(kpis.current.orders)}
          delta={kpis.delta.orders_pct}
          sub={`vs ${formatNumber(kpis.previous.orders)}`}
        />
        <Tile
          label="Average order value"
          value={formatCurrencyArs(kpis.current.aov)}
          delta={kpis.delta.aov_pct}
          sub={`vs ${formatCurrencyArs(kpis.previous.aov)}`}
        />
        <Tile
          label="Customers"
          value={formatNumber(kpis.current.customers)}
          delta={kpis.delta.customers_pct}
          sub={`${formatNumber(kpis.current.new_customers)} new · ${formatNumber(kpis.current.returning_customers)} returning`}
        />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Customer mix
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">New customers</dt>
            <dd className="mt-1 text-lg font-semibold text-neutral-900">
              {formatNumber(kpis.current.new_customers)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Returning customers</dt>
            <dd className="mt-1 text-lg font-semibold text-neutral-900">
              {formatNumber(kpis.current.returning_customers)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Repeat purchase rate</dt>
            <dd className="mt-1 text-lg font-semibold text-neutral-900">
              {formatPercent01(kpis.current.repeat_purchase_rate)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/customers"
          className="rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Customers
          </div>
          <div className="mt-2 text-base font-semibold text-neutral-900">Browse and search</div>
          <p className="mt-1 text-sm text-neutral-500">
            Identity, addresses, lifetime metrics for every synced customer.
          </p>
        </Link>
        <Link
          href="/products"
          className="rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Products
          </div>
          <div className="mt-2 text-base font-semibold text-neutral-900">Top products</div>
          <p className="mt-1 text-sm text-neutral-500">
            Best sellers by units or revenue, filtered by date range.
          </p>
        </Link>
      </div>
    </div>
  );
}

interface TileProps {
  label: string;
  value: string;
  delta: number | null;
  sub: string;
}

function Tile({ label, value, delta, sub }: TileProps): React.ReactElement {
  const tone = deltaTone(delta);
  const toneClass =
    tone === 'up'
      ? 'text-emerald-700 bg-emerald-50'
      : tone === 'down'
        ? 'text-red-700 bg-red-50'
        : 'text-neutral-500 bg-neutral-100';
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-2xl font-semibold text-neutral-900">{value}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>
          {formatDeltaPct(delta)}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{sub}</p>
    </div>
  );
}
