// Bundles the storefront loader into a single self-contained JS file
// served at https://loader.datapp.com.ar/loader.js. Target is ES2018
// (covers every browser still supported by Magento 2.4.x storefronts)
// and the output is minified IIFE so the storefront can include it
// with a plain `<script async>` tag without affecting any global it
// doesn't own.

import { build, context } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const watch = process.argv.includes('--watch');
const outDir = resolve('dist');
mkdirSync(outDir, { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ['src/loader.ts'],
  outfile: 'dist/loader.js',
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  format: 'iife',
  target: ['es2018'],
  platform: 'browser',
  legalComments: 'none',
  define: {
    // Replaced at build time. The storefront still passes ?api=... in
    // the script src to override per environment, but having a
    // sensible default lets `<script src=".../loader.js?tenant=acme">`
    // work without an explicit api= param in 95% of cases.
    'process.env.LOADER_DEFAULT_API_URL': JSON.stringify(
      process.env.LOADER_DEFAULT_API_URL ?? 'https://api.datapp.com.ar',
    ),
  },
};

if (watch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('[loader] watching src/ for changes …');
} else {
  const result = await build(config);
  if (result.errors.length > 0) process.exit(1);
  console.log('[loader] built dist/loader.js');
}
