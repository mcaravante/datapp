// Server-side Sentry init for Next.js (Node runtime — RSC, route
// handlers, server actions). Loaded by @sentry/nextjs.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN_ADMIN;

if (dsn && dsn.length > 0) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'development',
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    ignoreErrors: ['NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
  });
}
