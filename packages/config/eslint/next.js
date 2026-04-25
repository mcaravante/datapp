import baseConfig from './base.js';
import globals from 'globals';

/**
 * ESLint preset for Next.js (App Router) apps. We don't pull in the
 * Next plugin from this package to avoid forcing it on non-Next consumers
 * — apps add `eslint-plugin-next` themselves and merge it in their local
 * eslint.config.js.
 */
export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Next.js page/layout/route default exports are mandatory.
      'import/no-default-export': 'off',
    },
  },
];
