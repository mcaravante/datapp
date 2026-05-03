import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { SortableHeader } from '@/components/sortable-header';
import { buildListHref, parseSort, type SortState } from '@/lib/list-state';
import { formatBuenosAires, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { SegmentSummary, SegmentsListResponse } from '@/lib/types';

export const metadata = { title: 'Datapp · Segments' };

const RFM_LABEL_KEYS = [
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
] as const;
type RfmLabelKey = (typeof RFM_LABEL_KEYS)[number];

function isRfmLabelKey(value: string): value is RfmLabelKey {
  return (RFM_LABEL_KEYS as readonly string[]).includes(value);
}

const SORT_FIELDS = ['name', 'member_count', 'updated_at', 'created_at'] as const;
type SortField = (typeof SORT_FIELDS)[number];
const DEFAULT_SORT: SortState<SortField> = { field: 'updated_at', dir: 'desc' };

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function compareSegments(a: SegmentSummary, b: SegmentSummary, field: SortField): number {
  switch (field) {
    case 'name':
      return normalize(a.name).localeCompare(normalize(b.name));
    case 'member_count':
      return a.member_count - b.member_count;
    case 'updated_at':
      return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    case 'created_at':
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }
}

function applySegmentFilter(rows: SegmentSummary[], q: string): SegmentSummary[] {
  const needle = normalize(q.trim());
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      normalize(r.name).includes(needle) || normalize(r.description ?? '').includes(needle),
  );
}

interface PageProps {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string }>;
}

export default async function SegmentsListPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const q = sp.q ?? '';
  const sort = parseSort<SortField>(sp, SORT_FIELDS, DEFAULT_SORT);

  const { data: segments } = await apiFetch<SegmentsListResponse>('/v1/admin/segments');

  const filtered = applySegmentFilter(segments, q);
  const sorted = [...filtered].sort((a, b) => {
    const cmp = compareSegments(a, b, sort.field);
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const currentParams: Record<string, string | string[] | undefined> = {
    q,
    sort: sort.field === DEFAULT_SORT.field ? undefined : sort.field,
    dir: sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir ? undefined : sort.dir,
  };

  const buildFilterHref = (overrides: Record<string, string | undefined>): string =>
    buildListHref('/segments', currentParams, overrides);

  const t = await getTranslations('segments');
  const tCommon = await getTranslations('common');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href="/segments/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t('newSegment')}
        </Link>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/segments">
        {sort.field !== DEFAULT_SORT.field && <input type="hidden" name="sort" value={sort.field} />}
        {!(sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir) && (
          <input type="hidden" name="dir" value={sort.dir} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t('searchPlaceholder')}
          className="block w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          {tCommon('search')}
        </button>
        {q && (
          <Link
            href={buildFilterHref({ q: undefined })}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            {tCommon('clear')}
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-4 py-3">
                <SortableHeader
                  field="name"
                  current={sort}
                  defaultDir="asc"
                  basePath="/segments"
                  currentParams={currentParams}
                >
                  {t('table.name')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.description')}
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.filters')}
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="member_count"
                  current={sort}
                  align="right"
                  basePath="/segments"
                  currentParams={currentParams}
                >
                  {t('table.members')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="updated_at"
                  current={sort}
                  basePath="/segments"
                  currentParams={currentParams}
                >
                  {t('table.updated')}
                </SortableHeader>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.emptyPrefix')}
                  <Link href="/segments/new" className="text-primary hover:underline">
                    {t('table.emptyAction')}
                  </Link>
                  .
                </td>
              </tr>
            )}
            {sorted.map((s) => (
              <tr
                key={s.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/segments/${s.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{s.description ?? '—'}</td>
                <td className="px-4 py-3">
                  <FilterChips definition={s.definition} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                  {formatNumber(s.member_count, locale)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatBuenosAires(s.updated_at, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FilterChips({
  definition,
}: {
  definition: { q?: string; region_id?: number[]; customer_group?: string; rfm_segment?: string[] };
}): React.ReactElement {
  const tFilters = useTranslations('segments.filters');
  const tRfm = useTranslations('segments.rfmLabels');

  const chips: React.ReactElement[] = [];
  if (definition.q) {
    chips.push(<Chip key="q" label={tFilters('search')} value={definition.q} />);
  }
  if (definition.customer_group) {
    chips.push(<Chip key="cg" label={tFilters('group')} value={definition.customer_group} />);
  }
  if (definition.region_id && definition.region_id.length > 0) {
    chips.push(
      <Chip
        key="region"
        label={tFilters('regions')}
        value={tFilters('regionsCount', { count: definition.region_id.length })}
      />,
    );
  }
  if (definition.rfm_segment && definition.rfm_segment.length > 0) {
    chips.push(
      <Chip
        key="rfm"
        label={tFilters('rfm')}
        value={definition.rfm_segment
          .map((s) => (isRfmLabelKey(s) ? tRfm(s) : s))
          .join(', ')}
      />,
    );
  }
  if (chips.length === 0) {
    return <span className="text-xs text-muted-foreground">{tFilters('all')}</span>;
  }
  return <div className="flex flex-wrap gap-1.5">{chips}</div>;
}

function Chip({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px]">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function PlusIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
