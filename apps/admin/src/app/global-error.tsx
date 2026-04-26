'use client';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps): React.ReactElement {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 font-sans text-neutral-900 antialiased">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-neutral-500">{error.message || 'Unexpected error'}</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
