// Next.js instrumentation hook — runs once when the server starts.
// Loads the right Sentry config based on which runtime is booting.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Next.js calls `onRequestError` on every request error in App Router.
// `@sentry/nextjs` exports it under `captureRequestError`.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
