'use client';

import { useTranslations } from 'next-intl';
import { useTransition, useState, useRef } from 'react';
import { upsertMethodLabel, removeMethodLabel } from './actions';
import type { MethodLabelRow, MethodKind } from '@/lib/types';

interface Props {
  initial: MethodLabelRow[];
}

interface FormState {
  kind: MethodKind;
  code: string;
  title: string;
  mergeIntoCode: string;
}

const EMPTY_FORM: FormState = {
  kind: 'payment',
  code: '',
  title: '',
  mergeIntoCode: '',
};

/**
 * Curated mapping `code → title` per dimension. The form lets the
 * operator pick the kind (payment / shipping), paste the technical
 * code from the order detail page, and type the friendly title that
 * matches the Magento admin configuration. The list below shows what
 * is already mapped.
 *
 * Editing reuses the same form: clicking "Edit" pre-fills the inputs
 * and the upsert endpoint updates by `(tenant, kind, code)` — so as
 * long as the code stays the same, save overwrites in place.
 */
export function MethodLabelsForm({ initial }: Props): React.ReactElement {
  const t = useTranslations('system.methodLabels');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const formRef = useRef<HTMLFormElement>(null);

  function handleAdd(formData: FormData): void {
    setError(null);
    startTransition(async () => {
      const result = await upsertMethodLabel(formData);
      if (!result.ok) setError(result.error ?? 'Unknown error');
      else {
        setForm(EMPTY_FORM);
        formRef.current?.reset();
      }
    });
  }

  function handleRemove(id: string): void {
    setError(null);
    startTransition(async () => {
      const result = await removeMethodLabel(id);
      if (!result.ok) setError(result.error ?? 'Unknown error');
    });
  }

  function handleEdit(row: MethodLabelRow): void {
    setError(null);
    setForm({
      kind: row.kind,
      code: row.code,
      title: row.title,
      mergeIntoCode: row.merge_into_code ?? '',
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-4">
      <form
        ref={formRef}
        action={handleAdd}
        className="space-y-3 rounded-md border border-border bg-background/50 p-3"
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('kindLabel')}</span>
            <select
              name="kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as MethodKind })}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="payment">{t('kinds.payment')}</option>
              <option value="shipping">{t('kinds.shipping')}</option>
            </select>
          </label>
          <label className="flex flex-1 min-w-[180px] flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('codeLabel')}</span>
            <input
              type="text"
              name="code"
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder={t('codePlaceholder')}
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="flex flex-[2] min-w-[220px] flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('titleLabel')}</span>
            <input
              type="text"
              name="title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t('titlePlaceholder')}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 min-w-[260px] flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('mergeIntoLabel')}</span>
            <input
              type="text"
              name="mergeIntoCode"
              value={form.mergeIntoCode}
              onChange={(e) => setForm({ ...form, mergeIntoCode: e.target.value })}
              placeholder={t('mergeIntoPlaceholder')}
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <span className="text-[11px] text-muted-foreground">{t('mergeIntoHint')}</span>
          </label>
          <div className="ml-auto flex gap-2">
            {(form.code !== '' || form.title !== '' || form.mergeIntoCode !== '') && (
              <button
                type="button"
                onClick={() => setForm(EMPTY_FORM)}
                disabled={isPending}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {t('clear')}
              </button>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? t('saving') : t('save')}
            </button>
          </div>
        </div>
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
              <th className="px-4 py-2 font-semibold">{t('table.kind')}</th>
              <th className="px-4 py-2 font-semibold">{t('table.code')}</th>
              <th className="px-4 py-2 font-semibold">{t('table.title')}</th>
              <th className="px-4 py-2 font-semibold">{t('table.mergeInto')}</th>
              <th className="px-4 py-2 text-right font-semibold">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {initial.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-muted-foreground">{t(`kinds.${row.kind}`)}</td>
                <td className="px-4 py-2 font-mono text-xs text-foreground">{row.code}</td>
                <td className="px-4 py-2 text-foreground">{row.title}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {row.merge_into_code ?? '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(row)}
                      disabled={isPending}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground transition hover:bg-muted disabled:opacity-50"
                    >
                      {t('table.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(row.id)}
                      disabled={isPending}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      {t('table.remove')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
