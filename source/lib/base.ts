import fs from 'fs';
import path from 'path';
import jv from 'ajv';
import {spawn} from 'child_process';
import readline from 'readline';

export const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

export const question = (query: string): Promise<string> => {
	return new Promise(resolve => {
		rl.question(query, resolve);
	});
};

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonObject
	| JsonArray;
type JsonObject = {[key: string]: JsonValue};
type JsonArray = JsonValue[];

/**
 * Merges two JSON objects deeply, with the second object taking precedence
 * @param target - The base object to merge into
 * @param source - The object to merge from (takes precedence)
 * @returns A new merged object
 */
export function mergeJson(target: JsonValue, source: JsonValue): JsonValue {
	// Flattened: single switch for all type checks
	switch (true) {
		case source === null || source === undefined:
			return target;
		case target === null || target === undefined:
			return source;
		case Array.isArray(target) && Array.isArray(source):
			return [...target, ...source];
		case typeof target === 'object' &&
			typeof source === 'object' &&
			!Array.isArray(target) &&
			!Array.isArray(source) &&
			target !== null &&
			source !== null: {
			const result = {...(target as JsonObject)};
			Object.keys(source as JsonObject).forEach(key => {
				const sourceValue = (source as JsonObject)[key] ?? null;
				const targetValue = result[key] ?? null;
				result[key] = mergeJson(targetValue, sourceValue) as JsonValue;
			});
			return result;
		}
		// For primitive values or type mismatches, source takes precedence
		default:
			return source;
	}
}

/**
 * Checks if package.json exists in the current directory.
 * @returns boolean - true if package.json exists, false otherwise.
 */
export function hasPackageJson(): boolean {
	return fs.existsSync(path.join(process.cwd(), 'package.json'));
}

/**
 * Runs an npx command with the given arguments,
 * forwarding stdio and exiting this process with the child's exit code.
 *
 * @param command - The command to run
 * @param args - Array of additional arguments to pass to npx
 */
export function runNpxAndExit(command: string, args: string[] = []): void {
	const child = spawn('npx', [command, ...args], {
		stdio: 'inherit',
		shell: true,
	});

	child.on('exit', code => {
		process.exit(code ?? 0);
	});

	child.on('error', err => {
		console.error('Failed to run npx:', err);
		process.exit(1);
	});
}

/**
 * Checks whether a given string is a valid HTTP or HTTPS URL.
 *
 * @param url - The URL string to validate.
 * @returns {boolean} True if the string is a valid URL, false otherwise.
 */
export function isValidUrl(url: string): boolean {
	const pattern = /^(https?:\/\/)[^\s/$.?#].[^\s]*$/i;
	return pattern.test(url);
}

export function catchError<T>(fn: () => T, context: string): T {
	try {
		return fn();
	} catch (err: unknown) {
		if (err instanceof SyntaxError && typeof err.message === 'string') {
			if (err.message.includes('Unexpected') && /,\s*[\]}]/.test(err.message)) {
				console.error(`\n❌ ${context}\n\n  → ${err.message}\n`);
			} else if (err.message.includes('Unexpected')) {
				console.error(`\n❌ ${context}\n\n  → ${err.message}\n`);
			} else {
				console.error(`\n❌ ${context}\n\n  → ${err.message}\n`);
			}
		} else if (err && typeof err === 'object' && 'message' in err) {
			console.error(
				`\n❌ ${context}\n\n  → ${(err as {message?: string}).message || err}`,
			);
		} else {
			console.error(`\n❌ ${context}\n\n  → ${String(err)}`);
		}
		process.exit(1);
	}
}

export const save = (filename: string, content: string): void => {
	fs.writeFileSync(path.join(process.cwd(), filename), content, 'utf8');
};

export const fetch = (url: string) => {
	const makeRequest = async () => {
		const res = await globalThis.fetch(url);
		switch (res.ok) {
			case false:
				throw new Error(
					`Failed to fetch ${url}: ${res.status} ${res.statusText}`,
				);
		}
		return res;
	};

	return {
		getValidator: async (): Promise<jv.ValidateFunction> => {
			const res = await makeRequest();
			const schema = await res.json();

			const ajv = new jv.Ajv({allErrors: true, strict: false});
			const validate = ajv.compile(schema);
			return validate;
		},
		json: async <T = unknown>(): Promise<T> => {
			const res = await makeRequest();
			return await res.json();
		},
		file: async (localPath: string): Promise<string | void> => {
			// Node.js implementation
			const fs = await import('fs/promises');
			const path = await import('path');

			const fileExists = async (path: string): Promise<boolean> => {
				try {
					await fs.access(path);
					return true;
				} catch {
					return false;
				}
			};

			// Check if file already exists
			switch (await fileExists(localPath)) {
				case true:
					return `File already exists: ${localPath}`;
			}

			// File doesn't exist — proceed to fetch
			const res = await makeRequest();
			const buffer = await res.arrayBuffer();

			// Ensure directory exists
			const dir = path.dirname(localPath);
			await fs.mkdir(dir, {recursive: true});

			// Write file
			await fs.writeFile(localPath, new Uint8Array(buffer));
			return `Log file saved: ${localPath}`;
		},
	};
};

/**
 * Reads and parses a JSON file from the given path
 * @param filePath - Path to the JSON file
 * @returns Parsed JSON object or null if file doesn't exist
 */
export function readJsonFile(filePath: string): unknown {
	try {
		const content = fs.readFileSync(filePath, 'utf8');
		return JSON.parse(content);
	} catch {
		return null;
	}
}

/**
 * Checks if a file exists at the given path
 * @param filePath - Path to check
 * @returns boolean indicating if file exists
 */
export function fileExists(filePath: string): boolean {
	return fs.existsSync(filePath);
}

/**
 * Gets the full path for a file in the current working directory
 * @param filename - Name of the file
 * @returns Full path to the file
 */
export function getFilePath(filename: string): string {
	return path.join(process.cwd(), filename);
}

/**
 * Checks if tsconfig paths match the expected configuration
 * @param existingConfig - Existing tsconfig object
 * @param expectedConfig - Expected tsconfig object
 * @returns boolean indicating if paths match
 */
export function tsconfigPathsMatch(
	existingConfig: unknown,
	expectedConfig: unknown,
): boolean {
	const existingPaths = (existingConfig as TsConfigJson)?.compilerOptions
		?.paths?.['@/*'];
	const expectedPaths = (expectedConfig as TsConfigJson)?.compilerOptions
		?.paths?.['@/*'];

	switch (true) {
		case Array.isArray(existingPaths) &&
			Array.isArray(expectedPaths) &&
			existingPaths.length === expectedPaths.length &&
			existingPaths.every((v: string, i: number) => v === expectedPaths[i]):
			return true;
		default:
			return false;
	}
}

export interface TsConfigJson {
	compilerOptions: {
		paths: {
			[key: string]: string[];
		};
		[key: string]: string[] | string | number | boolean | object | undefined;
	};
	[key: string]: string[] | string | number | boolean | object | undefined;
}

export default {
	save,
	fetch,
	hasPackageJson,
	mergeJson,
	readJsonFile,
	fileExists,
	getFilePath,
	tsconfigPathsMatch,
	question,
	rl,
	isValidUrl,
	runNpxAndExit,
	catchError,
};
