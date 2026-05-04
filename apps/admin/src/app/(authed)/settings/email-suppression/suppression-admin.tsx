'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSuppression, deleteSuppression } from './actions';
import type { SuppressionReason, SuppressionRow } from '@/lib/types';

const REASON_LABELS: Record<SuppressionReason, string> = {
  manual: 'Bloqueo manual',
  hard_bounce: 'Hard bounce',
  spam_complaint: 'Marcado como spam',
  unsubscribed: 'Se desuscribió',
  invalid_address: 'Dirección inválida',
  test_allowlist: 'Test allowlist',
};

const REASON_BADGE_CLASS: Record<SuppressionReason, string> = {
  manual: 'bg-muted/40 text-muted-foreground',
  hard_bounce: 'bg-destructive/15 text-destructive',
  spam_complaint: 'bg-destructive/15 text-destructive',
  unsubscribed: 'bg-warning/15 text-warning',
  invalid_address: 'bg-destructive/15 text-destructive',
  test_allowlist: 'bg-muted/40 text-muted-foreground',
};

const FILTERABLE_REASONS: SuppressionReason[] = [
  'unsubscribed',
  'hard_bounce',
  'spam_complaint',
  'manual',
  'invalid_address',
];

export function SuppressionAdmin({
  rows,
  total,
  currentReason,
  currentQuery,
}: {
  rows: SuppressionRow[];
  total: number;
  currentReason: string;
  currentQuery: string;
}): React.ReactElement {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState<'manual' | 'unsubscribed' | 'invalid_address'>('manual');
  const [newNotes, setNewNotes] = useState('');
  const [adding, startAdding] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function buildFilterUrl(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams();
    const next: Record<string, string | null> = {
      q: currentQuery || null,
      reason: currentReason || null,
      ...overrides,
    };
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return `/settings/email-suppression${qs ? `?${qs}` : ''}`;
  }

  function onAdd(): void {
    setError(null);
    startAdding(async () => {
      try {
        const trimmedNotes = newNotes.trim();
        await createSuppression({
          email: newEmail.trim(),
          reason: newReason,
          ...(trimmedNotes ? { notes: trimmedNotes } : {}),
        });
        setNewEmail('');
        setNewNotes('');
        setShowAdd(false);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function onDelete(id: string, email: string): void {
    if (!confirm(`Quitar ${email} de la lista? Va a poder volver a recibir emails.`)) return;
    setError(null);
    startDeleting(async () => {
      try {
        await deleteSuppression(id);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form action="/settings/email-suppression" method="get" className="flex flex-wrap gap-2">
          {currentReason && <input type="hidden" name="reason" value={currentReason} />}
          <input
            type="search"
            name="q"
            defaultValue={currentQuery}
            placeholder="Buscar por email o nota…"
            className="block w-72 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            Buscar
          </button>
          {(currentQuery || currentReason) && (
            <a
              href="/settings/email-suppression"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition hover:bg-muted"
            >
              Limpiar
            </a>
          )}
        </form>

        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="ml-auto rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          {showAdd ? 'Cancelar' : '+ Bloquear email'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Filtrar por motivo:</span>
        <a
          href={buildFilterUrl({ reason: null })}
          className={`rounded-full border px-2 py-0.5 ${
            currentReason === ''
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground hover:bg-muted'
          }`}
        >
          Todos
        </a>
        {FILTERABLE_REASONS.map((r) => (
          <a
            key={r}
            href={buildFilterUrl({ reason: r })}
            className={`rounded-full border px-2 py-0.5 ${
              currentReason === r
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            {REASON_LABELS[r]}
          </a>
        ))}
      </div>

      {showAdd && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Bloquear nuevo email</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Motivo
              </label>
              <select
                value={newReason}
                onChange={(e) =>
                  setNewReason(e.target.value as 'manual' | 'unsubscribed' | 'invalid_address')
                }
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="manual">Bloqueo manual</option>
                <option value="unsubscribed">Se desuscribió (manual)</option>
                <option value="invalid_address">Dirección inválida</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notas (opcional)
            </label>
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              placeholder="Ej. Pidió por chat que no le mandemos más"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onAdd}
              disabled={adding || !newEmail.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
            >
              {adding ? 'Guardando…' : 'Bloquear'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {total === 0
            ? 'Ningún email bloqueado.'
            : total === 1
              ? '1 email bloqueado'
              : `${total.toLocaleString('es-AR')} emails bloqueados`}
          {(currentQuery || currentReason) && ' (con filtros aplicados)'}
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/20">
            <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Motivo</th>
              <th className="px-4 py-2">Origen</th>
              <th className="px-4 py-2">Notas</th>
              <th className="px-4 py-2">Bloqueado</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Sin resultados.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-mono text-xs text-foreground">{r.email}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${REASON_BADGE_CLASS[r.reason]}`}
                  >
                    {REASON_LABELS[r.reason]}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">
                  {r.source ?? '—'}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.notes ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString('es-AR', {
                    timeZone: 'America/Argentina/Buenos_Aires',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(r.id, r.email)}
                    disabled={deleting}
                    className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground transition hover:bg-muted disabled:opacity-50"
                    title="Quitar de la lista (vuelve a poder recibir emails)"
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
