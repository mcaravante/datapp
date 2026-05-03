import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { cachedApiFetch } from '@/lib/cached-api-fetch';
import { ExportButton } from '@/components/export-button';
import { SortableHeader } from '@/components/sortable-header';
import { buildListHref, parseSort, type SortState } from '@/lib/list-state';
import { formatCurrencyArs, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { TopProductsResponse, TopProductsSortField } from '@/lib/types';

export const metadata = { title: 'Datapp · Top products' };

interface PageProps {
  searchParams: Promise<{
    window?: string;
    q?: string;
    sort?: string;
    dir?: string;
    limit?: string;
  }>;
}

const PRESETS = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: '365d', days: 365 },
  { id: 'all', days: null },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

const SORT_FIELDS: readonly TopProductsSortField[] = ['revenue', 'units', 'orders', 'sku', 'name'];
const DEFAULT_SORT: SortState<TopProductsSortField> = { field: 'revenue', dir: 'desc' };

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
  const sp = await searchParams;
  const windowParam = sp.window ?? '7d';
  const limit = sp.limit ?? '50';
  const q = sp.q ?? '';
  const sort = parseSort<TopProductsSortField>(sp, SORT_FIELDS, DEFAULT_SORT);
  const range = rangeFromPreset(windowParam);

  const apiParams = new URLSearchParams({
    from: range.from,
    to: range.to,
    sort: sort.field,
    dir: sort.dir,
    limit,
  });
  if (q) apiParams.set('q', q);

  const result = await cachedApiFetch<TopProductsResponse>(
    `/v1/admin/analytics/top-products?${apiParams.toString()}`,
  );

  const currentParams: Record<string, string | string[] | undefined> = {
    window: windowParam,
    limit,
    q,
    sort: sort.field === DEFAULT_SORT.field ? undefined : sort.field,
    dir: sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir ? undefined : sort.dir,
  };

  const buildFilterHref = (overrides: Record<string, string | undefined>): string =>
    buildListHref('/products', currentParams, overrides);

  // Bars compare by the active sort metric — when sorting by sku/name, fall
  // back to revenue so the visualization stays meaningful.
  const barMetric: 'revenue' | 'units' = sort.field === 'units' ? 'units' : 'revenue';
  const maxBar = result.data.reduce(
    (max, row) => Math.max(max, barMetric === 'units' ? row.units : Number(row.revenue)),
    0,
  );

  const exportQs = new URLSearchParams({
    from: range.from,
    to: range.to,
    sort: sort.field,
    dir: sort.dir,
    limit: '50000',
  });
  if (q) exportQs.set('q', q);

  const t = await getTranslations('products');
  const tCommon = await getTranslations('common');
  const tPresets = await getTranslations('presets');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            href={`/api/export/products?${exportQs.toString()}`}
            label={tCommon('exportCsv')}
          />
          <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
            {PRESETS.map((p) => {
              const active = windowParam === p.id;
              return (
                <Link
                  key={p.id}
                  href={buildFilterHref({ window: p.id })}
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

      <form className="flex flex-wrap items-center gap-2" action="/products">
        <input type="hidden" name="window" value={windowParam} />
        {sort.field !== DEFAULT_SORT.field && <input type="hidden" name="sort" value={sort.field} />}
        {!(sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir) && (
          <input type="hidden" name="dir" value={sort.dir} />
        )}
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            className="block w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          {tCommon('search')}
        </button>
        {q && (
          <Link
            href={buildFilterHref({ q: undefined })}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            {tCommon('clear')}
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="w-12 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.rank')}
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="name"
                  current={sort}
                  defaultDir="asc"
                  basePath="/products"
                  currentParams={currentParams}
                >
                  {t('table.product')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="sku"
                  current={sort}
                  defaultDir="asc"
                  basePath="/products"
                  currentParams={currentParams}
                >
                  {t('table.sku')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="units"
                  current={sort}
                  align="right"
                  basePath="/products"
                  currentParams={currentParams}
                >
                  {t('table.units')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="revenue"
                  current={sort}
                  align="right"
                  basePath="/products"
                  currentParams={currentParams}
                >
                  {t('table.revenue')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="orders"
                  current={sort}
                  align="right"
                  basePath="/products"
                  currentParams={currentParams}
                >
                  {t('table.orders')}
                </SortableHeader>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {result.data.map((row, i) => {
              const value = barMetric === 'units' ? row.units : Number(row.revenue);
              const pct = maxBar > 0 ? Math.min(100, (value / maxBar) * 100) : 0;
              return (
                <tr
                  key={row.sku}
                  className="relative border-b border-border last:border-0 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <Link
                      href={`/products/${encodeURIComponent(row.sku)}`}
                      className="hover:text-primary hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    <Link
                      href={`/products/${encodeURIComponent(row.sku)}`}
                      className="hover:text-primary hover:underline"
                    >
                      {row.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground/80">
                    {formatNumber(row.units, locale)}
                  </td>
                  <td className="relative px-4 py-3 text-right">
                    <div className="relative inline-flex items-center justify-end gap-2">
                      <span className="tabular-nums font-medium text-foreground">
                        {formatCurrencyArs(row.revenue, locale)}
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

function SearchIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
