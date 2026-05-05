'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setCustomerExcluded } from './actions';

interface Props {
  email: string;
  initialExcluded: boolean;
}

/**
 * Per-row toggle that adds or removes a customer email from the
 * analytics exclusion list. Optimistic — the visual flips on click and
 * reverts only if the server action returns an error.
 */
export function ExcludeToggle({ email, initialExcluded }: Props): React.ReactElement {
  const t = useTranslations('customers.exclude');
  const [excluded, setExcluded] = useState(initialExcluded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    const next = !excluded;
    setExcluded(next);
    startTransition(async () => {
      const result = await setCustomerExcluded(email, next);
      if (!result.ok) {
        setExcluded(!next);
        setError(result.error ?? 'Error');
      } else {
        setExcluded(result.excluded);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={excluded}
        className={
          excluded
            ? 'inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive transition hover:bg-destructive/15 disabled:opacity-60'
            : 'inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60'
        }
        title={excluded ? t('isExcludedHint') : t('isIncludedHint')}
      >
        <span aria-hidden="true">{excluded ? '✓' : '○'}</span>
        {excluded ? t('isExcluded') : t('exclude')}
      </button>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
