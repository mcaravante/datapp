import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { EmailCampaignSummary } from '@/lib/types';

export const metadata = { title: 'Datapp · Campañas de email' };

const STATUS_LABELS: Record<EmailCampaignSummary['status'], string> = {
  draft: 'borrador',
  active: 'activa',
  paused: 'pausada',
  archived: 'archivada',
};

const STATUS_CLASS: Record<EmailCampaignSummary['status'], string> = {
  draft: 'bg-muted/40 text-muted-foreground',
  active: 'bg-success/15 text-success',
  paused: 'bg-warning/15 text-warning',
  archived: 'bg-muted/30 text-muted-foreground line-through',
};

export default async function CampaignsListPage(): Promise<React.ReactElement> {
  let data: EmailCampaignSummary[];
  try {
    const resp = await apiFetch<{ data: EmailCampaignSummary[] }>('/v1/admin/email-campaigns');
    data = resp.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return <EngineDisabledNotice />;
    }
    throw err;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Campañas de email
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada campaña tiene uno o varios stages que disparan emails de recupero según el
            tiempo desde que se abandonó el carrito.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          + Nueva campaña
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Trigger</th>
              <th className="px-4 py-3">Stages</th>
              <th className="px-4 py-3">Sends 30d</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Aún no creaste campañas.{' '}
                  <Link href="/campaigns/new" className="text-primary hover:underline">
                    Crear la primera
                  </Link>
                  .
                </td>
              </tr>
            )}
            {data.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {c.name}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{c.slug}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {c.trigger}
                </td>
                <td className="px-4 py-3 tabular-nums text-foreground">{c.stage_count}</td>
                <td className="px-4 py-3 tabular-nums text-foreground">
                  {c.send_count_30d.toLocaleString('es-AR')}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${STATUS_CLASS[c.status]}`}
                  >
                    {STATUS_LABELS[c.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(c.updated_at).toLocaleString('es-AR', {
                    timeZone: 'America/Argentina/Buenos_Aires',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EngineDisabledNotice(): React.ReactElement {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Campañas de email</h1>
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-5 text-sm">
        <p className="font-semibold text-warning">El motor de email está apagado.</p>
        <p className="mt-2 text-foreground">
          Para habilitar <code>/templates</code> y <code>/campaigns</code> seteá estas variables
          de entorno en Dokploy (servicios <code>api</code> + <code>worker</code>) y redeployá:
        </p>
        <pre className="mt-3 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] text-foreground">{`EMAIL_ENGINE_ENABLED=true
EMAIL_DRY_RUN=true
EMAIL_TEST_RECIPIENT_ALLOWLIST=matias.caravante@gmail.com
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=CDP <no-reply@datapp.com.ar>
RESEND_WEBHOOK_SECRET=<min 16 chars>
MAGENTO_STOREFRONT_URL=https://<storefront prod>`}</pre>
        <p className="mt-3 text-xs text-muted-foreground">
          Mientras <code>EMAIL_DRY_RUN=true</code> + el allowlist solo te incluya a vos, ningún
          cliente real recibe emails (los sends quedan registrados como{' '}
          <code>suppressed</code>).
        </p>
      </div>
    </div>
  );
}
