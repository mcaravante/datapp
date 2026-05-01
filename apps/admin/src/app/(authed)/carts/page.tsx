import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { formatBuenosAires, formatCurrency, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { AbandonedCartsResponse } from '@/lib/types';

export const metadata = { title: 'Datapp · Abandoned carts' };

interface PageProps {
  searchParams: Promise<{ minutes?: string }>;
}

const PRESETS = [
  { id: '60', presetKey: '1h' as const, minutes: 60 },
  { id: '180', presetKey: '3h' as const, minutes: 180 },
  { id: '720', presetKey: '12h' as const, minutes: 720 },
  { id: '1440', presetKey: '1d' as const, minutes: 1440 },
  { id: '10080', presetKey: '7d' as const, minutes: 10_080 },
] as const;

type PresetKey = (typeof PRESETS)[number]['presetKey'];

const DEFAULT_PRESET = PRESETS[3]; // 1d

function pickPreset(raw: string | undefined): (typeof PRESETS)[number] {
  return PRESETS.find((p) => p.id === raw) ?? DEFAULT_PRESET;
}

function formatIdle(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const days = Math.floor(minutes / (24 * 60));
  const remHours = Math.floor((minutes - days * 24 * 60) / 60);
  return `${days}d ${remHours}h`;
}

export default async function AbandonedCartsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const preset = pickPreset(sp.minutes);

  const params = new URLSearchParams({
    minutes_idle: String(preset.minutes),
    limit: '200',
  });
  const result = await apiFetch<AbandonedCartsResponse>(
    `/v1/admin/carts/abandoned?${params.toString()}`,
  );

  const currencies = new Set(
    result.data.map((c) => c.currency_code).filter((c): c is string => Boolean(c)),
  );
  const [onlyCurrency] = currencies;
  const totalsCurrency = currencies.size === 1 && onlyCurrency ? onlyCurrency : 'ARS';

  const t = await getTranslations('carts');
  const tPresets = await getTranslations('carts.presets');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle', {
              threshold: formatIdle(preset.minutes),
              when: result.last_synced_at
                ? formatBuenosAires(result.last_synced_at, locale)
                : formatBuenosAires(result.generated_at, locale),
            })}
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
          {PRESETS.map((p) => {
            const active = preset.id === p.id;
            return (
              <Link
                key={p.id}
                href={`/carts?minutes=${p.id}`}
                className={
                  active
                    ? 'rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground'
                    : 'rounded px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground'
                }
              >
                {tPresets(p.presetKey as PresetKey)}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Tile
          label={t('tiles.carts')}
          value={formatNumber(result.totals.carts, locale)}
          accent="primary"
        />
        <Tile
          label={t('tiles.items')}
          value={formatNumber(result.totals.items_qty, locale)}
          sub={t('tiles.itemsSub')}
        />
        <Tile
          label={t('tiles.atRisk')}
          value={formatCurrency(result.totals.grand_total, totalsCurrency, locale)}
          accent="destructive"
          sub={t('tiles.atRiskSub')}
        />
        <Tile
          label={t('tiles.recoverable')}
          value={formatNumber(result.totals.recoverable_customers, locale)}
          sub={t('tiles.recoverableSub')}
          accent="success"
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('tableHeading', { count: formatNumber(result.data.length, locale) })}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('tableSubtitle')}</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t('table.cart')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.customer')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.items')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('table.total')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.lastActivity')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.idle')}</th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {result.data.map((c) => {
              const total = Number(c.grand_total);
              const showTotal = total > 0;
              return (
                <tr
                  key={c.cart_id}
                  className="border-b border-border last:border-0 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground">#{c.cart_id}</td>
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
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {c.customer_name && <span>{c.customer_name}</span>}
                      {c.is_guest ? (
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t('table.guest')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-success">
                          {t('table.registered')}
                        </span>
                      )}
                    </div>
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
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatBuenosAires(c.updated_at, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${idleTone(c.minutes_idle)}`}
                    >
                      {formatIdle(c.minutes_idle)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function idleTone(minutes: number): string {
  if (minutes < 60) return 'bg-warning/15 text-warning';
  if (minutes < 24 * 60) return 'bg-accent/15 text-accent';
  return 'bg-destructive/15 text-destructive';
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
