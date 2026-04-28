import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { formatBuenosAires, formatCurrency, formatNumber } from '@/lib/format';
import type { AbandonedCartsResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Abandoned carts' };

interface PageProps {
  searchParams: Promise<{ minutes?: string }>;
}

const PRESETS = [
  { id: '15', label: '15 min', minutes: 15 },
  { id: '60', label: '1 hour', minutes: 60 },
  { id: '180', label: '3 hours', minutes: 180 },
  { id: '1440', label: '1 day', minutes: 1440 },
  { id: '10080', label: '7 days', minutes: 10_080 },
] as const;

const DEFAULT_PRESET = PRESETS[1];

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

  // Pick a single currency for the page total — fall back to ARS when
  // the live results don't agree (multi-currency stores will see "—").
  const currencies = new Set(
    result.data.map((c) => c.currency_code).filter((c): c is string => Boolean(c)),
  );
  const [onlyCurrency] = currencies;
  const totalsCurrency = currencies.size === 1 && onlyCurrency ? onlyCurrency : 'ARS';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Abandoned carts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live snapshot from Magento — active carts with at least one item, idle for{' '}
            <span className="font-medium text-foreground">≥ {formatIdle(preset.minutes)}</span>.
            Generated {formatBuenosAires(result.generated_at)}.
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
                {p.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Tile
          label="Carts"
          value={formatNumber(result.totals.carts)}
          accent="primary"
        />
        <Tile
          label="Items in carts"
          value={formatNumber(result.totals.items_qty)}
          sub="sum across all carts"
        />
        <Tile
          label="At-risk revenue"
          value={formatCurrency(result.totals.grand_total, totalsCurrency)}
          accent="destructive"
          sub="grand_total of pending carts"
        />
        <Tile
          label="Recoverable"
          value={formatNumber(result.totals.recoverable_customers)}
          sub="known customers (not guest)"
          accent="success"
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Carts ({formatNumber(result.data.length)})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sorted by most recently touched. Customer column links to the CDP profile when the
            shopper is registered.
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Cart</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 text-right font-semibold">Items</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Last activity</th>
              <th className="px-4 py-3 font-semibold">Idle</th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No abandoned carts in this window.
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
                        {c.email ?? '(no email)'}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground/80">
                        {c.email ?? '(no email)'}
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {c.customer_name && <span>{c.customer_name}</span>}
                      {c.is_guest ? (
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          guest
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-success">
                          registered
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground/80">
                    {formatNumber(c.items_qty)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                    {showTotal ? (
                      formatCurrency(c.grand_total, c.currency_code ?? 'ARS')
                    ) : (
                      <span className="text-muted-foreground" title="Cart not priced yet">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatBuenosAires(c.updated_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${idleTone(c.minutes_idle)}`}>
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
