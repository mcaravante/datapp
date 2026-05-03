import { DonutChart } from './donut-chart';
import type { BreakdownResponse } from '@/lib/types';

const DONUT_TONES = [
  'fill-primary',
  'fill-success',
  'fill-accent',
  'fill-info',
  'fill-warning',
  'fill-destructive',
] as const;

interface Props {
  title: string;
  subtitle: string;
  data: BreakdownResponse;
  /** Maximum slices before folding the rest into "Otros". */
  topN?: number;
  otherLabel: string;
  /** Shown when 100% of orders have no value for this dimension. */
  noDataLabel: string;
  table: {
    methodLabel: string;
    ordersLabel: string;
    revenueLabel: string;
    shareLabel: string;
  };
  /** Pretty-print the raw column value (e.g. `mercadopago_custom` → `MercadoPago`). */
  formatKey?: (key: string) => string;
  formatRevenue: (value: string | number) => string;
  formatNumber: (value: number) => string;
  formatShare: (value: number) => string;
}

/**
 * Donut + table side-by-side for a single dimension breakdown.
 * Donut shows top N + Other; table lists every method with its raw
 * order count, revenue, and share of total — useful when the donut
 * collapses too much detail.
 */
export function BreakdownSection({
  title,
  subtitle,
  data,
  topN = 5,
  otherLabel,
  noDataLabel,
  table,
  formatKey = (k) => k,
  formatRevenue,
  formatNumber,
  formatShare,
}: Props): React.ReactElement {
  // When every order has the same `(none)` value, the donut + table
  // are noise — surface a clear "no data" notice instead so the
  // operator knows the column needs attention upstream.
  const onlyNone =
    data.data.length === 1 && data.data[0]?.key === '(none)' && data.data[0].share_orders >= 0.99;
  if (onlyNone || data.data.length === 0) {
    return (
      <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <p className="text-sm text-muted-foreground">{noDataLabel}</p>
      </section>
    );
  }
  const sorted = [...data.data].sort((a, b) => b.orders - a.orders);
  const top = sorted.slice(0, topN);
  const tail = sorted.slice(topN);
  const tailOrders = tail.reduce((sum, r) => sum + r.orders, 0);
  const slices = [
    ...top.map((r, i) => ({
      id: r.key,
      label: formatKey(r.key),
      value: r.orders,
      tone: DONUT_TONES[i] ?? 'fill-muted-foreground',
    })),
    ...(tailOrders > 0
      ? [{ id: '__other__', label: otherLabel, value: tailOrders, tone: 'fill-muted-foreground' }]
      : []),
  ];

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {(
        <>
          <DonutChart slices={slices} formatPct={formatShare} />

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{table.methodLabel}</th>
                  <th className="px-3 py-2 text-right font-semibold">{table.ordersLabel}</th>
                  <th className="px-3 py-2 text-right font-semibold">{table.revenueLabel}</th>
                  <th className="px-3 py-2 text-right font-semibold">{table.shareLabel}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-foreground">{formatKey(row.key)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground/80">
                      {formatNumber(row.orders)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground/80">
                      {formatRevenue(row.revenue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {formatShare(row.share_orders * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

