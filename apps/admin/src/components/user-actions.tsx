'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { deleteUser } from '@/app/(authed)/users/actions';

interface Props {
  userId: string;
  userEmail: string;
  disabled?: boolean;
}

export function DeleteUserButton({ userId, userEmail, disabled }: Props): React.ReactElement {
  const t = useTranslations('users.delete');
  const tForm = useTranslations('users.form');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete(): void {
    setError(null);
    startTransition(async () => {
      try {
        await deleteUser(userId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        if (msg.includes('NEXT_REDIRECT')) return;
        setError(t('errorPrefix', { message: msg }));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {tForm('deleteUser')}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-elevated">
            <h3 className="text-base font-semibold text-foreground">
              {t('confirmTitle', { email: userEmail })}
            </h3>
            <p className="text-sm text-muted-foreground">{t('confirmBody')}</p>
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={isPending}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground shadow-soft transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? t('deleting') : tCommon('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
