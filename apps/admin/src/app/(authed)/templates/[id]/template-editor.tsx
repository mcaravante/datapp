'use client';

import { useState, useTransition } from 'react';
import { previewTemplate, updateTemplate, deleteTemplate } from '../actions';
import type { EmailTemplateDetail, EmailTemplatePreviewResponse } from '@/lib/types';

const SAMPLE_VARIABLES: Record<string, unknown> = {
  customer: { firstName: 'Matias' },
  itemsCount: 3,
  itemsQty: 5,
  subtotal: '11500.00',
  grandTotal: '12500.00',
  currencyCode: 'ARS',
  recoveryUrl: 'https://store.local/pupe_abandoned/cart/restore?token=abcd1234abcd1234abcd1234abcd1234',
  coupon: { code: 'RECUPERO10' },
  campaign: { name: 'Demo', stagePosition: 1 },
};

export function TemplateEditor({
  template,
}: {
  template: EmailTemplateDetail;
}): React.ReactElement {
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [bodyText, setBodyText] = useState(template.body_text ?? '');
  const [format, setFormat] = useState<'html' | 'mjml'>(template.format);
  const [isActive, setIsActive] = useState(template.is_active);

  const [preview, setPreview] = useState<EmailTemplatePreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [previewing, startPreview] = useTransition();

  const dirty =
    name !== template.name ||
    subject !== template.subject ||
    bodyHtml !== template.body_html ||
    (bodyText || '') !== (template.body_text ?? '') ||
    format !== template.format ||
    isActive !== template.is_active;

  async function onSave(): Promise<void> {
    startSaving(async () => {
      await updateTemplate(template.id, {
        name,
        subject,
        bodyHtml,
        bodyText: bodyText.trim() === '' ? null : bodyText,
        format,
        isActive,
      });
    });
  }

  async function onPreview(): Promise<void> {
    setPreviewError(null);
    startPreview(async () => {
      try {
        // Save first so the preview reflects current edits — preview
        // uses the persisted template, not the form state.
        if (dirty) {
          await updateTemplate(template.id, {
            name,
            subject,
            bodyHtml,
            bodyText: bodyText.trim() === '' ? null : bodyText,
            format,
            isActive,
          });
        }
        const out = await previewTemplate(template.id, SAMPLE_VARIABLES);
        setPreview(out);
      } catch (err) {
        setPreviewError((err as Error).message);
      }
    });
  }

  async function onDelete(): Promise<void> {
    if (!confirm('¿Eliminar este template? Solo es posible si no lo usa ninguna campaña.')) return;
    await deleteTemplate(template.id);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-card">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Nombre
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Asunto
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Formato
          </label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as 'html' | 'mjml')}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="html">HTML</option>
            <option value="mjml">MJML</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cuerpo HTML / MJML
          </label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={20}
            className="block w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cuerpo en texto plano (opcional)
          </label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={4}
            className="block w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Activo
        </label>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            onClick={onPreview}
            disabled={previewing}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            {previewing ? 'Renderizando…' : 'Preview con datos demo'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded-md border border-destructive bg-card px-3 py-1.5 text-sm text-destructive transition hover:bg-destructive/10"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-card p-4 shadow-card">
          <h2 className="text-sm font-semibold text-foreground">Preview</h2>
          {previewError && (
            <p className="mt-2 rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
              {previewError}
            </p>
          )}
          {!preview && !previewError && (
            <p className="mt-2 text-xs text-muted-foreground">
              Tocá <strong>Preview con datos demo</strong> para renderizar el template con un
              contexto de ejemplo. El preview guarda los cambios primero.
            </p>
          )}
          {preview && (
            <div className="mt-3 space-y-2">
              <div className="rounded-md bg-muted/40 p-2 text-xs">
                <span className="text-muted-foreground">Asunto:</span>{' '}
                <span className="font-medium text-foreground">{preview.subject}</span>
              </div>
              <iframe
                title="preview"
                srcDoc={preview.html}
                className="h-[700px] w-full rounded-md border border-border bg-white"
                sandbox=""
              />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-xs shadow-card">
          <p className="font-semibold text-foreground">Variables disponibles en el render</p>
          <pre className="mt-2 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(SAMPLE_VARIABLES, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
