'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type {
  PopupDetail,
  PopupDisplayFrequency,
  PopupField,
  PopupKind,
  PopupPageMatchKind,
  PopupPageMatchRule,
  PopupStatus,
  PopupTrigger,
} from '@/lib/types';
import { archivePopup, createPopup, updatePopup, type PopupFormInput } from './actions';

interface Props {
  popup: PopupDetail | null;
}

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const STATUS_OPTIONS: { value: PopupStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activo' },
  { value: 'paused', label: 'Pausado' },
  { value: 'archived', label: 'Archivado' },
];

const TRIGGER_OPTIONS: { value: PopupTrigger; label: string }[] = [
  { value: 'immediate', label: 'Inmediato (al cargar la página)' },
  { value: 'time_on_page', label: 'Después de N segundos' },
  { value: 'scroll_depth', label: 'Tras scroll de N% de la página' },
  { value: 'exit_intent', label: 'Cuando intenta salir (mouse hacia afuera)' },
];

const FREQUENCY_OPTIONS: { value: PopupDisplayFrequency; label: string }[] = [
  { value: 'once_per_session', label: 'Una vez por sesión' },
  { value: 'once_per_visitor', label: 'Una vez por visitante' },
  { value: 'every_visit', label: 'Cada visita' },
];

const RULE_KIND_OPTIONS: { value: PopupPageMatchKind; label: string }[] = [
  { value: 'starts_with', label: 'La URL empieza con' },
  { value: 'equals', label: 'La URL es exacta' },
  { value: 'regex', label: 'Regex' },
];

function emptyForm(): PopupFormInput {
  return {
    slug: '',
    name: '',
    kind: 'popup',
    status: 'draft',
    headline: '',
    subheadline: '',
    bodyHtml: '',
    imageUrl: '',
    primaryCtaLabel: 'Suscribirme',
    primaryColor: '#2563eb',
    consentText:
      'Acepto recibir correos comerciales. Puedo darme de baja en cualquier momento.',
    successMessage: '¡Listo! Te suscribiste correctamente.',
    fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
    trigger: 'time_on_page',
    triggerDelaySeconds: 5,
    displayFrequency: 'once_per_session',
    pageMatchRules: [],
    displayPriority: 0,
    showCap: null,
    submissionCap: null,
  };
}

function fromDetail(p: PopupDetail): PopupFormInput {
  return {
    name: p.name,
    kind: p.kind,
    status: p.status,
    headline: p.headline ?? '',
    subheadline: p.subheadline ?? '',
    bodyHtml: p.body_html ?? '',
    imageUrl: p.image_url ?? '',
    primaryCtaLabel: p.primary_cta_label ?? '',
    primaryColor: p.primary_color ?? '#2563eb',
    consentText: p.consent_text ?? '',
    successMessage: p.success_message ?? '',
    fields: p.fields.length
      ? p.fields.map((f) => ({
          name: f.name,
          label: f.label,
          type: f.type,
          required: f.required,
          ...(f.placeholder ? { placeholder: f.placeholder } : {}),
        }))
      : [{ name: 'email', label: 'Email', type: 'email', required: true }],
    trigger: p.trigger,
    triggerDelaySeconds: p.trigger_delay_seconds,
    displayFrequency: p.display_frequency,
    pageMatchRules: p.page_match_rules,
    displayPriority: p.display_priority,
    showCap: p.show_cap,
    submissionCap: p.submission_cap,
  };
}

