import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ApiError, apiFetch } from '@/lib/api-client';
import { Pagination } from '@/components/pagination';
import { formatBuenosAires, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type {
  CustomerGroupMembersPage,
  CustomerGroupSummary,
} from '@/lib/types';

export const metadata = { title: 'Datapp · Customer group' };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

function clampPage(raw: string | undefined): number {
  const parsed = Number(raw ?? '1');
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(Math.floor(parsed), 10_000);
}

const PAGE_SIZE = 20;

export default async function CustomerGroupDetailPage({
  params,
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { id } = await params;
  const sp = await searchParams;
  const page = clampPage(sp.page);

  let group: CustomerGroupSummary;
  try {
    group = await apiFetch<CustomerGroupSummary>(`/v1/admin/customer-groups/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const members = await apiFetch<CustomerGroupMembersPage>(
    `/v1/admin/customer-groups/${id}/members?page=${page.toString()}&limit=${PAGE_SIZE.toString()}`,
  );

  const t = await getTranslations('segments.detail');
  const tSegments = await getTranslations('segments');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link
          href="/segments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← {tSegments('title')}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {group.name}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('magentoIdLabel', { id: group.magento_group_id })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          label={t('members')}
          value={formatNumber(group.member_count, locale)}
          accent="primary"
        />
        <Tile label={t('taxClass')} value={group.tax_class_name ?? '—'} />
        <Tile
          label={t('lastSyncedAt')}
          value={formatBuenosAires(group.synced_at, locale)}
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('membersHeading', { count: formatNumber(group.member_count, locale) })}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('membersSubtitle', { count: members.data.length })}
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">{t('table.email')}</th>
              <th className="px-4 py-2 font-semibold">{t('table.name')}</th>
              <th className="px-4 py-2 font-semibold">{t('table.created')}</th>
            </tr>
          </thead>
          <tbody>
            {members.data.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            )}
            {members.data.map((m) => (
              <tr
                key={m.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/30"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/customers/${m.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {m.email}
                  </Link>
                </td>
                <td className="px-4 py-2 text-foreground/80">
                  {[m.first_name, m.last_name].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {m.magento_created_at ? formatBuenosAires(m.magento_created_at, locale) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.total_pages > 1 && (
          <div className="border-t border-border bg-muted/20 px-5 py-3">
            <Pagination
              page={members.page}
              totalPages={members.total_pages}
              totalCount={members.total_count}
              limit={members.limit}
              buildHref={(overrides) => {
                const params = new URLSearchParams();
                if (overrides.page && overrides.page !== 1) {
                  params.set('page', String(overrides.page));
                }
                const qs = params.toString();
                return qs ? `/segments/${id}?${qs}` : `/segments/${id}`;
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  accent = 'muted',
}: {
  label: string;
  value: string;
  accent?: 'primary' | 'muted';
}): React.ReactElement {
  const tone = accent === 'primary' ? 'border-l-4 border-l-primary' : '';
  return (
    <div
      className={`rounded-lg border border-border bg-card p-5 shadow-card transition hover:shadow-elevated ${tone}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
