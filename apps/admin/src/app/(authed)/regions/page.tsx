import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { cachedApiFetch } from '@/lib/cached-api-fetch';
import { ArgentinaChoropleth } from '@/components/argentina-choropleth';
import { ExportButton } from '@/components/export-button';
import { SortableHeader } from '@/components/sortable-header';
import { buildListHref, parseSort, type SortState } from '@/lib/list-state';
import { formatCurrencyArs, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { GeoRegionRow, GeoResponse } from '@/lib/types';

export const metadata = { title: 'Datapp · Regions' };

type MapMetric = 'revenue' | 'customers' | 'orders';

const SORT_FIELDS = [
  'region_name',
  'customers',
  'buyers',
  'orders',
  'revenue',
] as const;

type SortField = (typeof SORT_FIELDS)[number];

const DEFAULT_SORT: SortState<SortField> = { field: 'revenue', dir: 'desc' };

interface PageProps {
  searchParams: Promise<{
    window?: string;
    metric?: string;
    q?: string;
    sort?: string;
    dir?: string;
    hide_inactive?: string;
  }>;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Compare regions by the requested column. Numeric fields cast to
 * Number once (revenue arrives as a Decimal-string from the API);
 * region_name uses locale-insensitive collation by stripping accents
 * so "Córdoba" sorts where users expect it.
 */
function compareRegions(a: GeoRegionRow, b: GeoRegionRow, field: SortField): number {
  switch (field) {
    case 'region_name':
      return normalize(a.region_name).localeCompare(normalize(b.region_name));
    case 'customers':
      return a.customers - b.customers;
    case 'buyers':
      return a.buyers - b.buyers;
    case 'orders':
      return a.orders - b.orders;
    case 'revenue':
      return Number(a.revenue) - Number(b.revenue);
  }
}

function applyTableFilters(
  rows: GeoRegionRow[],
  q: string,
  hideInactive: boolean,
): GeoRegionRow[] {
  const needle = normalize(q.trim());
  return rows.filter((r) => {
    if (hideInactive && r.buyers === 0) return false;
    if (needle && !normalize(r.region_name).includes(needle)) return false;
    return true;
  });
}

function pickMetric(raw: string | undefined): MapMetric {
  return raw === 'customers' || raw === 'orders' ? raw : 'revenue';
}

const PRESETS = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: 'all', days: null },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

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
  const sp = await searchParams;
  const windowParam = sp.window ?? '7d';
  const metric = pickMetric(sp.metric);
  const q = sp.q ?? '';
  const hideInactive = sp.hide_inactive === '1';
  const sort = parseSort<SortField>(sp, SORT_FIELDS, DEFAULT_SORT);

  const range = rangeFromPreset(windowParam);
  const params = new URLSearchParams({ from: range.from, to: range.to, country: 'AR' });
  const result = await cachedApiFetch<GeoResponse>(
    `/v1/admin/analytics/geo?${params.toString()}`,
  );

  // Bars in the table reflect the *visible* set, so the leader gets a
  // full bar regardless of whether other provinces are filtered out.
  const filtered = applyTableFilters(result.data, q, hideInactive);
  const sorted = [...filtered].sort((a, b) => {
    const cmp = compareRegions(a, b, sort.field);
    return sort.dir === 'asc' ? cmp : -cmp;
  });
  const maxRevenue = sorted.reduce((max, row) => Math.max(max, Number(row.revenue)), 0);
  const maxCustomers = sorted.reduce((max, row) => Math.max(max, row.customers), 0);

  const currentParams: Record<string, string | string[] | undefined> = {
    window: windowParam,
    metric: metric === 'revenue' ? undefined : metric,
    q,
    hide_inactive: hideInactive ? '1' : undefined,
    sort: sort.field === DEFAULT_SORT.field ? undefined : sort.field,
    dir: sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir ? undefined : sort.dir,
  };

  const metricHref = (m: MapMetric): string =>
    buildListHref('/regions', currentParams, { metric: m === 'revenue' ? undefined : m });

  const windowHref = (w: string): string =>
    buildListHref('/regions', currentParams, { window: w });

  const toggleHideInactiveHref = buildListHref('/regions', currentParams, {
    hide_inactive: hideInactive ? undefined : '1',
  });

  const t = await getTranslations('regions');
  const tCommon = await getTranslations('common');
  const tPresets = await getTranslations('presets');
  const tMetrics = await getTranslations('regions.metrics');
  const locale = (await getLocale()) as Locale;

  // Drill-down: clicking a province (or its row) jumps to the orders
  // list filtered by region. We pass region_name in the URL so the
  // chip there can render without an extra round-trip to the API.
  const ordersForRegionHref = (row: { region_id: number; region_name: string }): string => {
    const next = new URLSearchParams();
    next.set('region', String(row.region_id));
    next.set('region_name', row.region_name);
    next.set('window', windowParam);
    return `/orders?${next.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            href={`/api/export/regions?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&country=AR`}
            label={tCommon('exportCsv')}
          />
          <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
            {PRESETS.map((p) => {
              const active = windowParam === p.id;
              return (
                <Link
                  key={p.id}
                  href={windowHref(p.id)}
                  className={
                    active
                      ? 'rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground'
                      : 'rounded px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground'
                  }
                >
                  {tPresets(p.id as PresetId)}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Tile label={t('tiles.customers')} value={formatNumber(result.totals.customers, locale)} />
        <Tile label={t('tiles.buyers')} value={formatNumber(result.totals.buyers, locale)} />
        <Tile label={t('tiles.orders')} value={formatNumber(result.totals.orders, locale)} />
        <Tile label={t('tiles.revenue')} value={formatCurrencyArs(result.totals.revenue, locale)} />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('mapBy')}</span>
        {(['revenue', 'customers', 'orders'] as MapMetric[]).map((m) => (
          <Link
            key={m}
            href={metricHref(m)}
            className={
              metric === m
                ? 'rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                : 'rounded-md border border-border bg-card px-3 py-1 text-xs text-foreground transition hover:bg-muted'
            }
          >
            {tMetrics(m)}
          </Link>
        ))}
      </div>

      <ArgentinaChoropleth
        data={result.data}
        metric={metric}
        hrefForRegion={ordersForRegionHref}
      />

      <form className="flex flex-wrap items-center gap-3" action="/regions">
        <input type="hidden" name="window" value={windowParam} />
        {metric !== 'revenue' && <input type="hidden" name="metric" value={metric} />}
        {hideInactive && <input type="hidden" name="hide_inactive" value="1" />}
        {sort.field !== DEFAULT_SORT.field && <input type="hidden" name="sort" value={sort.field} />}
        {!(sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir) && (
          <input type="hidden" name="dir" value={sort.dir} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t('searchPlaceholder')}
          className="block w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          {tCommon('search')}
        </button>
        {q && (
          <Link
            href={buildListHref('/regions', currentParams, { q: undefined })}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            {tCommon('clear')}
          </Link>
        )}
        <Link
          href={toggleHideInactiveHref}
          className={
            hideInactive
              ? 'inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/20'
              : 'inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition hover:bg-muted'
          }
        >
          <span aria-hidden="true">{hideInactive ? '☑' : '☐'}</span>
          {t('hideInactive')}
        </Link>
        <span className="text-xs text-muted-foreground">
          {t('showing', {
            shown: formatNumber(sorted.length, locale),
            total: formatNumber(result.data.length, locale),
          })}
        </span>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="w-10 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.rank')}
              </th>
              <th className="w-12 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.code')}
              </th>
              <th className="px-3 py-3">
                <SortableHeader
                  field="region_name"
                  current={sort}
                  defaultDir="asc"
                  basePath="/regions"
                  currentParams={currentParams}
                >
                  {t('table.province')}
                </SortableHeader>
              </th>
              <th className="px-3 py-3">
                <SortableHeader
                  field="customers"
                  current={sort}
                  align="right"
                  basePath="/regions"
                  currentParams={currentParams}
                >
                  {t('table.customers')}
                </SortableHeader>
              </th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.customerShare')}
              </th>
              <th className="px-3 py-3">
                <SortableHeader
                  field="buyers"
                  current={sort}
                  align="right"
                  basePath="/regions"
                  currentParams={currentParams}
                >
                  {t('table.buyers')}
                </SortableHeader>
              </th>
              <th className="px-3 py-3">
                <SortableHeader
                  field="orders"
                  current={sort}
                  align="right"
                  basePath="/regions"
                  currentParams={currentParams}
                >
                  {t('table.orders')}
                </SortableHeader>
              </th>
              <th className="px-3 py-3">
                <SortableHeader
                  field="revenue"
                  current={sort}
                  align="right"
                  basePath="/regions"
                  currentParams={currentParams}
                >
                  {t('table.revenue')}
                </SortableHeader>
              </th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.revenueShare')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {sorted.map((row, i) => (
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
                <td className="px-3 py-3">
                  <Link
                    href={ordersForRegionHref(row)}
                    className="text-foreground hover:text-primary hover:underline"
                  >
                    {row.region_name}
                  </Link>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground/80">
                  {formatNumber(row.customers, locale)}
                </td>
                <td className="px-3 py-3">
                  <Bar value={row.customers} max={maxCustomers} tone="primary" />
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatNumber(row.buyers, locale)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatNumber(row.orders, locale)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-foreground">
                  {formatCurrencyArs(row.revenue, locale)}
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
            {t('unmatched', { count: result.unmatched.length })}
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">{t('unmatchedSubtitle')}</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">{t('unmatchedTable.regionRaw')}</th>
                <th className="px-3 py-2 font-semibold">{t('unmatchedTable.city')}</th>
                <th className="px-3 py-2 font-semibold">{t('unmatchedTable.postal')}</th>
                <th className="px-3 py-2 text-right font-semibold">
                  {t('unmatchedTable.occurrences')}
                </th>
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
                    {formatNumber(row.occurrences, locale)}
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
