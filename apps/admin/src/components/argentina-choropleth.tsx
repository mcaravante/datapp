import { CABA, PROVINCE_PATHS, VIEWBOX } from '@/lib/ar-map';
import { formatCurrencyArs, formatNumber } from '@/lib/format';
import type { GeoRegionRow } from '@/lib/types';

interface Props {
  data: GeoRegionRow[];
  metric: 'revenue' | 'customers' | 'orders';
}

const METRIC_LABEL: Record<Props['metric'], string> = {
  revenue: 'Revenue',
  customers: 'Customers',
  orders: 'Orders',
};

function metricValue(row: GeoRegionRow, metric: Props['metric']): number {
  if (metric === 'revenue') return Number(row.revenue);
  if (metric === 'customers') return row.customers;
  return row.orders;
}

function formatMetric(value: number, metric: Props['metric']): string {
  if (metric === 'revenue') return formatCurrencyArs(value);
  return formatNumber(value);
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
export function ArgentinaChoropleth({ data, metric }: Props): React.ReactElement {
  const byRegion = new Map<number, GeoRegionRow>();
  for (const row of data) byRegion.set(row.region_id, row);

  const max = data.reduce((m, row) => Math.max(m, metricValue(row, metric)), 0);

  const scaleOpacity = (value: number): number => {
    if (max <= 0 || value <= 0) return 0;
    // Soft floor so any region with > 0 stays visible; cap at 0.95 so
    // the highest cell still shows a stroke clearly.
    return Math.max(0.12, Math.min(0.95, value / max));
  };

  const cabaRow = byRegion.get(CABA.region_id);
  const cabaValue = cabaRow ? metricValue(cabaRow, metric) : 0;
  const cabaOpacity = scaleOpacity(cabaValue);

  return (
    <figure className="rounded-lg border border-border bg-card p-5 shadow-card">
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {METRIC_LABEL[metric]} by province
        </span>
        <span className="text-xs text-muted-foreground">
          24 provinces · max {formatMetric(max, metric)}
        </span>
      </figcaption>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <svg
          viewBox={VIEWBOX}
          xmlns="http://www.w3.org/2000/svg"
          className="h-auto w-full max-w-md justify-self-center"
          role="img"
          aria-label={`Choropleth of Argentina by ${metric}`}
        >
          {PROVINCE_PATHS.map((p) => {
            const row = byRegion.get(p.region_id);
            const value = row ? metricValue(row, metric) : 0;
            const opacity = scaleOpacity(value);
            const tip = row
              ? `${row.region_name} — ${formatMetric(value, metric)}`
              : `${p.name} — no data`;
            return (
              <path
                key={p.region_id}
                d={p.d}
                fill={
                  opacity === 0
                    ? 'hsl(var(--muted))'
                    : `hsl(var(--primary) / ${opacity.toFixed(3)})`
                }
                stroke="hsl(var(--border))"
                strokeWidth="0.6"
                strokeLinejoin="round"
              >
                <title>{tip}</title>
              </path>
            );
          })}
          {/* CABA marker — small filled circle at the real coordinates. */}
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
          >
            <title>
              {cabaRow
                ? `${cabaRow.region_name} — ${formatMetric(cabaValue, metric)}`
                : 'Ciudad Autónoma de Buenos Aires — no data'}
            </title>
          </circle>
        </svg>

        <div className="self-end">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scale
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
                  {formatMetric(max * stop, metric)}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs">
              <span
                className="h-3 w-6 rounded-sm border border-border bg-muted"
                aria-hidden="true"
              />
              <span className="text-muted-foreground">no data</span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
