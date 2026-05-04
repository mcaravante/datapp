import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { ExportButton } from '@/components/export-button';
import { Pagination } from '@/components/pagination';
import { SortableHeader } from '@/components/sortable-header';
import { TimeRangeSelector, type RangePresetId } from '@/components/time-range-selector';
import { formatBuenosAires, formatCurrency, formatNumber } from '@/lib/format';
import { buildListHref, parseSort, type SortState } from '@/lib/list-state';
import type { Locale } from '@/i18n/config';
import type { OrderListPage } from '@/lib/types';

export const metadata = { title: 'Datapp · Orders' };

interface PageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    limit?: string;
    status?: string | string[];
    window?: string;
    sort?: string;
    dir?: string;
    region?: string;
    region_name?: string;
  }>;
}

const SORT_FIELDS = [
  'placed_at',
  'grand_total',
  'magento_order_number',
  'customer_email',
  'status',
  'item_count',
] as const;

type SortField = (typeof SORT_FIELDS)[number];

const DEFAULT_SORT: SortState<SortField> = { field: 'placed_at', dir: 'desc' };

const PRESETS = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: '365d', days: 365 },
  { id: 'all', days: null },
] as const;


const STATUS_FILTERS = [
  'all',
  'pending',
  'processing',
  'complete',
  'canceled',
  'closed',
  'holded',
] as const;

type StatusFilterId = (typeof STATUS_FILTERS)[number];

function rangeFromPreset(presetId: string): { from?: string; to?: string } {
  const to = new Date();
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1];
  if (!preset || preset.days === null) return {};
  const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  processing: 'bg-info/15 text-info',
  complete: 'bg-success/15 text-success',
  closed: 'bg-muted text-muted-foreground',
  canceled: 'bg-destructive/15 text-destructive',
  holded: 'bg-accent/15 text-accent',
  fraud: 'bg-destructive/15 text-destructive',
  payment_review: 'bg-warning/15 text-warning',
};

function statusToneClass(status: string): string {
  return STATUS_TONE[status] ?? 'bg-muted text-muted-foreground';
}

