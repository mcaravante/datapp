import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ApiError, apiFetch } from '@/lib/api-client';
import {
  formatBuenosAires,
  formatCurrency,
  formatCurrencyArs,
  formatNumber,
} from '@/lib/format';
import { GdprActions } from '@/components/gdpr-actions';
import type { Locale } from '@/i18n/config';
import type { CustomerDetail, CustomerProductsResponse, OrderListPage } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Customer' };

interface PageProps {
  params: Promise<{ id: string }>;
}

const RFM_LABEL_KEYS = [
  'champions',
  'loyal',
  'potential_loyalists',
  'new_customers',
  'promising',
  'needing_attention',
  'about_to_sleep',
  'at_risk',
  'cannot_lose_them',
  'hibernating',
  'lost',
] as const;

type RfmLabelKey = (typeof RFM_LABEL_KEYS)[number];

function isRfmLabelKey(value: string): value is RfmLabelKey {
  return (RFM_LABEL_KEYS as readonly string[]).includes(value);
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

  const ordersParams = new URLSearchParams({ customer_id: id, limit: '10' });
  const [orders, products] = await Promise.all([
    apiFetch<OrderListPage>(`/v1/admin/orders?${ordersParams.toString()}`).catch(() => null),
    apiFetch<CustomerProductsResponse>(`/v1/admin/customers/${id}/products`).catch(() => null),
  ]);

  const t = await getTranslations('customerDetail');
  const tRfm = await getTranslations('segments.rfmLabels');
  const tCommon = await getTranslations('common');
  const locale = (await getLocale()) as Locale;

  function rfmLabel(segment: string): string {
    return isRfmLabelKey(segment) ? tRfm(segment) : segment;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          {t('back')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {customer.email}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('subhead', {
            fullName,
            magentoId: customer.magento_customer_id,
            group: customer.customer_group ?? '—',
          })}
        </p>
      </div>

      <Section title={t('identity')}>
        <Field label={t('fields.email')} value={customer.email} />
        <Field label={t('fields.name')} value={fullName} />
        <Field label={t('fields.phone')} value={customer.phone ?? '—'} />
        <Field label={t('fields.dob')} value={customer.dob ?? '—'} />
        <Field label={t('fields.gender')} value={customer.gender ?? '—'} />
        <Field
          label={t('fields.subscribed')}
          value={t('subscribedValue', {
            flag: customer.is_subscribed ? tCommon('yes') : tCommon('no'),
            status: customer.subscription_status,
          })}
        />
        <Field
          label={t('fields.createdInMagento')}
          value={
            customer.magento_created_at
              ? formatBuenosAires(customer.magento_created_at, locale)
              : '—'
          }
        />
        <Field
          label={t('fields.updatedInMagento')}
          value={
            customer.magento_updated_at
              ? formatBuenosAires(customer.magento_updated_at, locale)
              : '—'
          }
        />
      </Section>

      {customer.rfm && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('rfm')}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${segmentToneClass(customer.rfm.segment)}`}
            >
              {rfmLabel(customer.rfm.segment)}
            </span>
            <span className="rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs text-muted-foreground">
              R{customer.rfm.recency_score} · F{customer.rfm.frequency_score} · M
              {customer.rfm.monetary_score}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('rfmCalculated', { when: formatBuenosAires(customer.rfm.calculated_at, locale) })}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Field label={t('rfmRecency')} value={String(customer.rfm.recency_days)} />
            <Field label={t('rfmFrequency')} value={String(customer.rfm.frequency)} />
            <Field label={t('rfmMonetary')} value={`${customer.rfm.monetary} ARS`} />
          </dl>
        </section>
      )}

      <Section title={t('lifetimeMetrics')}>
        <Field label={t('fields.orders')} value={String(customer.metrics.total_orders)} />
        <Field label={t('fields.totalSpent')} value={`${customer.metrics.total_spent} ARS`} />
        <Field label={t('fields.aov')} value={`${customer.metrics.aov} ARS`} />
        <Field
          label={t('fields.firstOrder')}
          value={
            customer.metrics.first_order_at
              ? formatBuenosAires(customer.metrics.first_order_at, locale)
              : '—'
          }
        />
        <Field
          label={t('fields.lastOrder')}
          value={
            customer.metrics.last_order_at
              ? formatBuenosAires(customer.metrics.last_order_at, locale)
              : '—'
          }
        />
        {customer.metrics.total_orders === 0 && (
          <p className="col-span-full text-xs text-muted-foreground">{t('noOrders')}</p>
        )}
      </Section>

      {orders && orders.data.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('recentOrdersHeading', {
                count: `${orders.data.length}${orders.next_cursor ? '+' : ''}`,
              })}
            </h2>
            <Link
              href={`/orders?customer_id=${customer.id}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('seeAll')}
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
                    {formatBuenosAires(o.placed_at, locale)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(o.item_count, locale)} {t('items')}
                  </span>
                  <span className="ml-auto tabular-nums text-sm font-medium text-foreground">
                    {formatCurrency(o.grand_total, o.currency_code, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {products && products.data.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <div className="border-b border-border bg-muted/30 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('productsHeading', { count: products.data.length })}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('productsSubtitle')}</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">{t('productsTable.sku')}</th>
                <th className="px-4 py-2 font-semibold">{t('productsTable.name')}</th>
                <th className="px-4 py-2 text-right font-semibold">{t('productsTable.units')}</th>
                <th className="px-4 py-2 text-right font-semibold">{t('productsTable.orders')}</th>
                <th className="px-4 py-2 text-right font-semibold">{t('productsTable.revenue')}</th>
                <th className="px-4 py-2 font-semibold">{t('productsTable.lastBought')}</th>
              </tr>
            </thead>
            <tbody>
              {products.data.map((p) => (
                <tr
                  key={p.sku}
                  className="border-b border-border last:border-0 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    <Link
                      href={`/products/${encodeURIComponent(p.sku)}`}
                      className="hover:text-primary hover:underline"
                    >
                      {p.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-foreground">{p.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground/80">
                    {formatNumber(Number(p.units), locale)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {formatNumber(p.orders, locale)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-foreground">
                    {formatCurrencyArs(p.revenue, locale)}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {formatBuenosAires(p.last_purchased_at, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Section title={t('addressesHeading', { count: customer.addresses.length })}>
        {customer.addresses.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">{t('noAddresses')}</p>
        ) : (
          customer.addresses.map((a) => (
            <div
              key={a.id}
              className="col-span-full rounded-md border border-border bg-background/50 p-3 text-sm"
            >
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <span>{a.type}</span>
                {a.is_default_billing && (
                  <span className="text-foreground">{t('defaultBilling')}</span>
                )}
                {a.is_default_shipping && (
                  <span className="text-foreground">{t('defaultShipping')}</span>
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
        <Section title={t('magentoAttributes')}>
          {Object.entries(customer.attributes).map(([k, v]) => (
            <Field key={k} label={k} value={String(v)} />
          ))}
        </Section>
      )}

      <GdprActions customerId={customer.id} customerEmail={customer.email} />
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
