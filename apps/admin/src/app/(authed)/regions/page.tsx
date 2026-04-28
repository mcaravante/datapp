import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { ArgentinaChoropleth } from '@/components/argentina-choropleth';
import { ExportButton } from '@/components/export-button';
import { formatCurrencyArs, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { GeoResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Regions' };

type MapMetric = 'revenue' | 'customers' | 'orders';

interface PageProps {
  searchParams: Promise<{ window?: string; metric?: string }>;
}

function pickMetric(raw: string | undefined): MapMetric {
  return raw === 'customers' || raw === 'orders' ? raw : 'revenue';
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

export default async function RegionsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { window: windowParam = 'all', metric: metricParam } = await searchParams;
  const metric = pickMetric(metricParam);
  const range = rangeFromPreset(windowParam);
  const params = new URLSearchParams({ from: range.from, to: range.to, country: 'AR' });
  const result = await apiFetch<GeoResponse>(`/v1/admin/analytics/geo?${params.toString()}`);

  const maxRevenue = result.data.reduce((max, row) => Math.max(max, Number(row.revenue)), 0);
  const maxCustomers = result.data.reduce((max, row) => Math.max(max, row.customers), 0);

  const metricHref = (m: MapMetric): string => {
    const next = new URLSearchParams();
    next.set('window', windowParam);
    next.set('metric', m);
    return `/regions?${next.toString()}`;
  };

  const t = await getTranslations('regions');
  const tCommon = await getTranslations('common');
  const tPresets = await getTranslations('presets');
  const tMetrics = await getTranslations('regions.metrics');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            href={`/api/export/regions?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&country=AR`}
            label={tCommon('exportCsv')}
          />
          <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
            {PRESETS.map((p) => {
              const active = windowParam === p.id;
              return (
                <Link
                  key={p.id}
                  href={`/regions?window=${p.id}`}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Tile label={t('tiles.customers')} value={formatNumber(result.totals.customers, locale)} />
        <Tile label={t('tiles.buyers')} value={formatNumber(result.totals.buyers, locale)} />
        <Tile label={t('tiles.orders')} value={formatNumber(result.totals.orders, locale)} />
        <Tile label={t('tiles.revenue')} value={formatCurrencyArs(result.totals.revenue, locale)} />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('mapBy')}</span>
        {(['revenue', 'customers', 'orders'] as MapMetric[]).map((m) => (
          <Link
            key={m}
            href={metricHref(m)}
            className={
              metric === m
                ? 'rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                : 'rounded-md border border-border bg-card px-3 py-1 text-xs text-foreground transition hover:bg-muted'
            }
          >
            {tMetrics(m)}
          </Link>
        ))}
      </div>

      <ArgentinaChoropleth data={result.data} metric={metric} />

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-3 text-right font-semibold">{t('table.rank')}</th>
              <th className="w-12 px-3 py-3 font-semibold">{t('table.code')}</th>
              <th className="px-3 py-3 font-semibold">{t('table.province')}</th>
              <th className="px-3 py-3 text-right font-semibold">{t('table.customers')}</th>
              <th className="px-3 py-3 font-semibold">{t('table.customerShare')}</th>
              <th className="px-3 py-3 text-right font-semibold">{t('table.buyers')}</th>
              <th className="px-3 py-3 text-right font-semibold">{t('table.orders')}</th>
              <th className="px-3 py-3 text-right font-semibold">{t('table.revenue')}</th>
              <th className="px-3 py-3 font-semibold">{t('table.revenueShare')}</th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {result.data.map((row, i) => (
              <tr
                key={row.region_id}
                className="border-b border-border last:border-0 transition hover:bg-muted/30"
              >
                <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">
                  {i + 1}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                  {row.region_code}
                </td>
                <td className="px-3 py-3 text-foreground">{row.region_name}</td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground/80">
                  {formatNumber(row.customers, locale)}
                </td>
                <td className="px-3 py-3">
                  <Bar value={row.customers} max={maxCustomers} tone="primary" />
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatNumber(row.buyers, locale)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatNumber(row.orders, locale)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-foreground">
                  {formatCurrencyArs(row.revenue, locale)}
                </td>
                <td className="px-3 py-3">
                  <Bar value={Number(row.revenue)} max={maxRevenue} tone="success" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.unmatched.length > 0 && (
        <details className="rounded-lg border border-border bg-card p-5 shadow-card">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('unmatched', { count: result.unmatched.length })}
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">{t('unmatchedSubtitle')}</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">{t('unmatchedTable.regionRaw')}</th>
                <th className="px-3 py-2 font-semibold">{t('unmatchedTable.city')}</th>
                <th className="px-3 py-2 font-semibold">{t('unmatchedTable.postal')}</th>
                <th className="px-3 py-2 text-right font-semibold">
                  {t('unmatchedTable.occurrences')}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.unmatched.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground">{row.region_raw ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.city_raw ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {row.postal_code ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground/80">
                    {formatNumber(row.occurrences, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card transition hover:shadow-elevated">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

interface BarProps {
  value: number;
  max: number;
  tone: 'primary' | 'success';
}

function Bar({ value, max, tone }: BarProps): React.ReactElement {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill = tone === 'primary' ? 'bg-primary' : 'bg-success';
  return (
    <div className="flex h-2 w-32 items-center overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full ${fill} transition-all`}
        style={{ width: `${pct.toFixed(1)}%` }}
      />
    </div>
  );
}
