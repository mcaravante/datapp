import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export default nextConfig;
