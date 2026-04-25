/** @type {import('lint-staged').Configuration} */
module.exports = {
  '*.{ts,tsx,js,jsx,mjs,cjs}': 'prettier --write',
  '*.{json,md,yml,yaml}': 'prettier --write',
};
