'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { syncCustomerGroups, type SyncResult } from './actions';

export function SyncButton(): React.ReactElement {
  const t = useTranslations('segments.sync');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);

  function handleClick(): void {
    setResult(null);
    startTransition(async () => {
      const r = await syncCustomerGroups();
      setResult(r);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? t('running') : t('cta')}
      </button>
      {result?.ok && (
        <p className="text-[11px] text-muted-foreground">
          {t('done', {
            scanned: result.scanned ?? 0,
            upserted: result.upserted ?? 0,
            profileLinks: result.profileLinks ?? 0,
          })}
        </p>
      )}
      {result && !result.ok && (
        <p className="text-[11px] text-destructive">{result.error ?? 'Error'}</p>
      )}
    </div>
  );
}
