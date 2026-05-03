'use client';

import { useTranslations } from 'next-intl';
import { useTransition, useState, useRef } from 'react';
import { addExcludedEmail, removeExcludedEmail } from './actions';
import type { ExcludedEmailRow } from '@/lib/types';

interface Props {
  initial: ExcludedEmailRow[];
}

/**
 * Two-pane editor: an add form on top, the current list with per-row
 * delete buttons below. Both actions go through server actions that
 * also bust the tenant cache so the next dashboard render reflects the
 * change immediately.
 */
export function ExcludedEmailsForm({ initial }: Props): React.ReactElement {
  const t = useTranslations('system.excluded');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleAdd(formData: FormData): void {
    setError(null);
    startTransition(async () => {
      const result = await addExcludedEmail(formData);
      if (!result.ok) {
        setError(result.error ?? 'Unknown error');
      } else {
        formRef.current?.reset();
      }
    });
  }

  function handleRemove(id: string): void {
    setError(null);
    startTransition(async () => {
      const result = await removeExcludedEmail(id);
      if (!result.ok) setError(result.error ?? 'Unknown error');
    });
  }

  return (
    <div className="space-y-4">
      <form
        ref={formRef}
        action={handleAdd}
        className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-background/50 p-3"
      >
        <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('emailLabel')}</span>
          <input
            type="text"
            name="email"
            required
            placeholder={t('emailPlaceholder')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <span className="text-[10px] text-muted-foreground">{t('emailHint')}</span>
        </label>
        <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('reasonLabel')}</span>
          <input
            type="text"
            name="reason"
            placeholder={t('reasonPlaceholder')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? t('adding') : t('add')}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">{t('table.email')}</th>
              <th className="px-4 py-2 font-semibold">{t('table.reason')}</th>
              <th className="px-4 py-2 font-semibold">{t('table.addedBy')}</th>
              <th className="px-4 py-2 font-semibold">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {initial.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-foreground">{row.email}</td>
                <td className="px-4 py-2 text-muted-foreground">{row.reason ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {row.added_by ? row.added_by.name : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemove(row.id)}
                    disabled={isPending}
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {t('table.remove')}
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
