'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

type PresetId = '7d' | '30d' | '90d' | '365d' | 'all';

const PRESETS: readonly PresetId[] = ['7d', '30d', '90d', '365d', 'all'];

/**
 * Range selector for the overview dashboard.
 *
 * Wrapping the navigation in `useTransition` lets the page show a
 * "loading" state during the server-side data fetch when the user
 * jumps to a heavier preset (1 year / histórico). Without it the
 * browser stays on the previous render with no feedback for several
 * seconds — long enough for users to think the click was lost and
 * click again.
 */
export function RangeSelector(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tPresets = useTranslations('presets');
  const [pending, startTransition] = useTransition();

  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const windowParam = (searchParams.get('window') ?? '30d') as PresetId;
  const usingPreset = !fromParam && !toParam;

  function go(preset: PresetId): void {
    const url = `/?window=${preset}`;
    startTransition(() => {
      router.push(url);
    });
  }

  return (
    <nav
      aria-busy={pending}
      className={`flex items-center gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft ${
        pending ? 'opacity-70' : ''
      }`}
    >
      {PRESETS.map((p) => {
        const active = usingPreset && windowParam === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            disabled={pending}
            className={
              active
                ? 'inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground'
                : 'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50'
            }
          >
            {tPresets(p)}
            {pending && active && <Spinner className="h-3 w-3" />}
          </button>
        );
      })}
      {pending && (
        <span className="ml-1 inline-flex items-center gap-1 px-2 text-muted-foreground">
          <Spinner className="h-3 w-3" />
          <span>cargando…</span>
        </span>
      )}
    </nav>
  );
}

function Spinner({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={`animate-spin ${className ?? ''}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 1-9 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
