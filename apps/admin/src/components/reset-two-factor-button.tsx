'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { adminResetTwoFactor } from '@/app/(authed)/users/two-factor-actions';

interface Props {
  userId: string;
  userEmail: string;
  has2fa: boolean;
}

export function ResetTwoFactorButton({
  userId,
  userEmail,
  has2fa,
}: Props): React.ReactElement {
  const t = useTranslations('users.twoFactor');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!has2fa) return <></>;

  function onReset(): void {
    setError(null);
    startTransition(async () => {
      try {
        await adminResetTwoFactor(userId);
        setSuccess(true);
        setOpen(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        setError(t('resetError', { message: msg }));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-soft transition hover:bg-muted"
      >
        {t('resetButton')}
      </button>
      {success && (
        <span className="ml-2 text-xs text-success">{t('resetSuccess')}</span>
      )}
      {error && <span className="ml-2 text-xs text-destructive">{error}</span>}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-elevated">
            <h3 className="text-base font-semibold text-foreground">
              {t('resetConfirmTitle', { email: userEmail })}
            </h3>
            <p className="text-sm text-muted-foreground">{t('resetConfirmBody')}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={onReset}
                disabled={isPending}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground shadow-soft transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? t('resetting') : t('reset')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
