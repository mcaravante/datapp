'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps): React.ReactElement {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">Something went wrong</h1>
        <p className="text-sm text-neutral-500">{error.message || 'Unexpected error'}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
