import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: [
			"test_output",
			"dist",
			".stryker*",
			".stryker-tmp",
			"node_modules"
		]
	},
	{ files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"] },
	{ files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], languageOptions: { globals: globals.node } },
	tseslint.configs.recommended,
	{ files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
	// Relax linting for package-lock.json
	{
		files: ["package-lock.json"],
		rules: {
			"json/no-empty-keys": "off"
		}
	},
]); 