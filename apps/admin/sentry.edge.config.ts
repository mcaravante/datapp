// Edge runtime init. Used when middleware runs on the Edge runtime
// (we currently use Node runtime, but @sentry/nextjs still expects this
// file — it's harmless on Node).

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN_ADMIN;

if (dsn && dsn.length > 0) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'development',
    tracesSampleRate: 0,
    ignoreErrors: ['NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
  });
}
