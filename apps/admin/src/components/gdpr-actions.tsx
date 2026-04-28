'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface GdprActionsProps {
  customerId: string;
  customerEmail: string;
}

/**
 * Two privacy controls for a customer:
 * - Export: opens a JSON download (handled by GET route handler).
 * - Erase: irreversibly pseudonymizes PII; requires confirmation that
 *   types out the email exactly to avoid accidental clicks.
 */
export function GdprActions({ customerId, customerEmail }: GdprActionsProps): React.ReactElement {
  const t = useTranslations('customerDetail.privacy');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canConfirm = typed.trim().toLowerCase() === customerEmail.toLowerCase();

  function reset(): void {
    setOpen(false);
    setTyped('');
    setError(null);
  }

  async function onErase(): Promise<void> {
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/gdpr/${customerId}/erase`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.text();
      setError(t('errorPrefix', { status: res.status, body: body.slice(0, 200) }));
      return;
    }
    const data = (await res.json()) as { pseudonym_email: string };
    setSuccess(t('erasedToast', { pseudonym: data.pseudonym_email }));
    reset();
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('heading')}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('description')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/gdpr/${customerId}/export`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-soft transition hover:bg-muted"
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          {t('downloadJson')}
        </a>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/15"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          {t('erase')}
        </button>
      </div>

      {success && (
        <p className="mt-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          {success}
        </p>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="erase-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-elevated">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <TrashIcon className="h-4 w-4" />
              </span>
              <div>
                <h3 id="erase-title" className="text-base font-semibold text-foreground">
                  {t('confirmTitle')}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('confirmBody')}</p>
              </div>
            </div>

            <label className="block text-xs font-medium text-foreground">
              {t('typeEmail')}
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={customerEmail}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={onErase}
                disabled={!canConfirm || isPending}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground shadow-soft transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? t('erasing') : t('erase')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DownloadIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
