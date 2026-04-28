import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { formatCurrencyArs, formatNumber, formatPercent01 } from '@/lib/format';
import type { CohortsResponse, TimingResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Insights' };

interface PageProps {
  searchParams: Promise<{ window?: string; metric?: 'orders' | 'revenue' }>;
}

const PRESETS = [
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: '365d', label: '1 year', days: 365 },
  { id: 'all', label: 'All time', days: null },
] as const;

function rangeFromPreset(presetId: string): { from?: string; to?: string } {
  const to = new Date();
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1];
  if (!preset || preset.days === null) {
    return { from: '2010-01-01T00:00:00.000Z', to: to.toISOString() };
  }
  const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export default async function InsightsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const windowParam = sp.window ?? '90d';
  const metric = sp.metric === 'revenue' ? 'revenue' : 'orders';
  const range = rangeFromPreset(windowParam);

  const timingParams = new URLSearchParams();
  if (range.from) timingParams.set('from', range.from);
  if (range.to) timingParams.set('to', range.to);

  const [timing, cohorts] = await Promise.all([
    apiFetch<TimingResponse>(`/v1/admin/analytics/timing?${timingParams.toString()}`),
    apiFetch<CohortsResponse>(`/v1/admin/analytics/cohorts?cohorts=12&horizon=12`),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            When your customers buy and how long they keep coming back. All times in{' '}
            <span className="font-mono text-xs">{timing.timezone}</span>.
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
          {PRESETS.map((p) => {
            const active = windowParam === p.id;
            return (
              <Link
                key={p.id}
                href={`/insights?window=${p.id}&metric=${metric}`}
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

      <HeatmapSection timing={timing} window={windowParam} metric={metric} />
      <CadenceSection timing={timing} />
      <CohortSection cohorts={cohorts} />
    </div>
  );
}

// ─── Heatmap ────────────────────────────────────────────────────────────────

function HeatmapSection({
  timing,
  window,
  metric,
}: {
  timing: TimingResponse;
  window: string;
  metric: 'orders' | 'revenue';
}): React.ReactElement {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const cell of timing.heatmap) {
    const row = matrix[cell.dow];
    if (row) row[cell.hour] = metric === 'revenue' ? Number(cell.revenue) : cell.orders;
  }
  const max = matrix.reduce((m, row) => Math.max(m, ...row), 0);

  // Top hours of the week — quick narrative of when sales peak.
  const topCells = [...timing.heatmap]
    .map((c) => ({ ...c, value: metric === 'revenue' ? Number(c.revenue) : c.orders }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const totalOrders = timing.heatmap.reduce((s, c) => s + c.orders, 0);
  const totalRevenue = timing.heatmap.reduce((s, c) => s + Number(c.revenue), 0);

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Day × hour heatmap
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatNumber(totalOrders)} orders · {formatCurrencyArs(totalRevenue)} revenue.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Color by:</span>
          <Link
            href={`/insights?window=${window}&metric=orders`}
            className={
              metric === 'orders'
                ? 'rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground'
                : 'rounded-md border border-border bg-card px-3 py-1 text-foreground transition hover:bg-muted'
            }
          >
            Orders
          </Link>
          <Link
            href={`/insights?window=${window}&metric=revenue`}
            className={
              metric === 'revenue'
                ? 'rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground'
                : 'rounded-md border border-border bg-card px-3 py-1 text-foreground transition hover:bg-muted'
            }
          >
            Revenue
          </Link>
        </div>
      </div>

      {max === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No orders in this window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div
              className="grid gap-0.5 text-[10px]"
              style={{ gridTemplateColumns: 'auto repeat(24, minmax(20px, 1fr))' }}
            >
              <div />
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="text-center font-mono text-muted-foreground"
                  aria-hidden="true"
                >
                  {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                </div>
              ))}
              {DOW_LABELS.map((label, dow) => (
                <DowRow
                  key={dow}
                  label={label}
                  values={matrix[dow] ?? []}
                  max={max}
                  metric={metric}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span>Less</span>
              <div className="flex gap-0.5">
                {[0.1, 0.25, 0.5, 0.75, 1].map((opacity) => (
                  <span
                    key={opacity}
                    className="h-3 w-6 rounded-sm"
                    style={{ backgroundColor: `hsl(var(--primary) / ${opacity})` }}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      )}

      {topCells.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {topCells.map((c, i) => (
            <span
              key={`${c.dow}-${c.hour}`}
              className={
                i === 0
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-primary'
                  : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-foreground/80'
              }
            >
              <span className="font-medium">
                {DOW_LABELS[c.dow]} · {String(c.hour).padStart(2, '0')}:00
              </span>
              <span className="text-muted-foreground">
                {metric === 'revenue' ? formatCurrencyArs(c.value) : `${formatNumber(c.value)} orders`}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function DowRow({
  label,
  values,
  max,
  metric,
}: {
  label: string;
  values: number[];
  max: number;
  metric: 'orders' | 'revenue';
}): React.ReactElement {
  return (
    <>
      <div className="pr-2 py-1 text-right font-mono text-xs text-muted-foreground">{label}</div>
      {values.map((value, hour) => {
        const intensity = max > 0 ? value / max : 0;
        const opacity = value === 0 ? 0 : Math.max(0.08, intensity);
        const tip =
          value === 0
            ? `${label} ${String(hour).padStart(2, '0')}:00 — no orders`
            : metric === 'revenue'
              ? `${label} ${String(hour).padStart(2, '0')}:00 — ${formatCurrencyArs(value)}`
              : `${label} ${String(hour).padStart(2, '0')}:00 — ${formatNumber(value)} orders`;
        return (
          <div
            key={hour}
            className="aspect-square min-h-[18px] rounded-sm border border-border/40"
            style={{
              backgroundColor:
                value === 0 ? 'hsl(var(--muted))' : `hsl(var(--primary) / ${opacity})`,
            }}
            title={tip}
            aria-label={tip}
          />
        );
      })}
    </>
  );
}

// ─── Cadence ────────────────────────────────────────────────────────────────

function CadenceSection({ timing }: { timing: TimingResponse }): React.ReactElement {
  const max = timing.cadence.buckets.reduce((m, b) => Math.max(m, b.count), 0);

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Time between orders
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatNumber(timing.cadence.repeat_customers)} customers with 2+ orders ·{' '}
            {timing.cadence.median_days !== null
              ? `median gap ${timing.cadence.median_days} days`
              : 'no gap data'}
            .
          </p>
        </div>
      </div>

      {max === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No repeat-purchase gaps in this window.
        </p>
      ) : (
        <div className="space-y-1.5">
          {timing.cadence.buckets.map((b) => {
            const pct = max > 0 ? (b.count / max) * 100 : 0;
            return (
              <div key={b.label} className="grid grid-cols-[5rem_1fr_5rem] items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">{b.label}</span>
                <div className="relative h-6 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary/80"
                    style={{ width: `${pct.toFixed(1)}%` }}
                    aria-hidden="true"
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-foreground">
                    {formatNumber(b.count)}
                  </span>
                </div>
                <span className="text-right tabular-nums text-xs text-muted-foreground">
                  {b.percent.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Cohort retention ───────────────────────────────────────────────────────

function CohortSection({ cohorts }: { cohorts: CohortsResponse }): React.ReactElement {
  const horizon = cohorts.horizon;
  const totalCustomers = cohorts.cohorts.reduce((s, c) => s + c.size, 0);

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Cohort retention ({cohorts.cohorts.length} months)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatNumber(totalCustomers)} customers across the last {cohorts.cohorts.length}{' '}
          months. Each row is the customers acquired in that month; each column shows what % of
          them placed an order N months later. Empty cells = haven&apos;t happened yet.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-2 font-semibold">Cohort</th>
              <th className="px-2 py-2 text-right font-semibold">Size</th>
              {Array.from({ length: horizon + 1 }, (_, i) => (
                <th key={i} className="px-2 py-2 text-center font-mono font-semibold">
                  M{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.cohorts.map((c) => (
              <tr key={c.cohort_month} className="border-b border-border last:border-0">
                <td className="px-2 py-2 font-mono text-foreground/80">
                  {c.cohort_month.slice(0, 7)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                  {c.size > 0 ? formatNumber(c.size) : '—'}
                </td>
                {c.retained.map((value, offset) => (
                  <CohortCell key={offset} value={value} size={c.size} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CohortCell({
  value,
  size,
}: {
  value: number | null;
  size: number;
}): React.ReactElement {
  if (value === null) {
    return (
      <td
        className="px-2 py-2 text-center text-muted-foreground/40"
        aria-label="not yet elapsed"
      >
        —
      </td>
    );
  }
  if (size === 0) {
    return <td className="px-2 py-2 text-center text-muted-foreground/40">·</td>;
  }
  const rate = value / size;
  const opacity = rate === 0 ? 0 : Math.max(0.1, Math.min(1, rate));
  return (
    <td
      className="px-2 py-2 text-center tabular-nums"
      style={{
        backgroundColor: rate === 0 ? 'transparent' : `hsl(var(--success) / ${opacity})`,
        color: rate >= 0.5 ? 'hsl(var(--success-foreground))' : undefined,
      }}
      title={`${value} / ${size} = ${formatPercent01(rate)}`}
    >
      {formatPercent01(rate)}
    </td>
  );
}
