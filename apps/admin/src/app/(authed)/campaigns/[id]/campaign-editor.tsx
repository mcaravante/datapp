'use client';

import { useState, useTransition } from 'react';
import {
  deleteCampaign,
  replaceStages,
  updateCampaign,
  type StageInput,
} from '../actions';
import type {
  CouponMode,
  EmailCampaignDetail,
  EmailCampaignStatus,
  EmailTemplateSummary,
} from '@/lib/types';

interface StageDraft {
  position: number;
  delayHours: number;
  templateId: string;
  couponMode: CouponMode;
  couponStaticCode: string;
  couponDiscount: string;
  couponDiscountType: 'percent' | 'fixed';
  couponTtlHours: string;
  isActive: boolean;
}

function fromExisting(stage: EmailCampaignDetail['stages'][number]): StageDraft {
  return {
    position: stage.position,
    delayHours: stage.delay_hours,
    templateId: stage.template_id,
    couponMode: stage.coupon_mode,
    couponStaticCode: stage.coupon_static_code ?? '',
    couponDiscount: stage.coupon_discount ?? '',
    couponDiscountType: (stage.coupon_discount_type ?? 'percent') as 'percent' | 'fixed',
    couponTtlHours: stage.coupon_ttl_hours?.toString() ?? '',
    isActive: stage.is_active,
  };
}

function newStage(position: number, defaultTemplateId: string): StageDraft {
  return {
    position,
    delayHours: position === 1 ? 1 : position === 2 ? 24 : 72,
    templateId: defaultTemplateId,
    couponMode: 'none',
    couponStaticCode: '',
    couponDiscount: '',
    couponDiscountType: 'percent',
    couponTtlHours: '',
    isActive: true,
  };
}

function toApiInput(s: StageDraft): StageInput {
  return {
    position: s.position,
    delayHours: s.delayHours,
    templateId: s.templateId,
    couponMode: s.couponMode,
    couponStaticCode: s.couponMode === 'static_code' ? s.couponStaticCode || null : null,
    couponDiscount:
      s.couponMode === 'unique_code' ? (s.couponDiscount.trim() === '' ? null : s.couponDiscount) : null,
    couponDiscountType: s.couponMode === 'unique_code' ? s.couponDiscountType : null,
    couponTtlHours:
      s.couponMode === 'unique_code' && s.couponTtlHours.trim() !== ''
        ? Number(s.couponTtlHours)
        : null,
    isActive: s.isActive,
  };
}

