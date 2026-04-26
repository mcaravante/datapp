import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api-client';
import type { CustomerDetail } from '@/lib/types';

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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link href="/customers" className="text-sm text-neutral-500 hover:underline">
          ← Customers
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
          {customer.email}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
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
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            RFM segment
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${segmentToneClass(customer.rfm.segment)}`}
            >
              {prettySegment(customer.rfm.segment)}
            </span>
            <span className="font-mono text-xs text-neutral-500">
              R{customer.rfm.recency_score} F{customer.rfm.frequency_score} M
              {customer.rfm.monetary_score}
            </span>
            <span className="text-xs text-neutral-400">
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
          <p className="col-span-full text-xs text-neutral-400">
            Orders sync ships in Iteration 4. Until then these metrics stay at zero.
          </p>
        )}
      </Section>

      <Section title={`Addresses (${customer.addresses.length})`}>
        {customer.addresses.length === 0 ? (
          <p className="col-span-full text-sm text-neutral-500">
            No addresses returned by Magento for this customer.
          </p>
        ) : (
          customer.addresses.map((a) => (
            <div
              key={a.id}
              className="col-span-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm"
            >
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500">
                <span>{a.type}</span>
                {a.is_default_billing && (
                  <span className="text-neutral-700">· default billing</span>
                )}
                {a.is_default_shipping && (
                  <span className="text-neutral-700">· default shipping</span>
                )}
              </div>
              <div className="text-neutral-900">
                {[a.first_name, a.last_name].filter(Boolean).join(' ') || '—'}
                {a.company && <span className="text-neutral-500"> · {a.company}</span>}
              </div>
              <div className="text-neutral-700">
                {[a.street1, a.street2].filter(Boolean).join(', ') || '—'}
              </div>
              <div className="text-neutral-700">
                {[a.city, a.region?.name ?? a.region_raw, a.postal_code, a.country_code]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {a.phone && <div className="text-neutral-500">{a.phone}</div>}
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
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-900">{value}</dd>
    </div>
  );
}

const SEGMENT_TONE: Record<string, string> = {
  champions: 'bg-emerald-100 text-emerald-800',
  loyal: 'bg-emerald-50 text-emerald-700',
  potential_loyalists: 'bg-sky-50 text-sky-700',
  new_customers: 'bg-blue-50 text-blue-700',
  promising: 'bg-indigo-50 text-indigo-700',
  needing_attention: 'bg-amber-50 text-amber-700',
  about_to_sleep: 'bg-amber-100 text-amber-800',
  at_risk: 'bg-orange-100 text-orange-800',
  cannot_lose_them: 'bg-rose-100 text-rose-800',
  hibernating: 'bg-neutral-200 text-neutral-700',
  lost: 'bg-neutral-300 text-neutral-800',
};

function segmentToneClass(segment: string): string {
  return SEGMENT_TONE[segment] ?? 'bg-neutral-100 text-neutral-700';
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
