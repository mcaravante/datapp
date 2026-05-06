import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import type { PopupListResponse, PopupSummary } from '@/lib/types';

export const metadata = { title: 'Datapp · Popups' };

const STATUS_LABEL: Record<PopupSummary['status'], string> = {
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
  archived: 'Archivado',
};

const STATUS_CLASS: Record<PopupSummary['status'], string> = {
  draft: 'bg-muted/40 text-muted-foreground',
  active: 'bg-success/15 text-success',
  paused: 'bg-warning/15 text-warning',
  archived: 'bg-muted/40 text-muted-foreground',
};

const TRIGGER_LABEL: Record<PopupSummary['trigger'], string> = {
  immediate: 'Inmediato',
  time_on_page: 'Tiempo en página',
  scroll_depth: 'Scroll',
  exit_intent: 'Exit intent',
};

export default async function PopupsListPage(): Promise<React.ReactElement> {
  const { data: popups } = await apiFetch<PopupListResponse>('/v1/admin/popups');

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Popups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Modales que se renderizan en la storefront vía el script público
            <code className="mx-1 rounded bg-muted/60 px-1 text-[11px] font-mono">loader.datapp.com.ar/loader.js</code>
            para captar leads.
          </p>
        </div>
        <Link
          href="/popups/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          + Nuevo popup
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Disparo</th>
              <th className="px-4 py-3 text-right">Vistas</th>
              <th className="px-4 py-3 text-right">Conversiones</th>
              <th className="px-4 py-3">Última conversión</th>
            </tr>
          </thead>
          <tbody>
            {popups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Todavía no creaste ningún popup.{' '}
                  <Link href="/popups/new" className="text-primary hover:underline">
                    Crear el primero
                  </Link>
                  .
                </td>
              </tr>
            )}
            {popups.map((p) => (
              <tr
                key={p.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/popups/${p.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {p.name}
                  </Link>
                  <div className="font-mono text-[11px] text-muted-foreground">{p.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${STATUS_CLASS[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {TRIGGER_LABEL[p.trigger]}
                  {p.trigger === 'time_on_page' && p.trigger_delay_seconds > 0 ? (
                    <span className="ml-1 text-xs">({p.trigger_delay_seconds}s)</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {p.show_count.toLocaleString('es-AR')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                  {p.submission_count.toLocaleString('es-AR')}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.last_submitted_at
                    ? new Date(p.last_submitted_at).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
