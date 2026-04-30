import nestConfig from '@datapp/config/eslint/nest';

export default [
  ...nestConfig,
  {
    ignores: ['dist/**', 'coverage/**', '**/generated/**'],
  },
];
