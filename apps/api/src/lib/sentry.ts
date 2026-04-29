import * as Sentry from '@sentry/node';

/**
 * Initialize Sentry from env. Idempotent — safe to call from both
 * `main.ts` and `worker.ts`. When `SENTRY_DSN_API` is empty the SDK
 * stays disabled (no network calls), which is what we want in tests
 * and CI.
 */
export function initSentry(serviceTag: 'api' | 'worker'): void {
  const dsn = process.env['SENTRY_DSN_API'];
  if (!dsn || dsn.length === 0) return;

  const release = process.env['APP_VERSION'];
  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENVIRONMENT'] ?? 'development',
    ...(release ? { release } : {}),
    serverName: serviceTag,
    // Performance off by default — turn on per-route once we have a
    // baseline for what costs what. Sampling 0 keeps overhead near zero.
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    // Drop noisy events that don't help diagnose user-facing issues.
    ignoreErrors: [
      'ThrottlerException', // expected: rate-limited
      'UnauthorizedException', // expected: bad password
    ],
  });
  Sentry.setTag('service', serviceTag);
}

/** Re-export so callers don't need to import @sentry/node directly. */
export { Sentry };
