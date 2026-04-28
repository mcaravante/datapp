import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatNumber, formatPercent01 } from '@/lib/format';
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← Top products
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {result.name ?? sku}
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{sku}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          label="Orders containing this SKU"
          value={formatNumber(result.focus_orders)}
          accent="primary"
        />
        <Tile
          label="Tenant total orders"
          value={formatNumber(result.total_orders)}
          sub="baseline for lift"
        />
        <Tile
          label="Penetration"
          value={
            result.total_orders > 0
              ? formatPercent01(result.focus_orders / result.total_orders)
              : '—'
          }
          sub="orders with this SKU / all orders"
          accent="success"
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Frequently bought together
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Confidence</span> = % of orders with
            this SKU that also include the row SKU.{' '}
            <span className="font-medium text-foreground">Lift</span> &gt; 1 means stronger
            association than chance. Excludes SKUs that only co-occur once.
          </p>
        </div>
        {noOrders ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No orders contain this SKU yet.
          </p>
        ) : result.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Not enough co-occurrence to compute affinity. Either this SKU is usually bought alone
            or there aren&apos;t enough multi-item orders yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 text-right font-semibold">Co-orders</th>
                <th className="px-4 py-3 text-right font-semibold">Total orders</th>
                <th className="px-4 py-3 font-semibold">Confidence</th>
                <th className="px-4 py-3 text-right font-semibold">Lift</th>
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
                      {formatNumber(r.co_orders)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatNumber(r.total_orders)}
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
                          {formatPercent01(r.confidence)}
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
