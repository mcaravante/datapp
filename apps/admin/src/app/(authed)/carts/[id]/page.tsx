import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { SendRecoveryPanel } from './send-recovery-panel';
import type {
  AbandonedCartRow,
  EmailCampaignSummary,
  EmailCampaignDetail,
  SendHistoryRow,
} from '@/lib/types';

export const metadata = { title: 'Datapp · Carrito abandonado' };

export default async function CartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const cart = await apiFetch<AbandonedCartRow>(`/v1/admin/carts/abandoned/${id}`);
  const [{ data: sends }, { data: campaignSummaries }] = await Promise.all([
    apiFetch<{ data: SendHistoryRow[] }>(`/v1/admin/carts/abandoned/${id}/sends`),
    apiFetch<{ data: EmailCampaignSummary[] }>('/v1/admin/email-campaigns'),
  ]);

  // Load full detail for active campaigns so we can show their stages.
  const sendableCampaigns: EmailCampaignDetail[] = await Promise.all(
    campaignSummaries
      .filter((c) => c.status === 'active' || c.status === 'draft')
      .map((c) =>
        apiFetch<EmailCampaignDetail>(`/v1/admin/email-campaigns/${c.id}`),
      ),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Carrito #{cart.cart_id}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cliente: <strong>{cart.email ?? '— guest sin email —'}</strong>
            {cart.customer_name ? ` (${cart.customer_name})` : ''} · estado{' '}
            <code>{cart.status}</code>
          </p>
        </div>
        <Link href="/carts" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver al listado
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-6 shadow-card lg:grid-cols-4">
        <Stat label="Items" value={cart.items_qty.toLocaleString('es-AR')} />
        <Stat
          label="Total"
          value={`${cart.currency_code ?? 'ARS'} ${Number(cart.grand_total).toLocaleString(
            'es-AR',
            { minimumFractionDigits: 2 },
          )}`}
        />
        <Stat
          label="Abandonado"
          value={new Date(cart.abandoned_at).toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        />
        <Stat label="Edad" value={`${cart.age_minutes} min`} />
      </section>

      {cart.status === 'open' && cart.email && (
        <SendRecoveryPanel cartId={cart.id} campaigns={sendableCampaigns} />
      )}

      {cart.status === 'open' && !cart.email && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Este carrito es de un guest sin email asociado todavía — no se puede enviar recupero.
        </div>
      )}

      {cart.status !== 'open' && (
        <div className="rounded-md border border-muted/40 bg-muted/20 p-3 text-sm text-muted-foreground">
          El carrito está en estado <code>{cart.status}</code>. No se pueden enviar emails de
          recupero (solo carritos en estado <code>open</code>).
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Historial de emails enviados
        </h2>
        {sends.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no se mandó ningún email para este carrito.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Campaña / stage</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Cupón</th>
                  <th className="px-3 py-2">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(s.created_at).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/campaigns/${s.campaign_id}`}
                        className="text-foreground hover:text-primary hover:underline"
                      >
                        {s.campaign_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">stage #{s.stage_position}</div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={s.status} />
                      {s.last_event_type && (
                        <div className="text-[11px] text-muted-foreground">
                          último: {s.last_event_type}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.coupon_code ? (
                        <span>
                          {s.coupon_code}
                          <div className="text-[10px] text-muted-foreground">
                            {s.coupon_source}
                          </div>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {s.error_message ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-medium tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const cls =
    status === 'delivered' || status === 'queued'
      ? 'bg-success/15 text-success'
      : status === 'pending'
        ? 'bg-warning/15 text-warning'
        : status === 'suppressed' || status === 'cancelled'
          ? 'bg-muted/40 text-muted-foreground'
          : 'bg-destructive/15 text-destructive';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}
