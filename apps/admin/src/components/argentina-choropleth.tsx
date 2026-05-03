import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CABA, PROVINCE_PATHS, VIEWBOX } from '@/lib/ar-map';
import { formatCurrencyArs, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { GeoRegionRow } from '@/lib/types';

interface Props {
  data: GeoRegionRow[];
  metric: 'revenue' | 'customers' | 'orders';
  /**
   * Optional drill-down link builder. When provided, each province
   * with data becomes clickable. Provinces without data render as
   * static fills.
   */
  hrefForRegion?: (row: GeoRegionRow) => string;
}

function metricValue(row: GeoRegionRow, metric: Props['metric']): number {
  if (metric === 'revenue') return Number(row.revenue);
  if (metric === 'customers') return row.customers;
  return row.orders;
}

function formatMetric(value: number, metric: Props['metric'], locale: Locale): string {
  if (metric === 'revenue') return formatCurrencyArs(value, locale);
  return formatNumber(value, locale);
}

/**
 * Server-rendered choropleth of Argentina, colored by the selected
 * metric. Intensity scales linearly against the page max via the
 * `--primary` CSS variable so it stays consistent with the theme
 * (and adapts to dark mode automatically).
 *
 * CABA doesn't have a polygon in the source GeoJSON; we render it as
 * a small ring at its real lat/lng so it stays visible and clickable.
 */
export async function ArgentinaChoropleth({
  data,
  metric,
  hrefForRegion,
}: Props): Promise<React.ReactElement> {
  const t = await getTranslations('regions.choropleth');
  const locale = (await getLocale()) as Locale;

  const headingKey =
    metric === 'revenue'
      ? 'headingByRevenue'
      : metric === 'customers'
        ? 'headingByCustomers'
        : 'headingByOrders';

  const byRegion = new Map<number, GeoRegionRow>();
  for (const row of data) byRegion.set(row.region_id, row);

  const max = data.reduce((m, row) => Math.max(m, metricValue(row, metric)), 0);

  const scaleOpacity = (value: number): number => {
    if (max <= 0 || value <= 0) return 0;
    return Math.max(0.12, Math.min(0.95, value / max));
  };

  const cabaRow = byRegion.get(CABA.region_id);
  const cabaValue = cabaRow ? metricValue(cabaRow, metric) : 0;
  const cabaOpacity = scaleOpacity(cabaValue);

  const noDataLabel = t('noData');

  return (
    <figure className="rounded-lg border border-border bg-card p-5 shadow-card">
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t(headingKey)}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('summary', { max: formatMetric(max, metric, locale) })}
        </span>
      </figcaption>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <svg
          viewBox={VIEWBOX}
          xmlns="http://www.w3.org/2000/svg"
          className="h-auto w-full max-w-md justify-self-center"
          role="img"
          aria-label={t(headingKey)}
        >
          {PROVINCE_PATHS.map((p) => {
            const row = byRegion.get(p.region_id);
            const value = row ? metricValue(row, metric) : 0;
            const opacity = scaleOpacity(value);
            const tip = row
              ? `${row.region_name} — ${formatMetric(value, metric, locale)}`
              : `${p.name} — ${noDataLabel}`;
            const href = row && hrefForRegion ? hrefForRegion(row) : null;
            const path = (
              <path
                d={p.d}
                fill={
                  opacity === 0
                    ? 'hsl(var(--muted))'
                    : `hsl(var(--primary) / ${opacity.toFixed(3)})`
                }
                stroke="hsl(var(--border))"
                strokeWidth="0.6"
                strokeLinejoin="round"
                className={href ? 'cursor-pointer transition hover:brightness-110' : undefined}
              >
                <title>{tip}</title>
              </path>
            );
            return href ? (
              <Link key={p.region_id} href={href}>
                {path}
              </Link>
            ) : (
              <g key={p.region_id}>{path}</g>
            );
          })}
          {/* CABA marker — small filled circle at the real coordinates. */}
          {(() => {
            const cabaHref = cabaRow && hrefForRegion ? hrefForRegion(cabaRow) : null;
            const circle = (
              <circle
                cx={CABA.centroid[0]}
                cy={CABA.centroid[1]}
                r={4}
                fill={
                  cabaOpacity === 0
                    ? 'hsl(var(--muted))'
                    : `hsl(var(--primary) / ${Math.max(0.45, cabaOpacity).toFixed(3)})`
                }
                stroke="hsl(var(--card))"
                strokeWidth="1"
                className={cabaHref ? 'cursor-pointer transition hover:brightness-110' : undefined}
              >
                <title>
                  {cabaRow
                    ? `${cabaRow.region_name} — ${formatMetric(cabaValue, metric, locale)}`
                    : `${CABA.name} — ${noDataLabel}`}
                </title>
              </circle>
            );
            return cabaHref ? <Link href={cabaHref}>{circle}</Link> : circle;
          })()}
        </svg>

        <div className="self-end">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('scale')}
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {[1, 0.75, 0.5, 0.25, 0.1].map((stop) => (
              <div key={stop} className="flex items-center gap-2 text-xs">
                <span
                  className="h-3 w-6 rounded-sm border border-border"
                  style={{ backgroundColor: `hsl(var(--primary) / ${stop})` }}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">
                  {formatMetric(max * stop, metric, locale)}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs">
              <span
                className="h-3 w-6 rounded-sm border border-border bg-muted"
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{noDataLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
