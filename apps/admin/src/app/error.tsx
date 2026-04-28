'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps): React.ReactElement {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{t('somethingWentWrong')}</h1>
        <p className="text-sm text-muted-foreground">{error.message || t('unexpected')}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted"
        >
          {t('tryAgain')}
        </button>
      </div>
    </main>
  );
}
