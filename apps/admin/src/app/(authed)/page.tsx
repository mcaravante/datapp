import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArgentinaChoropleth } from '@/components/argentina-choropleth';
import { LineChart } from '@/components/charts/line-chart';
import { Sparkline } from '@/components/charts/sparkline';
import { cachedApiFetch } from '@/lib/cached-api-fetch';
import { RangeSelector } from './range-selector';
import {
  formatCompactRevenue,
  formatCurrencyArs,
  formatDeltaPct,
  formatNumber,
  formatPercent01,
  deltaTone,
} from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type {
  CouponsResponse,
  GeoResponse,
  KpisResponse,
  RevenueTimeseriesResponse,
  TopProductsResponse,
} from '@/lib/types';

export const metadata = { title: 'Datapp · Overview' };

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; window?: string }>;
}

const PRESETS = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: '365d', days: 365 },
  { id: 'all', days: null },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

function rangeFromPreset(presetId: string): { from?: string; to: string } {
  const to = new Date();
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1];
  if (!preset || preset.days === null) {
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

  // Fan-out the dashboard reads. Each is independently cached by tenant
  // tag (PR 12) so the second visitor lands on a hot dashboard.
  const [kpis, timeseries, topProducts, geo, coupons] = await Promise.all([
    cachedApiFetch<KpisResponse>(`/v1/admin/analytics/kpis?${params.toString()}`),
    cachedApiFetch<RevenueTimeseriesResponse>(
      `/v1/admin/analytics/revenue-timeseries?${params.toString()}`,
    ),
    cachedApiFetch<TopProductsResponse>(
      `/v1/admin/analytics/top-products?${params.toString()}&limit=5`,
    ),
    cachedApiFetch<GeoResponse>(`/v1/admin/analytics/geo?${params.toString()}&country=AR`),
    cachedApiFetch<CouponsResponse>(`/v1/admin/analytics/coupons?${params.toString()}`),
  ]);

  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('overview');

  // Sparkline values derived from the timeseries — one per KPI tile.
  const revenueSpark = timeseries.current.map((p) => Number(p.revenue));
  const ordersSpark = timeseries.current.map((p) => p.orders);
  const aovSpark = timeseries.current.map((p) =>
    p.orders > 0 ? Number(p.revenue) / p.orders : 0,
  );
  // Customers don't come per-bucket from the API; show the orders curve
  // as a proxy (volume is what drives the customer count anyway).
  const customersSpark = ordersSpark;

  const top5Coupons = [...coupons.data]
    .sort((a, b) => Number(b.gross_revenue) - Number(a.gross_revenue))
    .slice(0, 5);

  const top5Regions = [...geo.data]
    .filter((r) => r.orders > 0)
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <RangeSelector />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={t('tiles.revenue')}
          value={formatCurrencyArs(kpis.current.revenue, locale)}
          delta={kpis.delta.revenue_pct}
          sub={`${t('delta.vs')} ${formatCurrencyArs(kpis.previous.revenue, locale)}`}
          spark={revenueSpark}
          sparkTone="text-success"
        />
        <Tile
          label={t('tiles.orders')}
          value={formatNumber(kpis.current.orders, locale)}
          delta={kpis.delta.orders_pct}
          sub={`${t('delta.vs')} ${formatNumber(kpis.previous.orders, locale)}`}
          spark={ordersSpark}
          sparkTone="text-primary"
        />
        <Tile
          label={t('tiles.aov')}
          value={formatCurrencyArs(kpis.current.aov, locale)}
          delta={kpis.delta.aov_pct}
          sub={`${t('delta.vs')} ${formatCurrencyArs(kpis.previous.aov, locale)}`}
          spark={aovSpark}
          sparkTone="text-accent"
        />
        <Tile
          label={t('tiles.customers')}
          value={formatNumber(kpis.current.customers, locale)}
          delta={kpis.delta.customers_pct}
          sub={t('tiles.customerMixCount', {
            newCount: formatNumber(kpis.current.new_customers, locale),
            returningCount: formatNumber(kpis.current.returning_customers, locale),
          })}
          spark={customersSpark}
          sparkTone="text-info"
        />
      </div>

      <section className="rounded-lg border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('chart.title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('chart.subtitle', { granularity: t(`chart.bucket.${timeseries.granularity}`) })}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3 rounded bg-primary" aria-hidden="true" />
              {t('chart.legendCurrent')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 border-t border-dashed border-muted-foreground"
                aria-hidden="true"
              />
              {t('chart.legendPrevious')}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <LineChart
            yUnit={t('chart.yUnit')}
            series={[
              {
                id: 'previous',
                label: t('chart.legendPrevious'),
                values: timeseries.previous.map((p) => Number(p.revenue)),
                tone: 'muted',
                variant: 'dashed',
              },
              {
                id: 'current',
                label: t('chart.legendCurrent'),
                values: timeseries.current.map((p) => Number(p.revenue)),
                dates: timeseries.current.map((p) => p.bucket),
                tone: 'primary',
              },
            ]}
            formatY={(v) => formatCompactRevenue(v, 'ars')}
            formatX={(iso) => formatBucketLabel(iso, timeseries.granularity, locale)}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-card">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('mix.heading')}
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <MixCell
            label={t('mix.newCustomers')}
            value={formatNumber(kpis.current.new_customers, locale)}
            tone="primary"
          />
          <MixCell
            label={t('mix.returningCustomers')}
            value={formatNumber(kpis.current.returning_customers, locale)}
            tone="success"
          />
          <MixCell
            label={t('mix.repeatRate')}
            value={formatPercent01(kpis.current.repeat_purchase_rate, locale)}
            tone="accent"
          />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopList
          title={t('top.products')}
          href="/products"
          items={topProducts.data.map((p) => ({
            primary: p.name,
            secondary: p.sku,
            value: formatCurrencyArs(p.revenue, locale),
            valueRaw: Number(p.revenue),
            href: `/products/${encodeURIComponent(p.sku)}`,
          }))}
          tone="primary"
        />
        <TopList
          title={t('top.regions')}
          href="/regions"
          items={top5Regions.map((r) => ({
            primary: r.region_name,
            secondary: r.region_code,
            value: formatCurrencyArs(r.revenue, locale),
            valueRaw: Number(r.revenue),
            href: `/orders?region=${r.region_id}&region_name=${encodeURIComponent(r.region_name)}`,
          }))}
          tone="success"
        />
        {top5Coupons.length > 0 && (
          <TopList
            title={t('top.coupons')}
            href="/coupons"
            items={top5Coupons.map((c) => ({
              primary: c.code,
              secondary: c.name ?? '',
              value: formatCurrencyArs(c.gross_revenue, locale),
              valueRaw: Number(c.gross_revenue),
              href: '/coupons',
            }))}
            tone="accent"
          />
        )}
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('miniMap.title')}
            </h2>
            <Link href="/regions" className="text-xs text-primary hover:underline">
              {t('miniMap.open')} →
            </Link>
          </div>
          <div className="mt-3">
            <ArgentinaChoropleth
              data={geo.data}
              metric="revenue"
              hrefForRegion={(row) =>
                `/orders?region=${row.region_id}&region_name=${encodeURIComponent(row.region_name)}`
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}

interface TileProps {
  label: string;
  value: string;
  delta: number | null;
  sub: string;
  spark?: number[];
  sparkTone?: string;
}

function Tile({ label, value, delta, sub, spark, sparkTone }: TileProps): React.ReactElement {
  const tone = deltaTone(delta);
  const toneClass =
    tone === 'up'
      ? 'bg-success/15 text-success'
      : tone === 'down'
        ? 'bg-destructive/15 text-destructive'
        : 'bg-muted text-muted-foreground';
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card transition hover:shadow-elevated">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        <span
          className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}
        >
          {tone === 'up' ? (
            <TrendUpIcon className="h-3 w-3" />
          ) : tone === 'down' ? (
            <TrendDownIcon className="h-3 w-3" />
          ) : null}
          {formatDeltaPct(delta)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline values={spark} tone={sparkTone ?? 'text-primary'} height={28} />
        </div>
      )}
    </div>
  );
}

function MixCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'accent';
}): React.ReactElement {
  const dot =
    tone === 'primary' ? 'bg-primary' : tone === 'success' ? 'bg-success' : 'bg-accent';
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

interface TopListItem {
  primary: string;
  secondary: string;
  value: string;
  valueRaw: number;
  href: string;
}

function TopList({
  title,
  href,
  items,
  tone,
}: {
  title: string;
  href: string;
  items: TopListItem[];
  tone: 'primary' | 'success' | 'accent';
}): React.ReactElement {
  const max = items.reduce((m, it) => Math.max(m, it.valueRaw), 0);
  const fill =
    tone === 'primary' ? 'bg-primary/15' : tone === 'success' ? 'bg-success/15' : 'bg-accent/15';
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <Link href={href} className="text-xs text-primary hover:underline">
          →
        </Link>
      </div>
      <ol className="mt-3 space-y-1.5">
        {items.length === 0 && (
          <li className="text-xs text-muted-foreground">—</li>
        )}
        {items.map((it, i) => {
          const pct = max > 0 ? (it.valueRaw / max) * 100 : 0;
          return (
            <li key={`${it.primary}-${i}`} className="relative">
              <Link
                href={it.href}
                className="relative flex items-baseline justify-between gap-3 rounded px-2 py-1 transition hover:bg-muted/40"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 rounded ${fill}`}
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
                <span className="relative flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate text-sm text-foreground">{it.primary}</span>
                  {it.secondary && (
                    <span className="truncate text-[10px] text-muted-foreground">
                      {it.secondary}
                    </span>
                  )}
                </span>
                <span className="relative shrink-0 tabular-nums text-xs font-medium text-foreground">
                  {it.value}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TrendUpIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 7-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </svg>
  );
}

function TrendDownIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 17-8.5-8.5-5 5L2 7" />
      <path d="M16 17h6v-6" />
    </svg>
  );
}

/**
 * Format a timeseries bucket label for the line chart x-axis,
 * adapting to the granularity returned by the API:
 *   - day:   "12 may"
 *   - week:  "Sem 12 may"
 *   - month: "may '26"
 */
function formatBucketLabel(
  iso: string,
  granularity: 'day' | 'week' | 'month',
  locale: Locale,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tz = 'America/Argentina/Buenos_Aires';
  const lang = locale === 'en' ? 'en-AR' : 'es-AR';
  if (granularity === 'month') {
    return d
      .toLocaleDateString(lang, { timeZone: tz, month: 'short', year: '2-digit' })
      .replace(/\.$/, '');
  }
  if (granularity === 'week') {
    return `Sem ${d.toLocaleDateString(lang, { timeZone: tz, day: '2-digit', month: 'short' }).replace(/\.$/, '')}`;
  }
  return d
    .toLocaleDateString(lang, { timeZone: tz, day: '2-digit', month: 'short' })
    .replace(/\.$/, '');
}
