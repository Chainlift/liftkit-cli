import lib from './lib.js';
import {config} from './config.js';

export const runCli = async () => {
	const posArgs = lib.cli.input;
	
	if (posArgs[0] === 'init') {
		try {
			// Fetch and save both files, get the output strings
			const downloadOutputs = await Promise.all([
				lib
					.fetch(`${config.templaterepo}/components.json`)
					.file('./components.json'),
				lib
					.fetch(`${config.templaterepo}/tailwind.config.ts`)
					.file('./tailwind.config.ts'),
			]);

			// Log the combined output
			console.log('\x1b[32m%s\x1b[0m', 'Upon downloading files... \n' + downloadOutputs.join('\n'));
		} catch (error) {
			console.error('\x1b[31m%s\x1b[0m', 'Error initializing files');
		}
	}

	if (posArgs.length === 2 && posArgs[0] === 'add' && typeof posArgs[1] === 'string') {
		if (lib.isValidUrl(posArgs[1])) {
			lib.runNpxAndExit(['shadcn', 'add', posArgs[1]]);
		}
	}

	if (lib.hasPackageJson() === false) {
		console.error('\x1b[31m%s\x1b[0m', 'No packageJson found');
	}
};
