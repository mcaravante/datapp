import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { formatBuenosAires, formatCurrencyArs, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { CouponsResponse } from '@/lib/types';

export const metadata = { title: 'Datapp · Coupons' };

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

const PRESETS = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: 'all', days: null },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

function rangeFromPreset(presetId: string): { from: string; to: string } {
  const to = new Date();
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[3];
  if (!preset || preset.days === null) {
    return { from: '2010-01-01T00:00:00.000Z', to: to.toISOString() };
  }
  const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async function CouponsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const windowParam = sp.window ?? '7d';
  const range = rangeFromPreset(windowParam);

  const params = new URLSearchParams({ from: range.from, to: range.to });
  const result = await apiFetch<CouponsResponse>(
    `/v1/admin/analytics/coupons?${params.toString()}`,
  );

  const maxRevenue = result.data.reduce((m, r) => Math.max(m, Number(r.gross_revenue)), 0);

  const t = await getTranslations('coupons');
  const tPresets = await getTranslations('presets');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
          {PRESETS.map((p) => {
            const active = windowParam === p.id;
            return (
              <Link
                key={p.id}
                href={`/coupons?window=${p.id}`}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          label={t('tiles.couponOrders')}
          value={formatNumber(result.totals.coupon_orders, locale)}
          accent="primary"
        />
        <Tile
          label={t('tiles.couponRevenue')}
          value={formatCurrencyArs(result.totals.coupon_revenue, locale)}
          sub={t('tiles.couponRevenueSub')}
          accent="success"
        />
        <Tile
          label={t('tiles.discount')}
          value={formatCurrencyArs(result.totals.discount_total, locale)}
          sub={t('tiles.discountSub')}
          accent="destructive"
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('byCode')}
          </h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t('table.code')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.rule')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.orders')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.customers')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.revenue')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.discount')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.net')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.lastUsed')}</th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {result.data.map((c) => {
              const pct = maxRevenue > 0 ? (Number(c.gross_revenue) / maxRevenue) * 100 : 0;
              return (
                <tr
                  key={c.code}
                  className="relative border-b border-border last:border-0 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders?coupon_code=${encodeURIComponent(c.code)}&window=all`}
                      className="font-mono text-xs font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {c.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/80">{c.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatNumber(c.orders, locale)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatNumber(c.customers, locale)}
                  </td>
                  <td className="relative px-4 py-3 text-right">
                    <div className="relative inline-flex items-center justify-end gap-2">
                      <span className="tabular-nums font-medium text-foreground">
                        {formatCurrencyArs(c.gross_revenue, locale)}
                      </span>
                    </div>
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-1 right-0 hidden rounded-l bg-success/10 lg:block"
                      style={{ width: `${pct.toFixed(1)}%`, maxWidth: '60%' }}
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-destructive">
                    −{formatCurrencyArs(c.discount_total, locale)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground/80">
                    {formatCurrencyArs(c.net_revenue, locale)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatBuenosAires(c.last_used_at, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {result.totals.auto_promo_orders > 0 && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('auto.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('auto.subtitle')}</p>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-background/50 p-3">
              <dt className="text-xs text-muted-foreground">{t('auto.ordersLabel')}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatNumber(result.totals.auto_promo_orders, locale)}
              </dd>
            </div>
            <div className="rounded-md border border-border bg-background/50 p-3">
              <dt className="text-xs text-muted-foreground">{t('auto.discountLabel')}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-destructive">
                −{formatCurrencyArs(result.totals.auto_promo_discount, locale)}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
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
