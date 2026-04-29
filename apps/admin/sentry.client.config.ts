// Browser-side Sentry init. Loaded automatically by @sentry/nextjs on
// every page. Empty DSN => SDK stays disabled (no network calls).

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN;

if (dsn && dsn.length > 0) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
    tracesSampleRate: 0,
    // Session replay is opt-in — leave it off until we explicitly want it.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    ignoreErrors: [
      // Next.js fires these whenever the user navigates away mid-render.
      // They aren't actionable bugs.
      'NEXT_REDIRECT',
      'NEXT_NOT_FOUND',
    ],
  });
}
