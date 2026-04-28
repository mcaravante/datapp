'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLocaleAction } from '@/i18n/actions';
import { LOCALES, type Locale } from '@/i18n/config';

const FLAG: Record<Locale, string> = { es: 'ES', en: 'EN' };

export function LocaleToggle(): React.ReactElement {
  const t = useTranslations('common');
  const current = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function pick(value: Locale): void {
    if (value === current) return;
    startTransition(async () => {
      await setLocaleAction(value);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t('language')}
      className="inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-card p-0.5 text-[10px] font-semibold uppercase tracking-wider"
    >
      {LOCALES.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => pick(loc)}
            disabled={isPending}
            aria-pressed={active}
            className={
              active
                ? 'rounded-sm bg-primary px-2 py-1 text-primary-foreground'
                : 'rounded-sm px-2 py-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50'
            }
          >
            {FLAG[loc]}
          </button>
        );
      })}
    </div>
  );
}
