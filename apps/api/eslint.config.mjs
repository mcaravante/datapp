import nestConfig from '@cdp/config/eslint/nest';

export default [
  ...nestConfig,
  {
    ignores: ['dist/**', 'coverage/**', '**/generated/**'],
  },
];