export default async function OrdersListPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const q = sp.q ?? '';
  const pageParam = sp.page ?? '1';
  const limit = sp.limit ?? '50';
  const windowParam = sp.window ?? '30d';
  const statusFilter = sp.status === 'all' || sp.status === undefined ? null : sp.status;
  const region = sp.region;
  const regionName = sp.region_name;
  const sort = parseSort<SortField>(sp, SORT_FIELDS, DEFAULT_SORT);

  const range = rangeFromPreset(windowParam);

  // Live params shipped to the API. Always includes sort/dir so the
  // server applies the same orderBy the user is staring at.
  const apiParams = new URLSearchParams();
  if (q) apiParams.set('q', q);
  apiParams.set('page', pageParam);
  apiParams.set('limit', limit);
  if (range.from) apiParams.set('from', range.from);
  if (range.to) apiParams.set('to', range.to);
  if (typeof statusFilter === 'string') apiParams.set('status', statusFilter);
  if (Array.isArray(statusFilter)) statusFilter.forEach((s) => apiParams.append('status', s));
  if (region) apiParams.set('region', region);
  apiParams.set('sort', sort.field);
  apiParams.set('dir', sort.dir);

  const result = await apiFetch<OrderListPage>(`/v1/admin/orders?${apiParams.toString()}`);

  // The set of search params currently in the URL — used by sort/filter/page
  // links to preserve everything the user already chose.
  const currentParams: Record<string, string | string[] | undefined> = {
    q,
    window: windowParam,
    limit,
    status: typeof statusFilter === 'string' ? statusFilter : undefined,
    region,
    region_name: regionName,
    sort: sort.field === DEFAULT_SORT.field ? undefined : sort.field,
    dir: sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir ? undefined : sort.dir,
  };

  // Filter / search / window changes reset page to 1; pagination keeps it.
  const buildFilterHref = (overrides: Record<string, string | undefined>): string =>
    buildListHref('/orders', currentParams, { ...overrides, page: undefined });

  const buildPageHref = (overrides: { page?: number; limit?: number }): string =>
    buildListHref('/orders', currentParams, {
      page: overrides.page !== undefined ? String(overrides.page) : String(result.page),
      limit: overrides.limit !== undefined ? String(overrides.limit) : String(result.limit),
    });

  const activeStatus =
    typeof statusFilter === 'string' ? statusFilter : statusFilter === null ? 'all' : 'all';

  const exportQs = new URLSearchParams();
  if (q) exportQs.set('q', q);
  if (typeof statusFilter === 'string') exportQs.set('status', statusFilter);
  if (range.from) exportQs.set('from', range.from);
  if (range.to) exportQs.set('to', range.to);
  if (region) exportQs.set('region', region);
  const exportHref = `/api/export/orders${exportQs.toString() ? `?${exportQs.toString()}` : ''}`;

  const t = await getTranslations('orders');
  const tCommon = await getTranslations('common');
  const tStatus = await getTranslations('orders.statusFilters');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('onThisPageOf', {
              count: formatNumber(result.data.length, locale),
              total: formatNumber(result.total_count, locale),
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href={exportHref} label={tCommon('exportCsv')} />
          <TimeRangeSelector
            presets={['7d', '30d', '90d', '365d', 'all']}
            basePath="/orders"
            currentParams={{ ...currentParams, page: undefined }}
            active={windowParam as RangePresetId}
          />
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/orders">
        <input type="hidden" name="window" value={windowParam} />
        {typeof statusFilter === 'string' && (
          <input type="hidden" name="status" value={statusFilter} />
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
            href={buildFilterHref({ q: undefined, page: undefined })}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            {tCommon('clear')}
          </Link>
        )}
      </form>

      {region && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('regionLabel')}</span>
          <Link
            href={buildFilterHref({ region: undefined, region_name: undefined })}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/20"
          >
            <span>{regionName ?? `#${region}`}</span>
            <span aria-hidden="true" className="text-base leading-none">
              ×
            </span>
            <span className="sr-only">{tCommon('clear')}</span>
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('statusLabel')}</span>
        {STATUS_FILTERS.map((id) => {
          const active = activeStatus === id;
          return (
            <Link
              key={id}
              href={buildFilterHref({ status: id === 'all' ? undefined : id, page: undefined })}
              className={
                active
                  ? 'rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-md border border-border bg-card px-3 py-1 text-xs text-foreground transition hover:bg-muted'
              }
            >
              {tStatus(id as StatusFilterId)}
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-4 py-3">
                <SortableHeader
                  field="magento_order_number"
                  current={sort}
                  basePath="/orders"
                  currentParams={currentParams}
                >
                  {t('table.orderNumber')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="placed_at"
                  current={sort}
                  basePath="/orders"
                  currentParams={currentParams}
                >
                  {t('table.placed')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="customer_email"
                  current={sort}
                  defaultDir="asc"
                  basePath="/orders"
                  currentParams={currentParams}
                >
                  {t('table.customer')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="status"
                  current={sort}
                  defaultDir="asc"
                  basePath="/orders"
                  currentParams={currentParams}
                >
                  {t('table.status')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="item_count"
                  current={sort}
                  align="right"
                  basePath="/orders"
                  currentParams={currentParams}
                >
                  {t('table.items')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="grand_total"
                  current={sort}
                  align="right"
                  basePath="/orders"
                  currentParams={currentParams}
                >
                  {t('table.total')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.realRevenue')}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {result.data.map((o) => (
              <tr
                key={o.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-mono text-xs font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {o.magento_order_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatBuenosAires(o.placed_at, locale)}
                </td>
                <td className="px-4 py-3">
                  {o.customer_id ? (
                    <Link
                      href={`/customers/${o.customer_id}`}
                      className="text-foreground/80 hover:text-primary hover:underline"
                    >
                      {o.customer_name ?? o.customer_email}
                    </Link>
                  ) : (
                    <span className="text-foreground/80">{o.customer_email}</span>
                  )}
                  {o.customer_name && (
                    <div className="text-xs text-muted-foreground">{o.customer_email}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusToneClass(o.status)}`}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground/80">
                  {formatNumber(o.item_count, locale)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                  {formatCurrency(o.grand_total, o.currency_code, locale)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {o.real_revenue ? formatCurrency(o.real_revenue, o.currency_code, locale) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={result.page}
        totalPages={result.total_pages}
        totalCount={result.total_count}
        limit={result.limit}
        buildHref={buildPageHref}
      />
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
