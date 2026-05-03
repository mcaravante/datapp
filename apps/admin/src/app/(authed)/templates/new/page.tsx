'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { createTemplate } from '../actions';
import { RichTextEditor } from '@/components/rich-text-editor';
import type { EmailTemplateChannel, EmailTemplateFormat } from '@/lib/types';

// Sensible defaults that produce a working recovery email even if the
// operator just clicks "Crear" without changing anything. The body uses
// inline styles because most email clients strip <style> tags or
// `class` attributes — anything we want them to honor goes inline.
const DEFAULT_HTML = `<h1 style="font-size: 22px; margin: 0 0 16px;">Hola {{customer.firstName}}</h1>
<p>Notamos que dejaste algo en tu carrito.</p>
<p>Tenés <strong>{{itemsCount}}</strong> productos por <strong>{{currencyCode}} {{grandTotal}}</strong>.</p>
{{#if coupon}}
<p style="background: #fff3cd; padding: 12px; border-radius: 6px;">
  Aplicamos <strong>{{coupon.code}}</strong> automáticamente al volver al carrito.
</p>
{{/if}}
<p style="margin: 24px 0;">
  <a href="{{recoveryUrl}}" style="display: inline-block; background: #111; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Volver al carrito</a>
</p>
<p style="color: #888; font-size: 12px; margin-top: 32px;">Si ya completaste tu compra, ignorá este mensaje.</p>`;

const DEFAULT_TEXT =
  'Hola {{customer.firstName}}, te dejaste {{itemsCount}} productos en tu carrito por {{currencyCode}} {{grandTotal}}. Volvé al carrito: {{recoveryUrl}}';

export default function NewTemplatePage(): React.ReactElement {
  const [name, setName] = useState('Recupero — stage 1');
  const [slug, setSlug] = useState('recovery-stage-1');
  const [channel, setChannel] = useState<EmailTemplateChannel>('abandoned_cart');
  const [subject, setSubject] = useState('Hola {{customer.firstName}}, te dejaste el carrito 🛒');
  const [format, setFormat] = useState<EmailTemplateFormat>('html');
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_HTML);
  const [bodyText, setBodyText] = useState(DEFAULT_TEXT);
  const [isActive, setIsActive] = useState(true);
  const [submitting, startSubmitting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    startSubmitting(async () => {
      try {
        await createTemplate({
          channel,
          slug: slug.trim(),
          name: name.trim(),
          subject: subject.trim(),
          bodyHtml,
          bodyText: bodyText.trim() === '' ? null : bodyText,
          format,
          isActive,
          variables: {
            required: ['customer', 'itemsCount', 'grandTotal', 'currencyCode', 'recoveryUrl'],
          },
        });
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Nuevo template de email
        </h1>
        <Link href="/templates" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              lower-case, dígitos y guiones. Inmutable después de crear.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Canal
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as EmailTemplateChannel)}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="abandoned_cart">Carrito abandonado</option>
              <option value="transactional">Transaccional (reservado)</option>
              <option value="marketing">Marketing (reservado)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Formato
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as EmailTemplateFormat)}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="html">HTML (editor visual)</option>
              <option value="mjml">MJML (markup avanzado)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Asunto
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Soporta variables Handlebars como <code>{'{{customer.firstName}}'}</code>.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cuerpo del email
          </label>
          {format === 'mjml' ? (
            <>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={20}
                className="block w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Modo MJML: el editor visual no aplica. Escribí el markup MJML directamente.
              </p>
            </>
          ) : (
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} minHeight={420} />
          )}
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
          <p className="mt-1 text-xs text-muted-foreground">
            Versión texto que se manda como fallback para clientes sin HTML / accesibilidad.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Activo
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href="/templates"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground transition hover:bg-muted"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Creando…' : 'Crear template'}
          </button>
        </div>
      </form>
    </div>
  );
}
