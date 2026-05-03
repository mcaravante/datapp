import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { ExportButton } from '@/components/export-button';
import { Pagination } from '@/components/pagination';
import { SortableHeader } from '@/components/sortable-header';
import { buildListHref, parseSort, type SortState } from '@/lib/list-state';
import { formatBuenosAires, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { CustomerListPage, RfmSegmentLabel } from '@/lib/types';

export const metadata = { title: 'Datapp · Customers' };

const SORT_FIELDS = [
  'email',
  'magento_updated_at',
  'magento_created_at',
  'customer_group',
] as const;

type SortField = (typeof SORT_FIELDS)[number];

const DEFAULT_SORT: SortState<SortField> = { field: 'magento_updated_at', dir: 'desc' };

const RFM_SEGMENTS: readonly RfmSegmentLabel[] = [
  'champions',
  'loyal',
  'potential_loyalists',
  'new_customers',
  'promising',
  'needing_attention',
  'about_to_sleep',
  'at_risk',
  'cannot_lose_them',
  'hibernating',
  'lost',
];

interface PageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
    customer_group?: string;
    rfm_segment?: string | string[];
  }>;
}

interface FacetsResponse {
  customer_groups: string[];
}

export default async function CustomersListPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const q = sp.q ?? '';
  const pageParam = sp.page ?? '1';
  const limit = sp.limit ?? '50';
  const customerGroup = sp.customer_group;
  const rfmFilter = parseRfmFilter(sp.rfm_segment);
  const sort = parseSort<SortField>(sp, SORT_FIELDS, DEFAULT_SORT);

  const apiParams = new URLSearchParams();
  if (q) apiParams.set('q', q);
  apiParams.set('page', pageParam);
  apiParams.set('limit', limit);
  if (customerGroup) apiParams.set('customer_group', customerGroup);
  for (const seg of rfmFilter) apiParams.append('rfm_segment', seg);
  apiParams.set('sort', sort.field);
  apiParams.set('dir', sort.dir);

  // List + facets fetched in parallel — facets are tenant-cached so this is cheap.
  const [result, facets] = await Promise.all([
    apiFetch<CustomerListPage>(`/v1/admin/customers?${apiParams.toString()}`),
    apiFetch<FacetsResponse>('/v1/admin/customers/facets'),
  ]);

  const currentParams: Record<string, string | string[] | undefined> = {
    q,
    limit,
    customer_group: customerGroup,
    rfm_segment: rfmFilter.length > 0 ? rfmFilter : undefined,
    sort: sort.field === DEFAULT_SORT.field ? undefined : sort.field,
    dir: sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir ? undefined : sort.dir,
  };

  const buildFilterHref = (overrides: Record<string, string | string[] | undefined>): string =>
    buildListHref('/customers', currentParams, { ...overrides, page: undefined });

  const buildPageHref = (overrides: { page?: number; limit?: number }) =>
    buildListHref('/customers', currentParams, {
      page: overrides.page !== undefined ? String(overrides.page) : String(result.page),
      limit: overrides.limit !== undefined ? String(overrides.limit) : String(result.limit),
    });

  const exportParams = new URLSearchParams();
  if (q) exportParams.set('q', q);
  if (customerGroup) exportParams.set('customer_group', customerGroup);
  for (const seg of rfmFilter) exportParams.append('rfm_segment', seg);
  const exportHref = `/api/export/customers${
    exportParams.toString() ? `?${exportParams.toString()}` : ''
  }`;

  const segmentParams = new URLSearchParams();
  if (q) segmentParams.set('q', q);
  if (customerGroup) segmentParams.set('customer_group', customerGroup);
  for (const seg of rfmFilter) segmentParams.append('rfm_segment', seg);
  const segmentHref = `/segments/new${
    segmentParams.toString() ? `?${segmentParams.toString()}` : ''
  }`;

  const t = await getTranslations('customers');
  const tCommon = await getTranslations('common');
  const tRfm = await getTranslations('segments.rfmLabels');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex items-baseline justify-between">
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
          <Link
            href={segmentHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-soft transition hover:bg-muted"
          >
            <BookmarkIcon className="h-3.5 w-3.5" />
            {t('saveAsSegment')}
          </Link>
          <ExportButton href={exportHref} label={tCommon('exportCsv')} />
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/customers">
        {customerGroup && <input type="hidden" name="customer_group" value={customerGroup} />}
        {rfmFilter.map((s) => (
          <input key={s} type="hidden" name="rfm_segment" value={s} />
        ))}
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

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <FilterDropdown
          label={t('groupLabel')}
          name="customer_group"
          value={customerGroup ?? ''}
          options={facets.customer_groups.map((g) => ({ value: g, label: g }))}
          basePath="/customers"
          currentParams={currentParams}
        />
        <FilterDropdown
          label={t('rfmLabel')}
          name="rfm_segment"
          value={rfmFilter[0] ?? ''}
          options={RFM_SEGMENTS.map((s) => ({ value: s, label: tRfm(s) }))}
          basePath="/customers"
          currentParams={currentParams}
        />
        {(customerGroup || rfmFilter.length > 0) && (
          <Link
            href={buildFilterHref({ customer_group: undefined, rfm_segment: undefined })}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {tCommon('clear')}
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-4 py-3">
                <SortableHeader
                  field="email"
                  current={sort}
                  defaultDir="asc"
                  basePath="/customers"
                  currentParams={currentParams}
                >
                  {t('table.email')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.name')}
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="customer_group"
                  current={sort}
                  defaultDir="asc"
                  basePath="/customers"
                  currentParams={currentParams}
                >
                  {t('table.group')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.magentoId')}
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="magento_updated_at"
                  current={sort}
                  basePath="/customers"
                  currentParams={currentParams}
                >
                  {t('table.updated')}
                </SortableHeader>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {result.data.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${c.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    {c.email}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground/80">
                  {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.customer_group ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {c.magento_customer_id}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.magento_updated_at ? formatBuenosAires(c.magento_updated_at, locale) : '—'}
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

function BookmarkIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
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

function parseRfmFilter(raw: string | string[] | undefined): RfmSegmentLabel[] {
  if (!raw) return [];
  const candidates = Array.isArray(raw) ? raw : [raw];
  const allowed = new Set<string>(RFM_SEGMENTS);
  return candidates.filter((c): c is RfmSegmentLabel => allowed.has(c));
}

interface DropdownOption {
  value: string;
  label: string;
}

/**
 * URL-driven select. Submitting via Form would need client JS just to
 * navigate on change, so we render an HTML <select> wrapped in a form
 * that points at the page itself — picks a value, hits "apply", and we
 * land back here with the new query string. The form preserves every
 * other current param via hidden inputs computed from `currentParams`.
 */
function FilterDropdown({
  label,
  name,
  value,
  options,
  basePath,
  currentParams,
}: {
  label: string;
  name: string;
  value: string;
  options: DropdownOption[];
  basePath: string;
  currentParams: Record<string, string | string[] | undefined>;
}): React.ReactElement {
  const hidden: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(currentParams)) {
    if (k === name || k === 'page' || v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) hidden.push({ key: k, value: item });
    } else if (v.length > 0) {
      hidden.push({ key: k, value: v });
    }
  }
  return (
    <form action={basePath} className="inline-flex items-center gap-1.5">
      {hidden.map((h, i) => (
        <input key={`${h.key}-${i}`} type="hidden" name={h.key} value={h.value} />
      ))}
      <label className="text-muted-foreground" htmlFor={`filter-${name}`}>
        {label}
      </label>
      <select
        id={`filter-${name}`}
        name={name}
        defaultValue={value}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground transition hover:bg-muted"
      >
        ↵
      </button>
    </form>
  );
}

