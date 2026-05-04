'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * All preset IDs supported across the admin. Pages opt into the subset
 * they want via the `presets` prop.
 */
export type RangePresetId = '7d' | '30d' | '90d' | '365d' | 'all';

interface TimeRangeSelectorProps {
  /** Subset of preset IDs this surface supports. Order is preserved. */
  presets: readonly RangePresetId[];
  /** Pathname (no query string). Eg `/products`, `/orders`, `/`. */
  basePath: string;
  /**
   * Current query params on the page. These are preserved across preset
   * clicks (eg a `q=foo` filter on /products survives a date-range
   * change). The selector overwrites `window` and clears `from`/`to`.
   */
  currentParams?: Record<string, string | string[] | undefined>;
  /** Currently active preset, for the highlighted button. */
  active: RangePresetId | null;
}

/**
 * Reusable date-range selector with a `useTransition`-backed loading
 * state. Without it, clicking 1 año / Histórico on a page that runs
 * heavy queries leaves the user staring at the previous render for
 * several seconds with no feedback — long enough to think the click
 * was lost and click again, queueing extra work.
 *
 * On click: dim the nav, mark the active button busy, disable inputs.
 * The page keeps showing stale data until Next.js streams the new
 * render in.
 */
export function TimeRangeSelector({
  presets,
  basePath,
  currentParams,
  active,
}: TimeRangeSelectorProps): React.ReactElement {
  const router = useRouter();
  const tPresets = useTranslations('presets');
  const [pending, startTransition] = useTransition();

  function buildHref(preset: RangePresetId): string {
    const params = new URLSearchParams();
    if (currentParams) {
      for (const [k, v] of Object.entries(currentParams)) {
        // Skip the params the selector itself controls.
        if (k === 'window' || k === 'from' || k === 'to') continue;
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          for (const item of v) params.append(k, item);
        } else {
          params.set(k, v);
        }
      }
    }
    params.set('window', preset);
    const qs = params.toString();
    return qs.length > 0 ? `${basePath}?${qs}` : basePath;
  }

  function go(preset: RangePresetId): void {
    startTransition(() => {
      router.push(buildHref(preset));
    });
  }

  return (
    <nav
      aria-busy={pending}
      className={`flex items-center gap-1 rounded-md border border-border bg-card p-1 text-xs shadow-soft ${
        pending ? 'opacity-70' : ''
      }`}
    >
      {presets.map((p) => {
        const isActive = active === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            disabled={pending}
            className={
              isActive
                ? 'inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground'
                : 'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50'
            }
          >
            {tPresets(p)}
            {pending && isActive && <Spinner className="h-3 w-3" />}
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