export function PopupEditor({ popup }: Props): React.ReactElement {
  const router = useRouter();
  const isNew = popup === null;
  const initial = popup ? fromDetail(popup) : emptyForm();
  const [form, setForm] = useState<PopupFormInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patch<K extends keyof PopupFormInput>(key: K, value: PopupFormInput[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    if (isNew) {
      const slug = (form.slug ?? '').trim();
      if (!SLUG_REGEX.test(slug)) {
        setError('El slug debe ser kebab-case (letras, números y guiones).');
        return;
      }
    }
    const existing = popup;
    startTransition(async () => {
      try {
        if (existing === null) {
          await createPopup({
            ...form,
            slug: (form.slug ?? '').trim(),
            headline: form.headline || null,
            subheadline: form.subheadline || null,
            bodyHtml: form.bodyHtml || null,
            imageUrl: form.imageUrl || null,
            primaryCtaLabel: form.primaryCtaLabel || null,
            primaryColor: form.primaryColor || null,
            consentText: form.consentText || null,
            successMessage: form.successMessage || null,
          });
        } else {
          await updatePopup(existing.id, {
            name: form.name,
            kind: form.kind,
            status: form.status,
            headline: form.headline || null,
            subheadline: form.subheadline || null,
            bodyHtml: form.bodyHtml || null,
            imageUrl: form.imageUrl || null,
            primaryCtaLabel: form.primaryCtaLabel || null,
            primaryColor: form.primaryColor || null,
            consentText: form.consentText || null,
            successMessage: form.successMessage || null,
            fields: form.fields,
            trigger: form.trigger,
            triggerDelaySeconds: form.triggerDelaySeconds,
            displayFrequency: form.displayFrequency,
            pageMatchRules: form.pageMatchRules,
            displayPriority: form.displayPriority,
            showCap: form.showCap ?? null,
            submissionCap: form.submissionCap ?? null,
          });
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function handleArchive(): void {
    if (!popup) return;
    if (!confirm('¿Archivar este popup? Dejará de mostrarse en la storefront.')) return;
    startTransition(async () => {
      try {
        await archivePopup(popup.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Section title="Identificación">
          {isNew && (
            <Field label="Slug" hint="Sólo letras, números y guiones. Inmutable luego de crear.">
              <input
                value={form.slug ?? ''}
                onChange={(e) => patch('slug', e.target.value)}
                placeholder="bienvenida-newsletter"
                className={inputCls}
                required
              />
            </Field>
          )}
          <Field label="Nombre interno">
            <input
              value={form.name}
              onChange={(e) => patch('name', e.target.value)}
              className={inputCls}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select
                value={form.kind}
                onChange={(e) => patch('kind', e.target.value as PopupKind)}
                className={inputCls}
              >
                <option value="popup">Modal centrado</option>
                <option value="inline">Inline</option>
                <option value="bar">Barra superior</option>
              </select>
            </Field>
            <Field label="Estado">
              <select
                value={form.status}
                onChange={(e) => patch('status', e.target.value as PopupStatus)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Contenido">
          <Field label="Título">
            <input
              value={form.headline ?? ''}
              onChange={(e) => patch('headline', e.target.value)}
              className={inputCls}
              placeholder="¡Llevate 10% en tu primera compra!"
            />
          </Field>
          <Field label="Subtítulo">
            <input
              value={form.subheadline ?? ''}
              onChange={(e) => patch('subheadline', e.target.value)}
              className={inputCls}
              placeholder="Suscribite y recibí el cupón en tu inbox"
            />
          </Field>
          <Field label="HTML adicional (opcional)">
            <textarea
              value={form.bodyHtml ?? ''}
              onChange={(e) => patch('bodyHtml', e.target.value)}
              className={`${inputCls} min-h-[80px] font-mono text-xs`}
              placeholder="<p>HTML que aparece debajo del subtítulo.</p>"
            />
          </Field>
          <Field label="URL de la imagen (opcional)">
            <input
              value={form.imageUrl ?? ''}
              onChange={(e) => patch('imageUrl', e.target.value)}
              className={inputCls}
              placeholder="https://…/banner.jpg"
            />
          </Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Texto del botón">
              <input
                value={form.primaryCtaLabel ?? ''}
                onChange={(e) => patch('primaryCtaLabel', e.target.value)}
                className={inputCls}
                placeholder="Suscribirme"
              />
            </Field>
            <Field label="Color primario">
              <input
                type="color"
                value={form.primaryColor ?? '#2563eb'}
                onChange={(e) => patch('primaryColor', e.target.value)}
                className="h-9 w-full cursor-pointer rounded-md border border-border bg-background"
              />
            </Field>
          </div>
          <Field label="Texto de consentimiento">
            <textarea
              value={form.consentText ?? ''}
              onChange={(e) => patch('consentText', e.target.value)}
              className={`${inputCls} min-h-[60px] text-xs`}
            />
          </Field>
          <Field label="Mensaje de éxito">
            <input
              value={form.successMessage ?? ''}
              onChange={(e) => patch('successMessage', e.target.value)}
              className={inputCls}
            />
          </Field>
        </Section>

        <Section title="Campos del formulario">
          <FieldsEditor
            fields={form.fields}
            onChange={(fields) => patch('fields', fields)}
          />
        </Section>

        <Section title="Reglas de aparición">
          <Field
            label="Disparo"
            hint="Cuando el visitante reúne esta condición, mostramos el popup."
          >
            <select
              value={form.trigger}
              onChange={(e) => patch('trigger', e.target.value as PopupTrigger)}
              className={inputCls}
            >
              {TRIGGER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {(form.trigger === 'time_on_page' || form.trigger === 'scroll_depth') && (
            <Field
              label={
                form.trigger === 'time_on_page' ? 'Segundos en página' : 'Porcentaje de scroll'
              }
            >
              <input
                type="number"
                min={0}
                max={form.trigger === 'time_on_page' ? 600 : 100}
                value={form.triggerDelaySeconds}
                onChange={(e) => patch('triggerDelaySeconds', Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          )}
          <Field label="Frecuencia">
            <select
              value={form.displayFrequency}
              onChange={(e) =>
                patch('displayFrequency', e.target.value as PopupDisplayFrequency)
              }
              className={inputCls}
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Prioridad"
            hint="Si más de un popup matchea la página, el de prioridad más alta se muestra primero."
          >
            <input
              type="number"
              min={0}
              max={1000}
              value={form.displayPriority}
              onChange={(e) => patch('displayPriority', Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <PageMatchRulesEditor
            rules={form.pageMatchRules}
            onChange={(rules) => patch('pageMatchRules', rules)}
          />
        </Section>
      </div>

      <aside className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Vista previa</h2>
        <Preview form={form} />
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? 'Guardando…' : isNew ? 'Crear popup' : 'Guardar cambios'}
          </button>
          {popup !== null && popup.status !== 'archived' && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={pending}
              className="rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
            >
              Archivar
            </button>
          )}
        </div>
        {!isNew && (
          <p className="text-xs text-muted-foreground">
            Para que el popup aparezca en la storefront, su origen tiene que estar en la
            allowlist del tenant. Configurala en{' '}
            <a className="text-primary hover:underline" href="/system">/system</a>.
          </p>
        )}
      </aside>
    </form>
  );
}

const inputCls =
  'block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-card">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function FieldsEditor({
  fields,
  onChange,
}: {
  fields: PopupField[];
  onChange: (fields: PopupField[]) => void;
}): React.ReactElement {
  function update(idx: number, patch: Partial<PopupField>): void {
    onChange(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function remove(idx: number): void {
    onChange(fields.filter((_, i) => i !== idx));
  }
  function add(): void {
    onChange([
      ...fields,
      { name: `campo_${fields.length + 1}`, label: 'Campo', type: 'text', required: false },
    ]);
  }
  return (
    <div className="space-y-2">
      {fields.map((f, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[1fr_1fr_120px_60px_auto] items-center gap-2 rounded-md border border-border bg-background/40 p-2"
        >
          <input
            value={f.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            placeholder="name"
            className={inputCls}
          />
          <input
            value={f.label}
            onChange={(e) => update(idx, { label: e.target.value })}
            placeholder="Label"
            className={inputCls}
          />
          <select
            value={f.type}
            onChange={(e) => update(idx, { type: e.target.value })}
            className={inputCls}
          >
            <option value="email">email</option>
            <option value="text">text</option>
            <option value="tel">tel</option>
            <option value="checkbox">checkbox</option>
          </select>
          <label className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => update(idx, { required: e.target.checked })}
            />
            Req
          </label>
          <button
            type="button"
            onClick={() => remove(idx)}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        + Agregar campo
      </button>
    </div>
  );
}

function PageMatchRulesEditor({
  rules,
  onChange,
}: {
  rules: PopupPageMatchRule[];
  onChange: (rules: PopupPageMatchRule[]) => void;
}): React.ReactElement {
  function update(idx: number, patch: Partial<PopupPageMatchRule>): void {
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function remove(idx: number): void {
    onChange(rules.filter((_, i) => i !== idx));
  }
  function add(): void {
    onChange([...rules, { kind: 'starts_with', value: '/' }]);
  }
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-foreground">
        Páginas donde aparece
      </span>
      {rules.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Sin reglas = aparece en todas las páginas de la storefront.
        </p>
      ) : null}
      {rules.map((r, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[180px_1fr_auto] items-center gap-2 rounded-md border border-border bg-background/40 p-2"
        >
          <select
            value={r.kind}
            onChange={(e) => update(idx, { kind: e.target.value as PopupPageMatchKind })}
            className={inputCls}
          >
            {RULE_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={r.value}
            onChange={(e) => update(idx, { value: e.target.value })}
            className={inputCls}
            placeholder="/checkout"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        + Agregar regla
      </button>
    </div>
  );
}

function Preview({ form }: { form: PopupFormInput }): React.ReactElement {
  const primary = form.primaryColor || '#2563eb';
  const html = useMemo(() => {
    return form.bodyHtml && form.bodyHtml.trim() !== '' ? form.bodyHtml : '';
  }, [form.bodyHtml]);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/30 p-4">
      <div className="rounded-lg bg-card p-5 shadow-card">
        {form.imageUrl ? (
          <img
            src={form.imageUrl}
            alt=""
            className="mb-3 h-32 w-full rounded-md object-cover"
          />
        ) : null}
        {form.headline ? (
          <h3 className="text-lg font-semibold text-foreground">{form.headline}</h3>
        ) : null}
        {form.subheadline ? (
          <p className="mt-1 text-sm text-muted-foreground">{form.subheadline}</p>
        ) : null}
        {html ? (
          <div
            className="mt-3 text-sm text-foreground"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null}
        <div className="mt-4 space-y-2">
          {form.fields.map((f, i) => (
            <input
              key={i}
              type={f.type === 'checkbox' ? 'checkbox' : f.type}
              placeholder={f.placeholder ?? f.label}
              className={
                f.type === 'checkbox'
                  ? ''
                  : 'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
              }
              disabled
            />
          ))}
        </div>
        <button
          type="button"
          disabled
          className="mt-4 w-full rounded-md px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: primary }}
        >
          {form.primaryCtaLabel || 'Suscribirme'}
        </button>
        {form.consentText ? (
          <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
            {form.consentText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
