import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { cachedApiFetch } from '@/lib/cached-api-fetch';
import { buildListHref } from '@/lib/list-state';
import { formatCurrencyArs, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';

export const metadata = { title: 'Datapp · Atribución carrusel' };

interface AttributionTotals {
  itemsCount: number;
  unitsOrdered: number;
  ordersCount: number;
  revenue: string;
}

interface AttributionProductRow {
  sku: string;
  name: string;
  units: number;
  orders: number;
  revenue: string;
}

interface AttributionResponse {
  range: { from: string; to: string };
  totals: AttributionTotals;
  bySource: { source: string; itemsCount: number; ordersCount: number; revenue: string }[];
  topProducts: AttributionProductRow[];
}

const PRESETS = [
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: '365d', days: 365 },
  { id: 'all', days: null },
] as const;

const PRESET_LABELS: Record<string, string> = {
  '30d': '30 días',
  '90d': '90 días',
  '365d': '1 año',
  all: 'Histórico',
};

const SOURCE_LABELS: Record<string, string> = {
  related_products_pdp: 'Carrusel productos relacionados (PDP)',
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function rangeFromPreset(presetId: string): { from: string; to: string } {
  const to = new Date();
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1];
  if (!preset || preset.days === null) {
    return { from: '2010-01-01T00:00:00.000Z', to: to.toISOString() };
  }
  const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

interface PageProps {
  searchParams: Promise<{
    window?: string;
  }>;
}

export default async function AttributionInsightsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const windowParam = sp.window ?? '90d';
  const range = rangeFromPreset(windowParam);

  const params = new URLSearchParams({ from: range.from, to: range.to, limit: '50' });
  const data = await cachedApiFetch<AttributionResponse>(
    `/v1/admin/analytics/attribution?${params.toString()}`,
  );

  const locale = (await getLocale()) as Locale;
  const fmtMoney = (v: string | number): string => formatCurrencyArs(v, locale);
  const fmtNum = (v: number): string => formatNumber(v, locale);

  const currentParams: Record<string, string | string[] | undefined> = {
    window: windowParam === '90d' ? undefined : windowParam,
  };

  const hasData = data.totals.itemsCount > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Atribución del carrusel
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Qué productos se agregaron al carrito desde superficies trackeadas (hoy: carrusel
            de productos relacionados en la PDP), si terminaron en una orden y cuánto facturaron.
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft">
          {PRESETS.map((p) => {
            const active = windowParam === p.id;
            return (
              <Link
                key={p.id}
                href={buildListHref('/insights/attribution', currentParams, { window: p.id })}
                className={
                  active
                    ? 'rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground'
                    : 'rounded px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground'
                }
              >
                {PRESET_LABELS[p.id] ?? p.id}
              </Link>
            );
          })}
        </nav>
      </div>

      <KpiGrid totals={data.totals} fmtMoney={fmtMoney} fmtNum={fmtNum} />

      {data.bySource.length > 0 && (
        <SourceBreakdown rows={data.bySource} fmtMoney={fmtMoney} fmtNum={fmtNum} />
      )}

      <TopProductsTable rows={data.topProducts} fmtMoney={fmtMoney} fmtNum={fmtNum} />

      {!hasData && (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            Todavía no hay órdenes atribuidas al carrusel en este rango. Cuando el módulo
            <span className="mx-1 font-mono text-xs">Pupe_RelatedProductsAttribution</span>
            esté activo en producción, los datos van a aparecer acá automáticamente con cada
            sync de órdenes.
          </p>
        </div>
      )}
    </div>
  );
}

function KpiGrid({
  totals,
  fmtMoney,
  fmtNum,
}: {
  totals: AttributionTotals;
  fmtMoney: (v: string | number) => string;
  fmtNum: (v: number) => string;
}): React.ReactElement {
  const cards = [
    { label: 'Facturación atribuida', value: fmtMoney(totals.revenue), accent: true },
    { label: 'Órdenes con atribución', value: fmtNum(totals.ordersCount) },
    { label: 'Items vendidos desde carrusel', value: fmtNum(totals.itemsCount) },
    { label: 'Unidades ordenadas', value: fmtNum(totals.unitsOrdered) },
  ];
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-card p-5 shadow-card"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {card.label}
          </p>
          <p
            className={
              card.accent
                ? 'mt-2 text-2xl font-semibold text-foreground'
                : 'mt-2 text-2xl font-semibold text-foreground/90'
            }
          >
            {card.value}
          </p>
        </div>
      ))}
    </section>
  );
}

function SourceBreakdown({
  rows,
  fmtMoney,
  fmtNum,
}: {
  rows: { source: string; itemsCount: number; ordersCount: number; revenue: string }[];
  fmtMoney: (v: string | number) => string;
  fmtNum: (v: number) => string;
}): React.ReactElement {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Por fuente
      </h2>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="pb-2">Fuente</th>
            <th className="pb-2 text-right">Items</th>
            <th className="pb-2 text-right">Órdenes</th>
            <th className="pb-2 text-right">Facturación</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.source} className="border-b border-border/60 last:border-0">
              <td className="py-2.5">{sourceLabel(row.source)}</td>
              <td className="py-2.5 text-right tabular-nums">{fmtNum(row.itemsCount)}</td>
              <td className="py-2.5 text-right tabular-nums">{fmtNum(row.ordersCount)}</td>
              <td className="py-2.5 text-right font-medium tabular-nums">
                {fmtMoney(row.revenue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TopProductsTable({
  rows,
  fmtMoney,
  fmtNum,
}: {
  rows: AttributionProductRow[];
  fmtMoney: (v: string | number) => string;
  fmtNum: (v: number) => string;
}): React.ReactElement {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Top productos vendidos desde el carrusel
      </h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Sin productos en este rango.</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-2">SKU</th>
              <th className="pb-2">Nombre</th>
              <th className="pb-2 text-right">Unidades</th>
              <th className="pb-2 text-right">Órdenes</th>
              <th className="pb-2 text-right">Facturación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sku} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 font-mono text-xs text-muted-foreground">{row.sku}</td>
                <td className="py-2.5">{row.name}</td>
                <td className="py-2.5 text-right tabular-nums">{fmtNum(row.units)}</td>
                <td className="py-2.5 text-right tabular-nums">{fmtNum(row.orders)}</td>
                <td className="py-2.5 text-right font-medium tabular-nums">
                  {fmtMoney(row.revenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
