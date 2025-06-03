import fs from 'fs';
import path from 'path';
import jv from 'ajv';
import meow from 'meow';

export const cli = meow(
	`
	Usage
	  $ lifty [command] [options]

	Commands
		init  Downloads essential files
	  add <component>  Download a component from the registry

	Options
	  --name  Your name

	Examples
	  $ lifty --name=Jane
	  Hello, Jane

	  $ lifty add button
	  Downloads the button component

	  $ lifty add modal
	  Downloads the modal component
`,
	{
		importMeta: import.meta,
		flags: {
			name: {
				type: 'string',
			},
		},
	},
);

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

/**
 * reads a local json config file and returns the parsed object.
 * @param filename - relative or absolute path to the json file
 */
export const getConfig = (filename: string): any => {
	return catchError(() => {
		const filePath = path.isAbsolute(filename)
			? filename
			: path.join(process.cwd(), filename);

		const fileContents = catchError(
			() => fs.readFileSync(filePath, 'utf8'),
			`Unable to read config file at path: ${filePath}`,
		);

		return catchError(
			() => JSON.parse(fileContents),
			`Invalid JSON in config file: ${filePath}`,
		);
	}, `Failed to load config file: ${filename}`);
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
		file: async (localPath: string): Promise<void> => {
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
				console.log(`File already exists: ${localPath}`);
				return;
			}

			// File doesn't exist — proceed to fetch
			const res = await makeRequest();
			const buffer = await res.arrayBuffer();

			// Ensure directory exists
			const dir = path.dirname(localPath);
			await fs.mkdir(dir, {recursive: true});

			// Write file
			await fs.writeFile(localPath, new Uint8Array(buffer));
			console.log(`Log file saved: ${localPath}`);
		},
	};
};

export default {
	save,
	fetch,
	getConfig,
	cli,
};
