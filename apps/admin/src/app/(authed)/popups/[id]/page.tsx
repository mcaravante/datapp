import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api-client';
import type { PopupDetail, PopupSubmissionsPage } from '@/lib/types';
import { PopupEditor } from '../popup-editor';

export const metadata = { title: 'Datapp · Popup' };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function PopupDetailPage({
  params,
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  let popup: PopupDetail;
  try {
    popup = await apiFetch<PopupDetail>(`/v1/admin/popups/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const submissions = await apiFetch<PopupSubmissionsPage>(
    `/v1/admin/popups/submissions?form_id=${id}&page=${page}&limit=20`,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <Link href="/popups" className="text-sm text-muted-foreground hover:text-primary">
            ← Volver a popups
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {popup.name}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{popup.slug}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Vistas: {popup.show_count.toLocaleString('es-AR')}</div>
          <div>Conversiones: {popup.submission_count.toLocaleString('es-AR')}</div>
        </div>
      </div>

      <PopupEditor popup={popup} />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-foreground">Leads</h2>
          <a
            href={`/api/popups/${id}/submissions.csv`}
            className="text-xs text-primary hover:underline"
          >
            Exportar CSV
          </a>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Página</th>
                <th className="px-4 py-3">Datos</th>
                <th className="px-4 py-3">Recibido</th>
              </tr>
            </thead>
            <tbody>
              {submissions.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Aún no hay leads. Los nuevos llegan vía el script público.
                  </td>
                </tr>
              )}
              {submissions.data.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border last:border-0 transition hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{s.email ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {s.page_url ? (
                      <a
                        href={s.page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {s.page_url.replace(/^https?:\/\//, '').slice(0, 60)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {Object.keys(s.payload).length === 0
                      ? '—'
                      : JSON.stringify(s.payload).slice(0, 80)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(s.submitted_at).toLocaleString('es-AR', {
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
        {submissions.total_pages > 1 && (
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span>
              Página {submissions.page} de {submissions.total_pages}
            </span>
            {submissions.page > 1 && (
              <Link
                href={`/popups/${id}?page=${submissions.page - 1}`}
                className="rounded-md border border-border px-2 py-1 hover:border-primary hover:text-primary"
              >
                ← Anterior
              </Link>
            )}
            {submissions.page < submissions.total_pages && (
              <Link
                href={`/popups/${id}?page=${submissions.page + 1}`}
                className="rounded-md border border-border px-2 py-1 hover:border-primary hover:text-primary"
              >
                Siguiente →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
