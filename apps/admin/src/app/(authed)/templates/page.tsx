import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import type { EmailTemplateSummary } from '@/lib/types';

export const metadata = { title: 'Datapp · Templates de email' };

export default async function TemplatesListPage(): Promise<React.ReactElement> {
  const { data: templates } = await apiFetch<{ data: EmailTemplateSummary[] }>(
    '/v1/admin/email-templates',
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Templates de email
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plantillas reutilizables. Cada stage de campaña referencia una de estas.
          </p>
        </div>
        <Link
          href="/templates/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          + Nuevo template
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Formato</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Todavía no creaste ningún template.{' '}
                  <Link href="/templates/new" className="text-primary hover:underline">
                    Crear el primero
                  </Link>
                  .
                </td>
              </tr>
            )}
            {templates.map((t) => (
              <tr
                key={t.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/templates/${t.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {t.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{t.subject}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.slug}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.channel}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.format.toUpperCase()}</td>
                <td className="px-4 py-3">
                  {t.is_active ? (
                    <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[11px] uppercase tracking-wider text-success">
                      activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted/40 px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      inactivo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(t.updated_at).toLocaleString('es-AR', {
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
