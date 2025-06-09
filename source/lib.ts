import fs from 'fs';
import path from 'path';
import jv from 'ajv';
import {spawn} from 'child_process';

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = {[key: string]: JsonValue};
type JsonArray = JsonValue[];

/**
 * Merges two JSON objects deeply, with the second object taking precedence
 * @param target - The base object to merge into
 * @param source - The object to merge from (takes precedence)
 * @returns A new merged object
 */
function mergeJson(target: JsonValue, source: JsonValue): JsonValue {
	// If source is null/undefined, return target
	if (source === null || source === undefined) {
		return target;
	}

	// If target is null/undefined, return source
	if (target === null || target === undefined) {
		return source;
	}

	// If both are arrays, concatenate them
	if (Array.isArray(target) && Array.isArray(source)) {
		return [...target, ...source];
	}

	// If both are objects, merge recursively
	if (
		typeof target === 'object' &&
		typeof source === 'object' &&
		!Array.isArray(target) &&
		!Array.isArray(source) &&
		target !== null &&
		source !== null
	) {
		const result: JsonObject = {...(target as JsonObject)};

		for (const key in source as JsonObject) {
			const sourceValue = (source as JsonObject)[key] ?? null;
			const targetValue = result[key] ?? null;

			result[key] = mergeJson(targetValue, sourceValue) as JsonValue;
		}

		return result;
	}

	// For primitive values or type mismatches, source takes precedence
	return source;
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
 * @param args - Array of arguments to pass to npx (e.g., ['create-react-app', 'my-app'])
 */
export async function runNpxAndExit(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn('npx', args, {
			stdio: 'inherit',
			shell: true,
		});

		child.on('error', error => {
			reject(error);
		});

		child.on('exit', (code, signal) => {
			if (signal) {
				// If killed by signal, exit with 1 (or customize as needed)
				process.exitCode = 1;
			} else {
				process.exitCode = code ?? 0;
			}
			resolve();
		});
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
	} catch (err: any) {
		if (err instanceof SyntaxError && err.message.includes('Unexpected')) {
			let tip = '';
			if (/,\s*[\]}]/.test(err.message)) {
				tip = ' (possibly due to a trailing comma)';
			}
			console.error(`\n❌ ${context}${tip}\n\n  → ${err.message}\n`);
		} else {
			console.error(`\n❌ ${context}\n\n  → ${err.message || err}\n`);
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
		if (!res.ok) {
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
		json: async <T = any>(): Promise<T> => {
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
			if (await fileExists(localPath)) {
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

export default {
	save,
	fetch,
	hasPackageJson,
	mergeJson,
};
