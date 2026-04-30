import nextConfig from '@datapp/config/eslint/next';

export default [
  ...nextConfig,
  {
    ignores: ['.next/**', 'dist/**', 'coverage/**', 'next-env.d.ts'],
  },
];
