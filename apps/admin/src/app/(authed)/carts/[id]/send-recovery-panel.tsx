'use client';

import { useState, useTransition } from 'react';
import { sendRecoveryNow } from './actions';
import type { EmailCampaignDetail, SendRecoveryResponse } from '@/lib/types';

export function SendRecoveryPanel({
  cartId,
  campaigns,
}: {
  cartId: string;
  campaigns: EmailCampaignDetail[];
}): React.ReactElement {
  const stagesFlat = campaigns.flatMap((c) =>
    c.stages
      .filter((s) => s.is_active)
      .map((s) => ({
        campaign: c.name,
        campaignStatus: c.status,
        stageId: s.id,
        position: s.position,
        templateName: s.template_name,
        couponMode: s.coupon_mode,
        delayHours: s.delay_hours,
      })),
  );

  const [stageId, setStageId] = useState<string>(stagesFlat[0]?.stageId ?? '');
  const [dispatch, setDispatch] = useState(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SendRecoveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (stagesFlat.length === 0) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
        No hay stages activos en ninguna campaña. Creá una campaña con al menos un stage para
        poder enviar emails desde acá.
      </div>
    );
  }

  function onSend(): void {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const out = await sendRecoveryNow(cartId, stageId, dispatch);
        setResult(out);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-card">
      <h2 className="text-sm font-semibold text-foreground">Enviar email de recupero ahora</h2>
      <p className="text-xs text-muted-foreground">
        El envío respeta el guard de <code>EMAIL_DRY_RUN</code> y la suppression list (frequency
        cap, bounces, unsubscribes). Si <code>EMAIL_DRY_RUN=true</code> y el email del carrito no
        está en el allowlist, el send queda como <code>suppressed</code> sin llamar a Resend.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Stage a usar
          </label>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {stagesFlat.map((s) => (
              <option key={s.stageId} value={s.stageId}>
                {s.campaign} · stage #{s.position} ({s.templateName}, cupón {s.couponMode})
              </option>
            ))}
          </select>
        </div>
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={dispatch}
            onChange={(e) => setDispatch(e.target.checked)}
          />
          <span>
            Despachar ahora (si está apagado solo se persiste el <code>EmailSend</code> en{' '}
            <code>pending</code>)
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={onSend}
        disabled={pending || stagesFlat.length === 0}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? 'Enviando…' : 'Enviar recupero ahora'}
      </button>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {result && (
        <div className="space-y-1 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-foreground">
          <p>
            <strong>Estado:</strong> {result.status}
          </p>
          {result.coupon_code && (
            <p>
              <strong>Cupón:</strong> <code>{result.coupon_code}</code>
            </p>
          )}
          {result.resend_message_id && (
            <p>
              <strong>Resend message id:</strong>{' '}
              <code className="break-all">{result.resend_message_id}</code>
            </p>
          )}
          <p className="break-all">
            <strong>Recovery URL:</strong>{' '}
            <a href={result.recovery_url} target="_blank" rel="noreferrer" className="underline">
              {result.recovery_url}
            </a>
          </p>
          {result.error_message && (
            <p className="text-warning">
              <strong>Mensaje:</strong> {result.error_message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