export function CampaignEditor({
  campaign,
  templates,
}: {
  campaign: EmailCampaignDetail;
  templates: EmailTemplateSummary[];
}): React.ReactElement {
  const [name, setName] = useState(campaign.name);
  const [status, setStatus] = useState<EmailCampaignStatus>(campaign.status);
  const [fromEmail, setFromEmail] = useState(campaign.from_email ?? '');
  const [replyToEmail, setReplyToEmail] = useState(campaign.reply_to_email ?? '');
  const [stages, setStages] = useState<StageDraft[]>(campaign.stages.map(fromExisting));
  const [savingMeta, savingMetaTransition] = useTransition();
  const [savingStages, savingStagesTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaultTemplateId = templates[0]?.id ?? '';

  function patchStage(idx: number, patch: Partial<StageDraft>): void {
    setStages((current) => current.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addStage(): void {
    const nextPos = (stages[stages.length - 1]?.position ?? 0) + 1;
    setStages((current) => [...current, newStage(nextPos, defaultTemplateId)]);
  }

  function removeStage(idx: number): void {
    setStages((current) => current.filter((_, i) => i !== idx));
  }

  async function onSaveMeta(): Promise<void> {
    setError(null);
    savingMetaTransition(async () => {
      try {
        await updateCampaign(campaign.id, {
          name,
          status,
          fromEmail: fromEmail.trim() === '' ? null : fromEmail,
          replyToEmail: replyToEmail.trim() === '' ? null : replyToEmail,
        });
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  async function onSaveStages(): Promise<void> {
    setError(null);
    savingStagesTransition(async () => {
      try {
        await replaceStages(campaign.id, stages.map(toApiInput));
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  async function onDelete(): Promise<void> {
    if (!confirm('¿Eliminar esta campaña? Solo posible si está en draft o archivada.')) return;
    await deleteCampaign(campaign.id);
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Configuración general</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre" value={name} onChange={setName} />
          <SelectField
            label="Estado"
            value={status}
            onChange={(v) => setStatus(v as EmailCampaignStatus)}
          >
            <option value="draft">Borrador (no envía)</option>
            <option value="active">Activa</option>
            <option value="paused">Pausada</option>
            <option value="archived">Archivada</option>
          </SelectField>
          <Field
            label="From email override (opcional)"
            value={fromEmail}
            onChange={setFromEmail}
            placeholder="ventas@datapp.com.ar — vacío = usa RESEND_FROM_EMAIL"
          />
          <Field
            label="Reply-To (opcional)"
            value={replyToEmail}
            onChange={setReplyToEmail}
            placeholder=""
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <p className="text-xs text-muted-foreground">
            Sends últimos 30 días: <strong>{campaign.send_count_30d.toLocaleString('es-AR')}</strong>
            {campaign.archived_at &&
              ` · archivada el ${new Date(campaign.archived_at).toLocaleString('es-AR')}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveMeta}
              disabled={savingMeta}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
            >
              {savingMeta ? 'Guardando…' : 'Guardar configuración'}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-destructive bg-card px-3 py-1.5 text-sm text-destructive transition hover:bg-destructive/10"
            >
              Eliminar
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Stages</h2>
          <button
            type="button"
            onClick={addStage}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground transition hover:bg-muted"
          >
            + Agregar stage
          </button>
        </div>

        {stages.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Sin stages todavía. Agregá al menos uno para que la campaña envíe.
          </p>
        )}

        {stages.map((s, idx) => (
          <div key={idx} className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Stage #{s.position}</h3>
              <button
                type="button"
                onClick={() => removeStage(idx)}
                className="text-xs text-destructive hover:underline"
              >
                Quitar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Posición"
                value={s.position}
                onChange={(v) => patchStage(idx, { position: v })}
              />
              <NumberField
                label="Delay (horas desde el abandono)"
                value={s.delayHours}
                onChange={(v) => patchStage(idx, { delayHours: v })}
              />
              <SelectField
                label="Template"
                value={s.templateId}
                onChange={(v) => patchStage(idx, { templateId: v })}
              >
                {templates.length === 0 && <option value="">— sin templates —</option>}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Modo de cupón"
                value={s.couponMode}
                onChange={(v) => patchStage(idx, { couponMode: v as CouponMode })}
              >
                <option value="none">Sin cupón</option>
                <option value="static_code">Código fijo (pre-creado en Magento)</option>
                <option value="unique_code">Código único por destinatario</option>
              </SelectField>
            </div>

            {s.couponMode === 'static_code' && (
              <Field
                label="Código fijo"
                value={s.couponStaticCode}
                onChange={(v) => patchStage(idx, { couponStaticCode: v.toUpperCase() })}
                placeholder="RECUPERO10"
              />
            )}
            {s.couponMode === 'unique_code' && (
              <div className="grid grid-cols-3 gap-3">
                <Field
                  label="Descuento"
                  value={s.couponDiscount}
                  onChange={(v) => patchStage(idx, { couponDiscount: v })}
                  placeholder="10"
                />
                <SelectField
                  label="Tipo"
                  value={s.couponDiscountType}
                  onChange={(v) => patchStage(idx, { couponDiscountType: v as 'percent' | 'fixed' })}
                >
                  <option value="percent">% del subtotal</option>
                  <option value="fixed">Monto fijo</option>
                </SelectField>
                <Field
                  label="TTL (horas, opcional)"
                  value={s.couponTtlHours}
                  onChange={(v) => patchStage(idx, { couponTtlHours: v })}
                  placeholder="48"
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.isActive}
                onChange={(e) => patchStage(idx, { isActive: e.target.checked })}
              />
              Activo (si está apagado el scheduler lo ignora)
            </label>
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onSaveStages}
            disabled={savingStages}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {savingStages ? 'Guardando stages…' : 'Guardar stages'}
          </button>
        </div>

        <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          Guardar stages reemplaza la lista entera (no es un diff). Esto invalida los
          <code> magento_sales_rule_id</code> previos en modo <code>unique_code</code>; los
          códigos generados antes pueden seguir funcionando hasta su <code>to_date</code>.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}): React.ReactElement {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        {children}
      </select>
    </div>
  );
}
