import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { CustomerDetail, OrderListPage } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Customer' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { id } = await params;

  let customer: CustomerDetail;
  try {
    customer = await apiFetch<CustomerDetail>(`/v1/admin/customers/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || '—';

  // Recent orders timeline. Independent fetch so a slow timeline doesn't
  // block the rest of the customer 360.
  const ordersParams = new URLSearchParams({ customer_id: id, limit: '10' });
  const orders = await apiFetch<OrderListPage>(
    `/v1/admin/orders?${ordersParams.toString()}`,
  ).catch(() => null);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← Customers
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {customer.email}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fullName} · Magento #{customer.magento_customer_id} · group{' '}
          {customer.customer_group ?? '—'}
        </p>
      </div>

      <Section title="Identity">
        <Field label="Email" value={customer.email} />
        <Field label="Name" value={fullName} />
        <Field label="Phone" value={customer.phone ?? '—'} />
        <Field label="Date of birth" value={customer.dob ?? '—'} />
        <Field label="Gender" value={customer.gender ?? '—'} />
        <Field
          label="Subscribed"
          value={`${customer.is_subscribed ? 'yes' : 'no'} (${customer.subscription_status})`}
        />
        <Field
          label="Created in Magento"
          value={customer.magento_created_at ? formatBuenosAires(customer.magento_created_at) : '—'}
        />
        <Field
          label="Updated in Magento"
          value={customer.magento_updated_at ? formatBuenosAires(customer.magento_updated_at) : '—'}
        />
      </Section>

      {customer.rfm && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            RFM segment
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${segmentToneClass(customer.rfm.segment)}`}
            >
              {prettySegment(customer.rfm.segment)}
            </span>
            <span className="rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs text-muted-foreground">
              R{customer.rfm.recency_score} · F{customer.rfm.frequency_score} · M
              {customer.rfm.monetary_score}
            </span>
            <span className="text-xs text-muted-foreground">
              calculated {formatBuenosAires(customer.rfm.calculated_at)}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Field
              label="Recency (days since last order)"
              value={String(customer.rfm.recency_days)}
            />
            <Field label="Frequency (orders / 365d)" value={String(customer.rfm.frequency)} />
            <Field label="Monetary (revenue / 365d)" value={`${customer.rfm.monetary} ARS`} />
          </dl>
        </section>
      )}

      <Section title="Lifetime metrics">
        <Field label="Orders" value={String(customer.metrics.total_orders)} />
        <Field label="Total spent" value={`${customer.metrics.total_spent} ARS`} />
        <Field label="Average order value" value={`${customer.metrics.aov} ARS`} />
        <Field
          label="First order"
          value={
            customer.metrics.first_order_at
              ? formatBuenosAires(customer.metrics.first_order_at)
              : '—'
          }
        />
        <Field
          label="Last order"
          value={
            customer.metrics.last_order_at ? formatBuenosAires(customer.metrics.last_order_at) : '—'
          }
        />
        {customer.metrics.total_orders === 0 && (
          <p className="col-span-full text-xs text-muted-foreground">
            No orders synced for this customer yet.
          </p>
        )}
      </Section>

      {orders && orders.data.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent orders ({orders.data.length}
              {orders.next_cursor ? '+' : ''})
            </h2>
            <Link
              href={`/orders?customer_id=${customer.id}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              See all →
            </Link>
          </div>
          <ol className="space-y-3">
            {orders.data.map((o, i) => (
              <li key={o.id} className="relative flex gap-3 pl-6">
                <span
                  className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-primary ring-4 ring-primary/15' : 'bg-muted-foreground/40'}`}
                  aria-hidden="true"
                />
                {i < orders.data.length - 1 && (
                  <span
                    className="absolute left-[5px] top-4 h-[calc(100%+0.25rem)] w-px bg-border"
                    aria-hidden="true"
                  />
                )}
                <Link
                  href={`/orders/${o.id}`}
                  className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-transparent p-2 -ml-2 -mt-1.5 transition hover:border-border hover:bg-muted/30"
                >
                  <span className="font-mono text-sm font-medium text-foreground">
                    #{o.magento_order_number}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_TONE[o.status] ?? 'bg-muted text-muted-foreground'}`}
                  >
                    {o.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBuenosAires(o.placed_at)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(o.item_count)} items
                  </span>
                  <span className="ml-auto tabular-nums text-sm font-medium text-foreground">
                    {formatCurrency(o.grand_total, o.currency_code)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Section title={`Addresses (${customer.addresses.length})`}>
        {customer.addresses.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">
            No addresses returned by Magento for this customer.
          </p>
        ) : (
          customer.addresses.map((a) => (
            <div
              key={a.id}
              className="col-span-full rounded-md border border-border bg-background/50 p-3 text-sm"
            >
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <span>{a.type}</span>
                {a.is_default_billing && (
                  <span className="text-foreground">· default billing</span>
                )}
                {a.is_default_shipping && (
                  <span className="text-foreground">· default shipping</span>
                )}
              </div>
              <div className="text-foreground">
                {[a.first_name, a.last_name].filter(Boolean).join(' ') || '—'}
                {a.company && <span className="text-muted-foreground"> · {a.company}</span>}
              </div>
              <div className="text-foreground/80">
                {[a.street1, a.street2].filter(Boolean).join(', ') || '—'}
              </div>
              <div className="text-foreground/80">
                {[a.city, a.region?.name ?? a.region_raw, a.postal_code, a.country_code]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {a.phone && <div className="text-muted-foreground">{a.phone}</div>}
            </div>
          ))
        )}
      </Section>

      {Object.keys(customer.attributes).length > 0 && (
        <Section title="Magento custom attributes">
          {Object.entries(customer.attributes).map(([k, v]) => (
            <Field key={k} label={k} value={String(v)} />
          ))}
        </Section>
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
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

const ORDER_STATUS_TONE: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  processing: 'bg-info/15 text-info',
  complete: 'bg-success/15 text-success',
  closed: 'bg-muted text-muted-foreground',
  canceled: 'bg-destructive/15 text-destructive',
  holded: 'bg-accent/15 text-accent',
  fraud: 'bg-destructive/15 text-destructive',
  payment_review: 'bg-warning/15 text-warning',
};

const SEGMENT_TONE: Record<string, string> = {
  champions: 'bg-success/20 text-success',
  loyal: 'bg-success/15 text-success',
  potential_loyalists: 'bg-info/15 text-info',
  new_customers: 'bg-primary/15 text-primary',
  promising: 'bg-primary/10 text-primary',
  needing_attention: 'bg-warning/15 text-warning',
  about_to_sleep: 'bg-warning/20 text-warning',
  at_risk: 'bg-accent/20 text-accent',
  cannot_lose_them: 'bg-destructive/20 text-destructive',
  hibernating: 'bg-muted text-muted-foreground',
  lost: 'bg-muted text-muted-foreground',
};

function segmentToneClass(segment: string): string {
  return SEGMENT_TONE[segment] ?? 'bg-muted text-muted-foreground';
}

function prettySegment(segment: string): string {
  return segment
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

const FORMATTER = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatBuenosAires(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return FORMATTER.format(d);
}
