import { config } from './config.js';
import { fetch, isValidUrl, runNpxAndExit, hasPackageJson } from './lib.js';

export async function initCommand() {
	try {
		const downloadOutputs = await Promise.all([
			fetch(`${config.templaterepo}/components.json`).file('./components.json'),
			fetch(`${config.templaterepo}/tailwind.config.ts`).file('./tailwind.config.ts'),
		]);
		console.log('\x1b[32m%s\x1b[0m', 'Upon downloading files... \n' + downloadOutputs.join('\n'));
	} catch (error) {
		console.error('\x1b[31m%s\x1b[0m', 'Error initializing files');
	}
}

export async function addCommand(component: string) {
	if (isValidUrl(component)) {
		await runNpxAndExit(['shadcn', 'add', component]);
	}
	if (hasPackageJson() === false) {
		console.error('\x1b[31m%s\x1b[0m', 'No packageJson found');
	}
}
