import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import json from '@eslint/json';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'docs',
      'test_output',
      'dist',
      '.stryker*',
      '.stryker-tmp',
      'node_modules',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {globals: globals.node},
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  {...js.configs.recommended, files: ['**/*.{js,mjs,cjs}']},
  // Apply all recommended TypeScript ESLint rules, but only to TypeScript files.
  // This mapping ensures that each config object from tseslint.configs.recommended
  // is scoped to files matching *.ts, *.mts, or *.cts, preventing TS rules from
  // affecting non-TypeScript files (like JSON or JS).
  // Note: js.configs.recommended is a single object, so we can spread it directly.
  // tseslint.configs.recommended is an array of objects, so we need to map each
  // object to add the files property, then spread the resulting array.
  ...tseslint.configs.recommended.map(cfg => ({
    ...cfg,
    files: ['**/*.{ts,mts,cts}'],
  })),
  {
    files: ['**/*.{ts,mts,cts}'],
    rules: {
      'no-ternary': 'error',
    },
  },
  {
    files: ['**/*.json'],
    plugins: {json},
    language: 'json/json',
    rules: {
      'json/no-empty-keys': 'error',
    },
  },
  // Relax linting for package-lock.json
  {
    files: ['package-lock.json'],
    rules: {
      'json/no-empty-keys': 'off',
    },
  },
  // Apply Prettier config to disable conflicting ESLint rules
  prettierConfig,
];
