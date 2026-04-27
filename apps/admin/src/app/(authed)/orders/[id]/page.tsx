import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatBuenosAires, formatCurrency, formatNumber } from '@/lib/format';
import type { OrderDetail } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Order' };

interface PageProps {
  params: Promise<{ id: string }>;
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

export default async function OrderDetailPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { id } = await params;

  let order: OrderDetail;
  try {
    order = await apiFetch<OrderDetail>(`/v1/admin/orders/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const fmt = (v: string | null): string => (v ? formatCurrency(v, order.currency_code) : '—');

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← Orders
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
            #{order.magento_order_number}
          </h1>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusToneClass(order.status)}`}
          >
            {order.status}
          </span>
          <span className="text-xs text-muted-foreground">state: {order.state}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Placed {formatBuenosAires(order.placed_at)} · Magento order id {order.magento_order_id}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Tile label="Grand total" value={fmt(order.grand_total)} accent="primary" />
        <Tile label="Real revenue" value={fmt(order.real_revenue)} accent="success" sub="invoiced − refunded" />
        <Tile label="Items" value={formatNumber(order.item_count)} sub={`${order.sku_count} SKUs`} />
        <Tile
          label="Refunded"
          value={fmt(order.total_refunded)}
          accent={Number(order.total_refunded) > 0 ? 'destructive' : 'muted'}
        />
      </div>

      <Section title="Customer">
        <Field label="Email" value={order.customer_email} />
        <Field label="Name" value={order.customer_name ?? '—'} />
        <Field label="Payment method" value={order.payment_method ?? '—'} />
        <Field label="Shipping method" value={order.shipping_method ?? '—'} />
        <Field
          label="CDP profile"
          value={order.customer_id ? '' : 'guest checkout'}
          slot={
            order.customer_id ? (
              <Link
                href={`/customers/${order.customer_id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Open customer 360 →
              </Link>
            ) : null
          }
        />
      </Section>

      <Section title="Totals">
        <Field label="Subtotal" value={fmt(order.subtotal)} />
        <Field label="Tax" value={fmt(order.total_tax)} />
        <Field label="Shipping" value={fmt(order.shipping_amount)} />
        <Field label="Discount" value={fmt(order.discount_amount)} />
        <Field label="Invoiced" value={fmt(order.total_invoiced)} />
        <Field label="Refunded" value={fmt(order.total_refunded)} />
        <Field label="Paid" value={fmt(order.total_paid)} />
        <Field label="Currency" value={order.currency_code} />
      </Section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Items ({order.items.length})
          </h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">SKU</th>
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 text-right font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Price</th>
              <th className="px-4 py-3 text-right font-semibold">Discount</th>
              <th className="px-4 py-3 text-right font-semibold">Tax</th>
              <th className="px-4 py-3 text-right font-semibold">Row total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No items on this order.
                </td>
              </tr>
            )}
            {order.items.map((it) => {
              const refunded = Number(it.qty_refunded) > 0;
              return (
                <tr
                  key={it.id}
                  className="border-b border-border last:border-0 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{it.sku}</td>
                  <td className="px-4 py-3 text-foreground">
                    {it.name}
                    {refunded && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
                        refunded {formatNumber(Number(it.qty_refunded))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground/80">
                    {formatNumber(Number(it.qty_ordered))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground/80">
                    {formatCurrency(it.price, order.currency_code)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {Number(it.discount_amount) > 0
                      ? formatCurrency(it.discount_amount, order.currency_code)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatCurrency(it.tax_amount, order.currency_code)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                    {formatCurrency(it.row_total, order.currency_code)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AddressCard title="Billing" address={order.billing_address} />
        <AddressCard title="Shipping" address={order.shipping_address} />
      </div>

      {order.history.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Status history ({order.history.length})
          </h2>
          <ol className="space-y-4">
            {order.history.map((h, i) => (
              <li key={h.id} className="relative flex gap-3 pl-6">
                <span
                  className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-primary ring-4 ring-primary/15' : 'bg-muted-foreground/50'}`}
                  aria-hidden="true"
                />
                {i < order.history.length - 1 && (
                  <span
                    className="absolute left-[5px] top-4 h-[calc(100%+0.5rem)] w-px bg-border"
                    aria-hidden="true"
                  />
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusToneClass(h.status)}`}
                    >
                      {h.status}
                    </span>
                    {h.state && (
                      <span className="text-xs text-muted-foreground">state: {h.state}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatBuenosAires(h.created_at)}
                    </span>
                  </div>
                  {h.comment && (
                    <p className="mt-1 text-sm text-foreground/80">{h.comment}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </dl>
    </section>
  );
}

function Field({
  label,
  value,
  slot,
}: {
  label: string;
  value: string;
  slot?: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">
        {slot ?? null}
        {!slot && (value || '—')}
      </dd>
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

function AddressCard({
  title,
  address,
}: {
  title: string;
  address: Record<string, unknown>;
}): React.ReactElement {
  const a = address as {
    firstname?: string;
    lastname?: string;
    company?: string;
    street?: string[] | string;
    city?: string;
    region?: string;
    postcode?: string;
    country_id?: string;
    telephone?: string;
  };
  const name = [a.firstname, a.lastname].filter(Boolean).join(' ');
  const street = Array.isArray(a.street) ? a.street.join(', ') : (a.street ?? '');
  const empty =
    !name && !street && !a.city && !a.region && !a.postcode && !a.country_id && !a.telephone;

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {empty ? (
        <p className="text-sm text-muted-foreground">Not captured for this order.</p>
      ) : (
        <div className="space-y-0.5 text-sm">
          {name && <div className="text-foreground">{name}</div>}
          {a.company && <div className="text-muted-foreground">{a.company}</div>}
          {street && <div className="text-foreground/80">{street}</div>}
          <div className="text-foreground/80">
            {[a.city, a.region, a.postcode, a.country_id].filter(Boolean).join(' · ') || '—'}
          </div>
          {a.telephone && <div className="text-muted-foreground">{a.telephone}</div>}
        </div>
      )}
    </section>
  );
}
