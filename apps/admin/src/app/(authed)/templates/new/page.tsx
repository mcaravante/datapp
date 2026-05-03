import Link from 'next/link';
import { createTemplate } from '../actions';

export const metadata = { title: 'Datapp · Nuevo template' };

const DEFAULT_HTML = `<!doctype html>
<html>
  <body style="font-family: -apple-system, system-ui, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto; color: #111;">
    <h1 style="font-size: 22px; margin: 0 0 16px;">Hola {{customer.firstName}}</h1>
    <p>Notamos que dejaste algo en tu carrito.</p>
    <p>Tenés <strong>{{itemsCount}}</strong> productos por <strong>{{currencyCode}} {{grandTotal}}</strong>.</p>
    {{#if coupon}}
    <p style="background: #fff3cd; padding: 12px; border-radius: 6px;">
      Aplicamos <strong>{{coupon.code}}</strong> automáticamente al volver al carrito.
    </p>
    {{/if}}
    <p style="margin: 24px 0;">
      <a href="{{recoveryUrl}}" style="display: inline-block; background: #111; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">
        Volver al carrito
      </a>
    </p>
    <p style="color: #888; font-size: 12px; margin-top: 32px;">
      Si ya completaste tu compra, ignorá este mensaje.
    </p>
  </body>
</html>`;

const DEFAULT_TEXT =
  'Hola {{customer.firstName}}, te dejaste {{itemsCount}} productos en tu carrito por {{currencyCode}} {{grandTotal}}. Volvé al carrito: {{recoveryUrl}}';

export default function NewTemplatePage(): React.ReactElement {
  async function action(formData: FormData): Promise<void> {
    'use server';
    await createTemplate({
      channel: formData.get('channel') as 'abandoned_cart' | 'transactional' | 'marketing',
      slug: String(formData.get('slug') ?? ''),
      name: String(formData.get('name') ?? ''),
      subject: String(formData.get('subject') ?? ''),
      bodyHtml: String(formData.get('bodyHtml') ?? ''),
      bodyText: String(formData.get('bodyText') ?? '') || null,
      format: (formData.get('format') as 'html' | 'mjml') ?? 'html',
      isActive: formData.get('isActive') === 'on',
      variables: {
        required: ['customer', 'itemsCount', 'grandTotal', 'currencyCode', 'recoveryUrl'],
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Nuevo template de email
        </h1>
        <Link href="/templates" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver
        </Link>
      </div>

      <form action={action} className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-card">
        <Field label="Nombre" name="name" required defaultValue="Recupero — stage 1" />
        <Field
          label="Slug"
          name="slug"
          required
          defaultValue="recovery-stage-1"
          hint="lower-case, dígitos y guiones. Inmutable después de crear."
        />
        <SelectField label="Canal" name="channel" required defaultValue="abandoned_cart">
          <option value="abandoned_cart">Carrito abandonado</option>
          <option value="transactional">Transaccional (reservado)</option>
          <option value="marketing">Marketing (reservado)</option>
        </SelectField>
        <Field
          label="Asunto"
          name="subject"
          required
          defaultValue="Hola {{customer.firstName}}, te dejaste el carrito 🛒"
          hint="Soporta variables Handlebars como {{customer.firstName}}."
        />
        <SelectField label="Formato" name="format" required defaultValue="html">
          <option value="html">HTML</option>
          <option value="mjml">MJML</option>
        </SelectField>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cuerpo HTML
          </label>
          <textarea
            name="bodyHtml"
            required
            rows={18}
            defaultValue={DEFAULT_HTML}
            className="block w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cuerpo en texto plano (opcional)
          </label>
          <textarea
            name="bodyText"
            rows={4}
            defaultValue={DEFAULT_TEXT}
            className="block w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked /> Activo
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
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            Crear template
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  hint,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
}): React.ReactElement {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  name,
  required,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        {children}
      </select>
    </div>
  );
}
