import nextConfig from '@cdp/config/eslint/next';

export default [
  ...nextConfig,
  {
    ignores: ['.next/**', 'dist/**', 'coverage/**', 'next-env.d.ts'],
  },
];
