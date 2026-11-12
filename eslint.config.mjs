// Shared lint rules: catch real bugs (undefined names, unused code, unreachable branches), not style.
import js from '@eslint/js';
import globals from 'globals';

const rules = {
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  eqeqeq: ['error', 'smart'],
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/lib/**', 'src/i18n/dict.js', 'src/core/samples.js'] },
  js.configs.recommended,
  // ES modules that run in extension pages, the service worker and the web app.
  { files: ['src/**/*.js', 'web/boot.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.serviceworker, ...globals.webextensions } }, rules },
  // Content scripts and shims are classic scripts sharing one global namespace.
  { files: ['src/content/*.js', 'src/i18n/i18n.js', 'web/shim.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser, ...globals.webextensions } }, rules },
  // Node: tests and build tools. Browser globals too: Playwright runs callbacks inside the page.
  { files: ['test/**/*.mjs', 'tools/**/*.{mjs,cjs}', 'eslint.config.mjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }, rules: { ...rules, 'no-control-regex': 'off' } },
  { files: ['demo/**/*.js', 'dev-site/dev.js'], languageOptions: { sourceType: 'script', globals: globals.browser }, rules },
  { files: ['dev-site/*.mjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'module' }, rules },
];
