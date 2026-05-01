import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { ExportButton } from '@/components/export-button';
import { Pagination } from '@/components/pagination';
import { formatBuenosAires, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { CustomerListPage } from '@/lib/types';

export const metadata = { title: 'Datapp · Customers' };

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; limit?: string }>;
}

export default async function CustomersListPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { q = '', page: pageParam = '1', limit = '50' } = await searchParams;

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', pageParam);
  params.set('limit', limit);

  const result = await apiFetch<CustomerListPage>(`/v1/admin/customers?${params.toString()}`);

  const buildHref = (overrides: { page?: number; limit?: number }) => {
    const next = new URLSearchParams(params);
    if (overrides.page !== undefined) next.set('page', String(overrides.page));
    if (overrides.limit !== undefined) next.set('limit', String(overrides.limit));
    const qs = next.toString();
    return qs ? `/customers?${qs}` : '/customers';
  };

  const exportParams = new URLSearchParams();
  if (q) exportParams.set('q', q);
  const exportHref = `/api/export/customers${
    exportParams.toString() ? `?${exportParams.toString()}` : ''
  }`;

  const segmentParams = new URLSearchParams();
  if (q) segmentParams.set('q', q);
  const segmentHref = `/segments/new${
    segmentParams.toString() ? `?${segmentParams.toString()}` : ''
  }`;

  const t = await getTranslations('customers');
  const tCommon = await getTranslations('common');
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

      <form className="flex gap-2" action="/customers">
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
            href="/customers"
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            {tCommon('clear')}
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t('table.email')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.name')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.group')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.magentoId')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.updated')}</th>
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
        buildHref={buildHref}
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

