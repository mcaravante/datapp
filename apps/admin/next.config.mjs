import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
    // Standalone tracing root (Next 14 keeps this under `experimental`).
    // Without it, workspace packages like `@cdp/shared` are missing from
    // the bundle at runtime.
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  transpilePackages: ['@cdp/shared'],
};

// Sentry wraps the Next config to register source maps + the
// instrumentation hook. We disable source-map upload here because it
// requires SENTRY_AUTH_TOKEN; turn it on when the CI step exists.
const withSentry = (cfg) =>
  withSentryConfig(cfg, {
    silent: true,
    hideSourceMaps: true,
    disableLogger: true,
    sourcemaps: { disable: true },
  });

export default withSentry(withNextIntl(nextConfig));
