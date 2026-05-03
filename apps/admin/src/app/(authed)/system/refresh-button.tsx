'use client';

import { useTranslations } from 'next-intl';
import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { revalidateTenantCache } from './actions';

/**
 * Magento-style cache refresh button. Calls the tenant-scoped server
 * action, then `router.refresh()` so any page the user navigates to
 * next sees the regenerated data immediately. The status line below
 * the button surfaces the duration (and last-refreshed time) so the
 * operator gets feedback that something actually happened.
 */
export function RefreshCacheButton(): React.ReactElement {
  const t = useTranslations('system');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ms: number; at: Date } | null>(null);

  function onClick(): void {
    startTransition(async () => {
      const result = await revalidateTenantCache();
      if (result.ok) {
        setStatus({ ms: result.durationMs, at: new Date() });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshIcon spinning={isPending} className="h-4 w-4" />
        {isPending ? t('refreshButton.pending') : t('refreshButton.idle')}
      </button>
      {status && (
        <p className="text-xs text-muted-foreground">
          {t('refreshButton.done', {
            ms: status.ms,
            at: status.at.toLocaleTimeString(),
          })}
        </p>
      )}
    </div>
  );
}

function RefreshIcon({
  className,
  spinning,
}: {
  className?: string;
  spinning?: boolean;
}): React.ReactElement {
  return (
    <svg
      className={`${className ?? ''} ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
