import { getLocale, getTranslations } from 'next-intl/server';
import { BreakdownSection } from '@/components/charts/breakdown-section';
import { Histogram } from '@/components/charts/histogram';
import { MultiLineChart } from '@/components/charts/multi-line-chart';
import { YearlyMatrix } from '@/components/charts/yearly-matrix';
import { CurrencyToggle, pickCurrency } from '@/components/currency-toggle';
import { cachedApiFetch } from '@/lib/cached-api-fetch';
import { formatCompactRevenue, formatNumber, formatRevenue } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type {
  AovHistogramResponse,
  BreakdownResponse,
  MethodKind,
  MethodLabelsResponse,
  YearlyRevenueResponse,
} from '@/lib/types';

export const metadata = { title: 'Datapp · Reports' };

interface PageProps {
  searchParams: Promise<{ currency?: string }>;
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Hand-picked HSL palette spread across the color wheel so every
 * adjacent year is visually distinct. Direct colors (not Tailwind
 * tokens) bypass theme-token collisions like warning ≈ accent in
 * dark mode. The newest year always uses `--primary` so it remains
 * the focal point of the chart.
 */
const YEAR_PALETTE: readonly string[] = [
  'hsl(0, 0%, 55%)', // gray (oldest)
  'hsl(280, 60%, 65%)', // violet
  'hsl(20, 80%, 55%)', // orange-red
  'hsl(50, 85%, 50%)', // amber
  'hsl(155, 60%, 45%)', // teal-green
  'hsl(195, 80%, 50%)', // cyan
  'hsl(330, 70%, 60%)', // pink-magenta
];

/**
 * Magento payment / shipping codes are snake_case identifiers
 * (`mercadopago_custom`, `tablerate_bestway`). We don't ship a curated
 * dictionary because the catalog varies by tenant — instead, normalize
 * the raw key into a readable form: replace separators with spaces and
 * capitalize each word. Operators recognize their own integrations.
 */
function prettifyMethodKey(key: string): string {
  if (!key || key === '(none)') return key;
  return key
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function colorForYear(index: number, total: number): string {
  const isNewest = index === total - 1;
  if (isNewest) return 'hsl(var(--primary))';
  // Older years: walk the palette right-to-left so the second-newest
  // gets the most saturated tone and the oldest fades to gray.
  const palette = YEAR_PALETTE;
  const offset = palette.length - 1 - index;
  return palette[Math.max(0, offset)] ?? palette[0]!;
}

export default async function ReportsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const currency = pickCurrency(sp.currency);

  const yearTo = new Date().toISOString();
  const yearFrom = new Date(Date.UTC(new Date().getFullYear(), 0, 1)).toISOString();

  const histogramParams = new URLSearchParams({
    from: yearFrom,
    to: yearTo,
    buckets: '20',
    currency,
  });

  const breakdownParams = (dim: 'payment_method' | 'shipping_method'): URLSearchParams =>
    new URLSearchParams({ from: yearFrom, to: yearTo, dimension: dim, currency });

  const [yearly, histogram, paymentBreakdown, shippingBreakdown, methodLabels] =
    await Promise.all([
      cachedApiFetch<YearlyRevenueResponse>(
        `/v1/admin/analytics/yearly-revenue?currency=${currency}`,
      ),
      cachedApiFetch<AovHistogramResponse>(
        `/v1/admin/analytics/aov-histogram?${histogramParams.toString()}`,
      ),
      cachedApiFetch<BreakdownResponse>(
        `/v1/admin/analytics/breakdown?${breakdownParams('payment_method').toString()}`,
      ),
      cachedApiFetch<BreakdownResponse>(
        `/v1/admin/analytics/breakdown?${breakdownParams('shipping_method').toString()}`,
      ),
      cachedApiFetch<MethodLabelsResponse>('/v1/admin/analytics/method-labels'),
    ]);

  // Bucket labels by kind for O(1) lookup at render time.
  // Two-pass: first index every row by its own code so canonical rows
  // win, then fold alias rows under their `merge_into_code` only when
  // the canonical doesn't have its own label. This way the operator can
  // configure the title once on the alias and the breakdown UI still
  // shows it under the canonical code returned by the merged SQL.
  const labelsByKind: Record<MethodKind, Map<string, string>> = {
    payment: new Map(),
    shipping: new Map(),
  };
  for (const row of methodLabels.data) {
    labelsByKind[row.kind].set(row.code, row.title);
  }
  for (const row of methodLabels.data) {
    if (row.merge_into_code && !labelsByKind[row.kind].has(row.merge_into_code)) {
      labelsByKind[row.kind].set(row.merge_into_code, row.title);
    }
  }
  const labelFor = (kind: MethodKind) => (key: string): string => {
    const custom = labelsByKind[kind].get(key);
    return custom ?? prettifyMethodKey(key);
  };

  const t = await getTranslations('reports');
  const locale = (await getLocale()) as Locale;
  const months = locale === 'en' ? MONTHS_EN : MONTHS_ES;
  const currentParams: Record<string, string | string[] | undefined> = {
    currency: currency === 'ars' ? undefined : currency,
  };

  const yoySeries = yearly.years.map((y, i) => ({
    id: String(y.year),
    label: `${y.year} — ${formatRevenue(y.total_revenue, currency, locale)}`,
    values: y.months.map((m) => Number(m.revenue)),
    stroke: colorForYear(i, yearly.years.length),
  }));

  // Same color per year as the revenue chart so the operator's eye
  // doesn't have to re-map. Values are counts → currency-agnostic.
  const ordersSeries = yearly.years.map((y, i) => ({
    id: String(y.year),
    label: `${y.year} — ${formatNumber(y.total_orders, locale)}`,
    values: y.months.map((m) => m.orders),
    stroke: colorForYear(i, yearly.years.length),
  }));

  const revenueRows = yearly.years.map((y, i) => ({
    label: String(y.year),
    stroke: colorForYear(i, yearly.years.length),
    values: y.months.map((m) => Number(m.revenue)),
    total: formatRevenue(y.total_revenue, currency, locale),
  }));

  const ordersRows = yearly.years.map((y, i) => ({
    label: String(y.year),
    stroke: colorForYear(i, yearly.years.length),
    values: y.months.map((m) => m.orders),
    total: formatNumber(y.total_orders, locale),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <CurrencyToggle current={currency} basePath="/reports" currentParams={currentParams} />
      </div>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('yoy.title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('yoy.subtitle')}</p>
        </div>
        {yoySeries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('yoy.empty')}</p>
        ) : (
          <>
            <MultiLineChart
              series={yoySeries}
              monthLabels={months}
              formatY={(v) => formatCompactRevenue(v, currency)}
            />
            <YearlyMatrix
              rows={revenueRows}
              monthLabels={months}
              formatCell={(v) => formatCompactRevenue(v, currency)}
              totalLabel={t('yoy.totalLabel')}
              yearLabel={t('yoy.yearLabel')}
            />
          </>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('yoyOrders.title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('yoyOrders.subtitle')}</p>
        </div>
        {ordersSeries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('yoy.empty')}</p>
        ) : (
          <>
            <MultiLineChart
              series={ordersSeries}
              monthLabels={months}
              formatY={(v) => formatNumber(v, locale)}
            />
            <YearlyMatrix
              rows={ordersRows}
              monthLabels={months}
              formatCell={(v) => formatNumber(v, locale)}
              totalLabel={t('yoy.totalLabel')}
              yearLabel={t('yoy.yearLabel')}
            />
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownSection
          title={t('breakdown.payment.title')}
          subtitle={t('breakdown.payment.subtitle')}
          data={paymentBreakdown}
          otherLabel={t('breakdown.other')}
          noDataLabel={t('breakdown.noData')}
          table={{
            methodLabel: t('breakdown.table.method'),
            ordersLabel: t('breakdown.table.orders'),
            revenueLabel: t('breakdown.table.revenue'),
            shareLabel: t('breakdown.table.share'),
          }}
          formatKey={labelFor('payment')}
          formatRevenue={(v) => formatRevenue(v, currency, locale)}
          formatNumber={(v) => formatNumber(v, locale)}
          formatShare={(v) => `${v.toFixed(1)}%`}
        />
        <BreakdownSection
          title={t('breakdown.shipping.title')}
          subtitle={t('breakdown.shipping.subtitle')}
          data={shippingBreakdown}
          otherLabel={t('breakdown.other')}
          noDataLabel={t('breakdown.noData')}
          table={{
            methodLabel: t('breakdown.table.method'),
            ordersLabel: t('breakdown.table.orders'),
            revenueLabel: t('breakdown.table.revenue'),
            shareLabel: t('breakdown.table.share'),
          }}
          formatKey={labelFor('shipping')}
          formatRevenue={(v) => formatRevenue(v, currency, locale)}
          formatNumber={(v) => formatNumber(v, locale)}
          formatShare={(v) => `${v.toFixed(1)}%`}
        />
      </div>

      {histogram.buckets.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">{t('histogram.title')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('histogram.subtitle', {
                  total: formatNumber(histogram.total_orders, locale),
                  median: formatRevenue(histogram.median, currency, locale),
                })}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Histogram
              buckets={histogram.buckets.map((b) => ({
                min: Number(b.min),
                max: Number(b.max),
                count: b.orders,
              }))}
              median={Number(histogram.median)}
              formatX={(v) => formatCompactRevenue(v, currency)}
              formatCount={(n) => formatNumber(n, locale)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
