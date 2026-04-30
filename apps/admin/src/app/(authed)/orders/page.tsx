import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { ExportButton } from '@/components/export-button';
import { formatBuenosAires, formatCurrency, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { OrderListPage } from '@/lib/types';

export const metadata = { title: 'Datapp · Orders' };

interface PageProps {
  searchParams: Promise<{
    q?: string;
    cursor?: string;
    limit?: string;
    status?: string | string[];
    window?: string;
  }>;
}

const PRESETS = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: 'all', days: null },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

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
  const cursor = sp.cursor ?? '';
  const limit = sp.limit ?? '50';
  const windowParam = sp.window ?? '30d';
  const statusFilter = sp.status === 'all' || sp.status === undefined ? null : sp.status;

  const range = rangeFromPreset(windowParam);

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', limit);
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  if (typeof statusFilter === 'string') params.set('status', statusFilter);
  if (Array.isArray(statusFilter)) statusFilter.forEach((s) => params.append('status', s));

  const page = await apiFetch<OrderListPage>(`/v1/admin/orders?${params.toString()}`);

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    next.set('window', windowParam);
    if (typeof statusFilter === 'string') next.set('status', statusFilter);
    next.set('limit', limit);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `/orders?${qs}` : '/orders';
  };

  const activeStatus =
    typeof statusFilter === 'string' ? statusFilter : statusFilter === null ? 'all' : 'all';

  const exportQs = new URLSearchParams();
  if (q) exportQs.set('q', q);
  if (typeof statusFilter === 'string') exportQs.set('status', statusFilter);
  if (range.from) exportQs.set('from', range.from);
  if (range.to) exportQs.set('to', range.to);
  const exportHref = `/api/export/orders${exportQs.toString() ? `?${exportQs.toString()}` : ''}`;

  const t = await getTranslations('orders');
  const tCommon = await getTranslations('common');
  const tPresets = await getTranslations('presets');
  const tStatus = await getTranslations('orders.statusFilters');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('onThisPage', { count: page.data.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href={exportHref} label={tCommon('exportCsv')} />
          <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
            {PRESETS.map((p) => {
              const active = windowParam === p.id;
              return (
                <Link
                  key={p.id}
                  href={buildHref({ window: p.id, cursor: undefined })}
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
            href={buildHref({ q: undefined, cursor: undefined })}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            {tCommon('clear')}
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('statusLabel')}</span>
        {STATUS_FILTERS.map((id) => {
          const active = activeStatus === id;
          return (
            <Link
              key={id}
              href={buildHref({ status: id === 'all' ? undefined : id, cursor: undefined })}
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
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t('table.orderNumber')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.placed')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.customer')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.status')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.items')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.total')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.realRevenue')}</th>
            </tr>
          </thead>
          <tbody>
            {page.data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {page.data.map((o) => (
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

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t('footer')}</span>
        {page.next_cursor && (
          <Link
            href={buildHref({ cursor: page.next_cursor })}
            className="rounded-md border border-border bg-card px-4 py-2 text-foreground transition hover:bg-muted"
          >
            {tCommon('next')} →
          </Link>
        )}
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
