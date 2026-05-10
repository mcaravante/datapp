import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { Pagination } from '@/components/pagination';
import { SortableHeader } from '@/components/sortable-header';
import { buildListHref, parseSort, type SortState } from '@/lib/list-state';
import { formatBuenosAires, formatCurrency, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type {
  AbandonedCartRange,
  AbandonedCartRow,
  AbandonedCartStatus,
  AbandonedCartsResponse,
} from '@/lib/types';

export const metadata = { title: 'Datapp · Abandoned carts' };

interface PageProps {
  searchParams: Promise<{
    status?: string;
    range?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}

function clampPage(raw: string | undefined): number {
  const parsed = Number(raw ?? '1');
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(Math.floor(parsed), 10_000);
}

const STATUS_TABS = ['open', 'recovered', 'expired'] as const satisfies readonly AbandonedCartStatus[];
const RANGES = ['7d', '30d', '90d', 'all'] as const satisfies readonly AbandonedCartRange[];

const SORT_FIELDS = ['cart_id', 'grand_total', 'date', 'age', 'recovered_amount'] as const;
type SortField = (typeof SORT_FIELDS)[number];

function defaultSortFor(status: AbandonedCartStatus): SortState<SortField> {
  // Each tab makes sense ordered by its own date column; the SQL on the
  // server already returns rows that way, so this matches what the user
  // sees on first load.
  return { field: 'date', dir: 'desc' };
}

function compareCarts(a: AbandonedCartRow, b: AbandonedCartRow, field: SortField, status: AbandonedCartStatus): number {
  switch (field) {
    case 'cart_id':
      return a.cart_id - b.cart_id;
    case 'grand_total':
      return Number(a.grand_total) - Number(b.grand_total);
    case 'recovered_amount':
      return Number(a.recovered_amount ?? 0) - Number(b.recovered_amount ?? 0);
    case 'age':
      return a.age_minutes - b.age_minutes;
    case 'date': {
      const dateOf = (c: AbandonedCartRow): string =>
        status === 'open'
          ? c.abandoned_at
          : status === 'recovered'
            ? (c.recovered_at ?? c.abandoned_at)
            : (c.expired_at ?? c.abandoned_at);
      return new Date(dateOf(a)).getTime() - new Date(dateOf(b)).getTime();
    }
  }
}

function pickStatus(raw: string | undefined): AbandonedCartStatus {
  return STATUS_TABS.find((s) => s === raw) ?? 'open';
}

function pickRange(raw: string | undefined): AbandonedCartRange {
  return RANGES.find((r) => r === raw) ?? '30d';
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const days = Math.floor(minutes / (24 * 60));
  const remHours = Math.floor((minutes - days * 24 * 60) / 60);
  return `${days}d ${remHours}h`;
}

function ageTone(minutes: number, status: AbandonedCartStatus): string {
  if (status === 'recovered') return 'bg-success/15 text-success';
  if (status === 'expired') return 'bg-muted/40 text-muted-foreground';
  if (minutes < 48 * 60) return 'bg-warning/15 text-warning';
  if (minutes < 7 * 24 * 60) return 'bg-accent/15 text-accent';
  return 'bg-destructive/15 text-destructive';
}

export default async function AbandonedCartsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const status = pickStatus(sp.status);
  const range = pickRange(sp.range);
  const defaultSort = defaultSortFor(status);
  const sort = parseSort<SortField>(sp, SORT_FIELDS, defaultSort);
  const page = clampPage(sp.page);
  const limit = '20';

  // Guests are always hidden — without an email there's nothing to
  // recover, so they'd just be noise on this surface. The API still
  // accepts `hide_guests=false` for ad-hoc debugging.
  const params = new URLSearchParams({ status, range, page: page.toString(), limit });
  const result = await apiFetch<AbandonedCartsResponse>(
    `/v1/admin/carts/abandoned?${params.toString()}`,
  );

  // Sort the VISIBLE page in memory — pure UX, lets the user re-pivot
  // the current page without a round-trip. Real ordering across pages
  // is whatever the API returned (status-driven default).
  const sorted = [...result.data].sort((a, b) => {
    const cmp = compareCarts(a, b, sort.field, status);
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const t = await getTranslations('carts');
  const locale = (await getLocale()) as Locale;

  const currentParams: Record<string, string | string[] | undefined> = {
    status,
    range,
    page: page === 1 ? undefined : page.toString(),
    sort: sort.field === defaultSort.field ? undefined : sort.field,
    dir: sort.field === defaultSort.field && sort.dir === defaultSort.dir ? undefined : sort.dir,
  };

  const totalsCurrency = pickTotalsCurrency(result.data) ?? 'ARS';
  const recoveryRatePct =
    result.kpis.recovery_rate === null
      ? '—'
      : `${formatNumber(Math.round(result.kpis.recovery_rate * 1000) / 10, locale)}%`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle', {
              when: result.last_synced_at
                ? formatBuenosAires(result.last_synced_at, locale)
                : formatBuenosAires(result.generated_at, locale),
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
            {RANGES.map((r) => {
              const active = range === r;
              return (
                <Link
                  key={r}
                  href={buildListHref('/carts', currentParams, { range: r, page: undefined })}
                  className={
                    active
                      ? 'rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground'
                      : 'rounded px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground'
                  }
                >
                  {t(`ranges.${r}`)}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Tile
          label={t('kpis.openNow')}
          value={formatNumber(result.kpis.carts_open, locale)}
          sub={t('kpis.openNowSub')}
          accent="primary"
        />
        <Tile
          label={t('kpis.openAtRisk')}
          value={formatCurrency(result.kpis.open_at_risk, totalsCurrency, locale)}
          sub={t('kpis.openAtRiskSub')}
          accent="destructive"
        />
        <Tile
          label={t('kpis.recoveredRevenue')}
          value={formatCurrency(result.kpis.recovered_revenue, totalsCurrency, locale)}
          sub={t('kpis.recoveredRevenueSub', { days: result.kpis.window_days })}
          accent="success"
        />
        <Tile
          label={t('kpis.recoveryRate')}
          value={recoveryRatePct}
          sub={t('kpis.recoveryRateSub')}
        />
      </div>

      <AttributionStrip
        kpis={result.kpis}
        windowDays={result.kpis.window_days}
        currency={totalsCurrency}
        locale={locale}
      />

      <nav className="flex gap-1 border-b border-border text-sm">
        {STATUS_TABS.map((s) => {
          const active = status === s;
          // Switching tabs drops sort/dir — each tab has its own default
          // and the available columns differ (recovered_amount only on
          // the recovered tab).
          return (
            <Link
              key={s}
              href={buildListHref('/carts', { range }, { status: s, page: undefined })}
              className={
                active
                  ? 'border-b-2 border-primary px-4 py-2 font-medium text-foreground'
                  : 'border-b-2 border-transparent px-4 py-2 text-muted-foreground transition hover:text-foreground'
              }
            >
              {t(`tabs.${s}`)}
            </Link>
          );
        })}
      </nav>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t(`tableHeading.${status}`, { count: formatNumber(sorted.length, locale) })}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t(`tableSubtitle.${status}`)}</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-3">
                <SortableHeader
                  field="cart_id"
                  current={sort}
                  defaultDir="asc"
                  basePath="/carts"
                  currentParams={currentParams}
                >
                  {t('table.cart')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.customer')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('table.items')}
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="grand_total"
                  current={sort}
                  align="right"
                  basePath="/carts"
                  currentParams={currentParams}
                >
                  {t('table.total')}
                </SortableHeader>
              </th>
              {status === 'recovered' && (
                <>
                  <th className="px-4 py-3">
                    <SortableHeader
                      field="recovered_amount"
                      current={sort}
                      align="right"
                      basePath="/carts"
                      currentParams={currentParams}
                    >
                      {t('table.recoveredAmount')}
                    </SortableHeader>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Atribución
                  </th>
                </>
              )}
              <th className="px-4 py-3">
                <SortableHeader
                  field="date"
                  current={sort}
                  basePath="/carts"
                  currentParams={currentParams}
                >
                  {status === 'open'
                    ? t('table.abandonedAt')
                    : status === 'recovered'
                      ? t('table.recoveredAt')
                      : t('table.expiredAt')}
                </SortableHeader>
              </th>
              <th className="px-4 py-3">
                <SortableHeader
                  field="age"
                  current={sort}
                  basePath="/carts"
                  currentParams={currentParams}
                >
                  {status === 'recovered' ? t('table.ageRecovered') : t('table.ageOpen')}
                </SortableHeader>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={status === 'recovered' ? 8 : 6}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {t(
                    status === 'open'
                      ? 'table.emptyOpen'
                      : status === 'recovered'
                        ? 'table.emptyRecovered'
                        : 'table.emptyExpired',
                  )}
                </td>
              </tr>
            )}
            {sorted.map((c) => {
              const total = Number(c.grand_total);
              const showTotal = total > 0;
              const dateField =
                status === 'open'
                  ? c.abandoned_at
                  : status === 'recovered'
                    ? (c.recovered_at ?? c.abandoned_at)
                    : (c.expired_at ?? c.abandoned_at);
              return (
                <tr
                  key={c.cart_id}
                  className="border-b border-border last:border-0 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    <Link
                      href={`/carts/${c.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      #{c.cart_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {c.customer_id ? (
                      <Link
                        href={`/customers/${c.customer_id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {c.email ?? t('table.noEmail')}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground/80">
                        {c.email ?? t('table.noEmail')}
                      </span>
                    )}
                    {c.customer_name && (
                      <div className="text-xs text-muted-foreground">{c.customer_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground/80">
                    {formatNumber(c.items_qty, locale)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                    {showTotal ? (
                      formatCurrency(c.grand_total, c.currency_code ?? 'ARS', locale)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {status === 'recovered' && (
                    <>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-success">
                        {c.recovered_amount ? (
                          formatCurrency(c.recovered_amount, c.currency_code ?? 'ARS', locale)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AttributionBadge row={c} />
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatBuenosAires(dateField, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${ageTone(c.age_minutes, c.status)}`}
                    >
                      {formatAge(c.age_minutes)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <Pagination
        page={result.page}
        totalPages={result.total_pages}
        totalCount={result.total_count}
        limit={result.limit}
        buildHref={(overrides) =>
          buildListHref('/carts', currentParams, {
            page: overrides.page !== undefined ? String(overrides.page) : String(result.page),
            limit: overrides.limit !== undefined ? String(overrides.limit) : undefined,
          })
        }
      />
    </div>
  );
}

function pickTotalsCurrency(rows: AbandonedCartsResponse['data']): string | null {
  const codes = new Set(rows.map((c) => c.currency_code).filter((c): c is string => Boolean(c)));
  if (codes.size === 1) return [...codes][0] ?? null;
  return null;
}

function AttributionStrip({
  kpis,
  windowDays,
  currency,
  locale,
}: {
  kpis: AbandonedCartsResponse['kpis'];
  windowDays: number;
  currency: string;
  locale: Locale;
}): React.ReactElement | null {
  const total = kpis.carts_recovered;
  const couponCount = kpis.recovered_via_email_coupon;
  const emailCount = kpis.recovered_via_email;
  const organicCount = Math.max(0, total - couponCount - emailCount);
  if (total === 0) return null;

  const pct = (n: number): string =>
    total === 0 ? '—' : `${formatNumber(Math.round((n / total) * 1000) / 10, locale)}%`;

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Atribución de los recuperados (últimos {windowDays} días)
        </h2>
        <span className="text-xs text-muted-foreground">
          {formatNumber(total, locale)} carritos · {formatCurrency(kpis.recovered_revenue_attributed, currency, locale)} atribuibles
        </span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AttributionRow
          label="Email + cupón"
          hint="El pedido recuperado usó un cupón emitido en una recovery email."
          count={couponCount}
          pct={pct(couponCount)}
          tone="success"
        />
        <AttributionRow
          label="Email"
          hint="Hubo al menos una recovery email entregada al cart, sin cupón coincidente."
          count={emailCount}
          pct={pct(emailCount)}
          tone="primary"
        />
        <AttributionRow
          label="Orgánico"
          hint="Volvió a comprar sin que enviáramos email."
          count={organicCount}
          pct={pct(organicCount)}
          tone="muted"
        />
      </div>
    </div>
  );
}

function AttributionRow({
  label,
  hint,
  count,
  pct,
  tone,
}: {
  label: string;
  hint: string;
  count: number;
  pct: string;
  tone: 'success' | 'primary' | 'muted';
}): React.ReactElement {
  const colorBar =
    tone === 'success'
      ? 'bg-success'
      : tone === 'primary'
        ? 'bg-primary'
        : 'bg-muted-foreground/40';
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">{pct}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{count} carritos</div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/40">
        <div
          className={`h-full ${colorBar}`}
          style={{ width: pct === '—' ? '0%' : pct }}
        />
      </div>
      <p className="mt-2 text-[11px] leading-tight text-muted-foreground">{hint}</p>
    </div>
  );
}

function AttributionBadge({ row }: { row: AbandonedCartRow }): React.ReactElement {
  switch (row.recovery_attribution) {
    case 'email_coupon':
      return (
        <span
          className="inline-flex flex-col gap-0.5"
          title={
            row.recovery_coupon_code
              ? `Cupón ${row.recovery_coupon_code} aplicado en el pedido y emitido en una recovery email`
              : undefined
          }
        >
          <span className="inline-flex w-fit items-center rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-success">
            ✓ email + cupón
          </span>
          {row.recovery_coupon_code && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {row.recovery_coupon_code}
            </span>
          )}
        </span>
      );
    case 'email':
      return (
        <span
          className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-primary"
          title="Recibió al menos una recovery email; el cupón no matchea (o no había cupón)"
        >
          email
        </span>
      );
    case 'organic':
      return (
        <span className="inline-flex w-fit items-center rounded-full bg-muted/40 px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          orgánico
        </span>
      );
    default:
      return <span className="text-muted-foreground">—</span>;
  }
}

function Tile({
  label,
  value,
  sub,
  accent = 'muted',
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'primary' | 'success' | 'destructive' | 'muted';
}): React.ReactElement {
  const tone =
    accent === 'primary'
      ? 'border-l-4 border-l-primary'
      : accent === 'success'
        ? 'border-l-4 border-l-success'
        : accent === 'destructive'
          ? 'border-l-4 border-l-destructive'
          : '';
  return (
    <div
      className={`rounded-lg border border-border bg-card p-5 shadow-card transition hover:shadow-elevated ${tone}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
