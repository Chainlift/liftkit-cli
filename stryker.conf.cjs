/**
 * @type {import('@stryker-mutator/api/core').StrykerOptions}
 */
module.exports = {
  mutate: [
    'source/**/*.ts',
    '!source/**/*.test.ts',
    '!**/node_modules/**',
  ],
  testRunner: 'vitest',
  reporters: ['html', 'clear-text', 'progress'],
  coverageAnalysis: 'off',
  tsconfigFile: 'tsconfig.json',
}; 