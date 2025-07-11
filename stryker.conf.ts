import type {StrykerOptions} from '@stryker-mutator/api/core';

const config: StrykerOptions = {
	mutate: ['source/**/*.ts', '!source/**/*.test.ts', '!**/node_modules/**'],
	testRunner: 'vitest',
	reporters: ['html', 'clear-text', 'progress'],
	coverageAnalysis: 'off',
	tsconfigFile: 'tsconfig.json',
};

export default config;
