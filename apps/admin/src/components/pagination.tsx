import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';

interface PaginationProps {
  /** Current page (1-indexed). */
  page: number;
  /** Total pages. */
  totalPages: number;
  /** Total rows across all pages. */
  totalCount: number;
  /** Rows per page. */
  limit: number;
  /** Builds an href for a target page / limit. Caller controls base URL + query params. */
  buildHref: (overrides: { page?: number; limit?: number }) => string;
}

const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;

/**
 * Footer pagination with: total counter ("X–Y of N"), Prev/Next, current page
 * indicator and a per-page selector. Server Component — caller is responsible
 * for constructing hrefs that preserve other query params (search, filters).
 */
export async function Pagination({
  page,
  totalPages,
  totalCount,
  limit,
  buildHref,
}: PaginationProps): Promise<React.ReactElement | null> {
  const t = await getTranslations('pagination');
  const locale = (await getLocale()) as Locale;

  if (totalCount === 0) return null;

  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const fromRow = (safePage - 1) * limit + 1;
  const toRow = Math.min(safePage * limit, totalCount);

  const prevDisabled = safePage <= 1;
  const nextDisabled = safePage >= safeTotalPages;

  return (
    <nav
      aria-label={t('label')}
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="tabular-nums">
          {t('range', {
            from: formatNumber(fromRow, locale),
            to: formatNumber(toRow, locale),
            total: formatNumber(totalCount, locale),
          })}
        </span>
        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
        <label className="hidden items-center gap-2 sm:flex">
          <span className="text-xs text-muted-foreground">{t('perPage')}</span>
          <div className="flex gap-1 rounded-md border border-border bg-card p-0.5 text-xs shadow-soft">
            {PAGE_SIZE_OPTIONS.map((size) => {
              const active = size === limit;
              return (
                <Link
                  key={size}
                  href={buildHref({ limit: size, page: 1 })}
                  className={
                    active
                      ? 'rounded bg-primary px-2 py-1 font-medium text-primary-foreground'
                      : 'rounded px-2 py-1 text-muted-foreground transition hover:bg-muted hover:text-foreground'
                  }
                >
                  {size}
                </Link>
              );
            })}
          </div>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <PageButton
          href={prevDisabled ? null : buildHref({ page: safePage - 1 })}
          label={t('prev')}
          direction="prev"
        />
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('pageOf', {
            page: formatNumber(safePage, locale),
            total: formatNumber(safeTotalPages, locale),
          })}
        </span>
        <PageButton
          href={nextDisabled ? null : buildHref({ page: safePage + 1 })}
          label={t('next')}
          direction="next"
        />
      </div>
    </nav>
  );
}

function PageButton({
  href,
  label,
  direction,
}: {
  href: string | null;
  label: string;
  direction: 'prev' | 'next';
}): React.ReactElement {
  const arrow = direction === 'prev' ? '←' : '→';
  const className =
    href === null
      ? 'pointer-events-none cursor-not-allowed rounded-md border border-border bg-muted/30 px-3 py-1.5 text-muted-foreground/60'
      : 'rounded-md border border-border bg-card px-3 py-1.5 text-foreground transition hover:bg-muted';
  if (href === null) {
    return (
      <span aria-disabled="true" className={className}>
        {direction === 'prev' ? `${arrow} ${label}` : `${label} ${arrow}`}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {direction === 'prev' ? `${arrow} ${label}` : `${label} ${arrow}`}
    </Link>
  );
}
