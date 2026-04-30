import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import {
  formatCurrencyArs,
  formatDeltaPct,
  formatNumber,
  formatPercent01,
  deltaTone,
} from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { KpisResponse } from '@/lib/types';

export const metadata = { title: 'Datapp · Overview' };

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; window?: string }>;
}

const PRESETS = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: 'all', days: null },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

function rangeFromPreset(presetId: string): { from?: string; to: string } {
  const to = new Date();
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1];
  if (!preset || preset.days === null) {
    return { from: '2010-01-01T00:00:00.000Z', to: to.toISOString() };
  }
  const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async function OverviewPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { from: fromParam, to: toParam, window: windowParam = '30d' } = await searchParams;
  const range =
    fromParam && toParam ? { from: fromParam, to: toParam } : rangeFromPreset(windowParam);

  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  params.set('to', range.to);

  const kpis = await apiFetch<KpisResponse>(`/v1/admin/analytics/kpis?${params.toString()}`);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('overview');
  const tPresets = await getTranslations('presets');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
          {PRESETS.map((p) => {
            const active = !fromParam && !toParam && windowParam === p.id;
            return (
              <Link
                key={p.id}
                href={`/?window=${p.id}`}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={t('tiles.revenue')}
          value={formatCurrencyArs(kpis.current.revenue, locale)}
          delta={kpis.delta.revenue_pct}
          sub={`${t('delta.vs')} ${formatCurrencyArs(kpis.previous.revenue, locale)}`}
        />
        <Tile
          label={t('tiles.orders')}
          value={formatNumber(kpis.current.orders, locale)}
          delta={kpis.delta.orders_pct}
          sub={`${t('delta.vs')} ${formatNumber(kpis.previous.orders, locale)}`}
        />
        <Tile
          label={t('tiles.aov')}
          value={formatCurrencyArs(kpis.current.aov, locale)}
          delta={kpis.delta.aov_pct}
          sub={`${t('delta.vs')} ${formatCurrencyArs(kpis.previous.aov, locale)}`}
        />
        <Tile
          label={t('tiles.customers')}
          value={formatNumber(kpis.current.customers, locale)}
          delta={kpis.delta.customers_pct}
          sub={t('tiles.customerMixCount', {
            newCount: formatNumber(kpis.current.new_customers, locale),
            returningCount: formatNumber(kpis.current.returning_customers, locale),
          })}
        />
      </div>

      <section className="rounded-lg border border-border bg-card p-5 shadow-card">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('mix.heading')}
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <MixCell
            label={t('mix.newCustomers')}
            value={formatNumber(kpis.current.new_customers, locale)}
            tone="primary"
          />
          <MixCell
            label={t('mix.returningCustomers')}
            value={formatNumber(kpis.current.returning_customers, locale)}
            tone="success"
          />
          <MixCell
            label={t('mix.repeatRate')}
            value={formatPercent01(kpis.current.repeat_purchase_rate, locale)}
            tone="accent"
          />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/customers"
          className="group rounded-lg border border-border bg-card p-5 shadow-card transition hover:border-ring/50 hover:shadow-elevated"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('links.customersTitle')}
          </div>
          <div className="mt-2 text-base font-semibold text-foreground">
            {t('links.customersHeadline')}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('links.customersDescription')}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
            {t('links.open')} <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </Link>
        <Link
          href="/products"
          className="group rounded-lg border border-border bg-card p-5 shadow-card transition hover:border-ring/50 hover:shadow-elevated"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('links.productsTitle')}
          </div>
          <div className="mt-2 text-base font-semibold text-foreground">
            {t('links.productsHeadline')}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('links.productsDescription')}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
            {t('links.open')} <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </Link>
      </div>
    </div>
  );
}

interface TileProps {
  label: string;
  value: string;
  delta: number | null;
  sub: string;
}

function Tile({ label, value, delta, sub }: TileProps): React.ReactElement {
  const tone = deltaTone(delta);
  const toneClass =
    tone === 'up'
      ? 'bg-success/15 text-success'
      : tone === 'down'
        ? 'bg-destructive/15 text-destructive'
        : 'bg-muted text-muted-foreground';
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card transition hover:shadow-elevated">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}
        >
          {tone === 'up' ? (
            <TrendUpIcon className="h-3 w-3" />
          ) : tone === 'down' ? (
            <TrendDownIcon className="h-3 w-3" />
          ) : null}
          {formatDeltaPct(delta)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function MixCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'accent';
}): React.ReactElement {
  const dot =
    tone === 'primary' ? 'bg-primary' : tone === 'success' ? 'bg-success' : 'bg-accent';
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function ArrowRightIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function TrendUpIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 7-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </svg>
  );
}

function TrendDownIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 17-8.5-8.5-5 5L2 7" />
      <path d="M16 17h6v-6" />
    </svg>
  );
}
