import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { SortableHeader } from '@/components/sortable-header';
import { parseSort, type SortState } from '@/lib/list-state';
import { formatBuenosAires, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { CustomerGroupSummary, CustomerGroupsListResponse } from '@/lib/types';
import { SyncButton } from './sync-button';

export const metadata = { title: 'Datapp · Customer groups' };

const SORT_FIELDS = ['name', 'magento_group_id', 'member_count', 'synced_at'] as const;
type SortField = (typeof SORT_FIELDS)[number];
const DEFAULT_SORT: SortState<SortField> = { field: 'magento_group_id', dir: 'asc' };

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function compareGroups(
  a: CustomerGroupSummary,
  b: CustomerGroupSummary,
  field: SortField,
): number {
  switch (field) {
    case 'name':
      return normalize(a.name).localeCompare(normalize(b.name));
    case 'magento_group_id':
      return a.magento_group_id - b.magento_group_id;
    case 'member_count':
      return a.member_count - b.member_count;
    case 'synced_at':
      return new Date(a.synced_at).getTime() - new Date(b.synced_at).getTime();
  }
}

interface PageProps {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}

export default async function CustomerGroupsListPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const sort = parseSort<SortField>(sp, SORT_FIELDS, DEFAULT_SORT);

  const { data: groups } = await apiFetch<CustomerGroupsListResponse>('/v1/admin/customer-groups');

  const sorted = [...groups].sort((a, b) => {
    const cmp = compareGroups(a, b, sort.field);
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const currentParams: Record<string, string | string[] | undefined> = {
    sort: sort.field === DEFAULT_SORT.field ? undefined : sort.field,
    dir: sort.field === DEFAULT_SORT.field && sort.dir === DEFAULT_SORT.dir ? undefined : sort.dir,
  };

  const t = await getTranslations('segments');
  const locale = (await getLocale()) as Locale;

  // Last sync wall-clock — same value across rows since the cron writes
  // them all in one shot, so surface it once at the top instead of in
  // every row's right-hand cell.
  const lastSyncedAt = sorted.reduce<string | null>((latest, g) => {
    if (!latest) return g.synced_at;
    return new Date(g.synced_at) > new Date(latest) ? g.synced_at : latest;
  }, null);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle', {
              when: lastSyncedAt ? formatBuenosAires(lastSyncedAt, locale) : '—',
            })}
          </p>
        </div>
        <SyncButton />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-4 py-3">
                <SortableHeader
                  field="magento_group_id"
                  current={sort}
                  defaultDir="asc"
                  basePath="/segments"
                  currentParams={currentParams}
                >
                  {t('table.id')}
                </SortableHeader>
              </th>
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
                {t('table.taxClass')}
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
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {sorted.map((g) => (
              <tr
                key={g.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/40"
              >
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground tabular-nums">
                  {g.magento_group_id}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/segments/${g.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {g.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {g.tax_class_name ?? '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                  {formatNumber(g.member_count, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
