import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatNumber, formatPercent01 } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { ProductAffinityResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Product affinity' };

interface PageProps {
  params: Promise<{ sku: string }>;
}

export default async function ProductAffinityPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { sku: rawSku } = await params;
  const sku = decodeURIComponent(rawSku);

  let result: ProductAffinityResponse;
  try {
    const qs = new URLSearchParams({ sku, limit: '20' });
    result = await apiFetch<ProductAffinityResponse>(
      `/v1/admin/analytics/product-affinity?${qs.toString()}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const noOrders = result.focus_orders === 0;
  const maxConfidence = result.data.reduce((m, r) => Math.max(m, r.confidence), 0);

  const t = await getTranslations('productAffinity');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          {t('back')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {result.name ?? sku}
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{sku}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          label={t('tiles.ordersWithSku')}
          value={formatNumber(result.focus_orders, locale)}
          accent="primary"
        />
        <Tile
          label={t('tiles.tenantTotalOrders')}
          value={formatNumber(result.total_orders, locale)}
          sub={t('tiles.tenantTotalSub')}
        />
        <Tile
          label={t('tiles.penetration')}
          value={
            result.total_orders > 0
              ? formatPercent01(result.focus_orders / result.total_orders, locale)
              : '—'
          }
          sub={t('tiles.penetrationSub')}
          accent="success"
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('heading')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('subtitle', {
              confidenceLabel: t('confidenceLabel'),
              liftLabel: t('liftLabel'),
            })}
          </p>
        </div>
        {noOrders ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('noOrders')}</p>
        ) : result.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('notEnough')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('table.sku')}</th>
                <th className="px-4 py-3 font-semibold">{t('table.product')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('table.coOrders')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('table.totalOrders')}</th>
                <th className="px-4 py-3 font-semibold">{t('table.confidence')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('table.lift')}</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((r) => {
                const confPct = maxConfidence > 0 ? (r.confidence / maxConfidence) * 100 : 0;
                const liftTone =
                  r.lift >= 2
                    ? 'bg-success/15 text-success'
                    : r.lift >= 1
                      ? 'bg-info/15 text-info'
                      : 'bg-muted text-muted-foreground';
                return (
                  <tr
                    key={r.sku}
                    className="border-b border-border last:border-0 transition hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/products/${encodeURIComponent(r.sku)}`}
                        className="text-muted-foreground hover:text-primary hover:underline"
                      >
                        {r.sku}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground/80">
                      {formatNumber(r.co_orders, locale)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatNumber(r.total_orders, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 w-32 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${confPct.toFixed(1)}%` }}
                            aria-hidden="true"
                          />
                        </div>
                        <span className="tabular-nums text-xs font-medium text-foreground">
                          {formatPercent01(r.confidence, locale)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${liftTone}`}
                      >
                        ×{r.lift.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
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
  accent?: 'primary' | 'success' | 'muted';
}): React.ReactElement {
  const tone =
    accent === 'primary'
      ? 'border-l-4 border-l-primary'
      : accent === 'success'
        ? 'border-l-4 border-l-success'
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
