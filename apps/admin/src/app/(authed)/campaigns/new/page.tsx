import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { createCampaign } from '../actions';
import type { EmailTemplateSummary } from '@/lib/types';

export const metadata = { title: 'Datapp · Nueva campaña' };

export default async function NewCampaignPage(): Promise<React.ReactElement> {
  const { data: templates } = await apiFetch<{ data: EmailTemplateSummary[] }>(
    '/v1/admin/email-templates',
  );
  const activeTemplates = templates.filter(
    (t) => t.is_active && t.channel === 'abandoned_cart',
  );

  async function action(formData: FormData): Promise<void> {
    'use server';
    const stage1TemplateId = String(formData.get('stage1TemplateId') ?? '');
    await createCampaign({
      slug: String(formData.get('slug') ?? ''),
      name: String(formData.get('name') ?? ''),
      trigger: 'abandoned_cart_stage',
      status: (formData.get('status') as 'draft' | 'active') ?? 'draft',
      stages: stage1TemplateId
        ? [
            {
              position: 1,
              delayHours: Number(formData.get('stage1DelayHours') ?? 1),
              templateId: stage1TemplateId,
              couponMode: 'none',
              isActive: true,
            },
          ]
        : [],
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Nueva campaña de email
        </h1>
        <Link href="/campaigns" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver
        </Link>
      </div>

      {activeTemplates.length === 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          No hay templates activos del canal <code>abandoned_cart</code>.{' '}
          <Link href="/templates/new" className="underline">
            Creá uno primero
          </Link>{' '}
          y volvé.
        </div>
      )}

      <form action={action} className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-card">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Nombre
          </label>
          <input
            type="text"
            name="name"
            required
            defaultValue="Recupero de carritos"
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Slug
          </label>
          <input
            type="text"
            name="slug"
            required
            defaultValue="recupero-default"
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Lower-case, dígitos y guiones. Inmutable después de crear.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Estado inicial
          </label>
          <select
            name="status"
            defaultValue="draft"
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="draft">Borrador (no se envía)</option>
            <option value="active">Activa</option>
          </select>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-4">
          <h2 className="text-sm font-semibold text-foreground">Stage 1 (opcional)</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Te creo un primer stage con cupón <code>none</code>. Después podés agregar más
            stages, configurar cupones, etc. en la pantalla de detalle.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Template
              </label>
              <select
                name="stage1TemplateId"
                defaultValue={activeTemplates[0]?.id ?? ''}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="">— sin stage —</option>
                {activeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Delay (horas desde el abandono)
              </label>
              <input
                type="number"
                name="stage1DelayHours"
                min={0}
                max={2160}
                defaultValue={1}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href="/campaigns"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground transition hover:bg-muted"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            Crear campaña
          </button>
        </div>
      </form>
    </div>
  );
}
