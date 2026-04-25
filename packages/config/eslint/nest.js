import baseConfig from './base.js';

/**
 * ESLint preset for NestJS apps. Decorators + parameter properties + DI
 * patterns produce a couple of false positives we silence here.
 */
export default [
  ...baseConfig,
  {
    rules: {
      // Nest controllers/services use parameter properties heavily.
      '@typescript-eslint/parameter-properties': 'off',
      // Decorators legitimately mutate empty classes (e.g. modules).
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
