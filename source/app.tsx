import { config } from './config.js';
import { 
	fetch, 
	isValidUrl, 
	runNpxAndExit, 
	hasPackageJson, 
	mergeJson, 
	save, 
	question, 
	rl,
	readJsonFile,
	fileExists,
	getFilePath,
	tsconfigPathsMatch
} from './lib.js';

export async function initCommand() {
	try {
		// First handle tsconfig.json merging
		const tsconfigPath = getFilePath('tsconfig.json');
		let existingTsConfig = null;
		
		if (fileExists(tsconfigPath)) {
			existingTsConfig = readJsonFile(tsconfigPath);
			console.log('\x1b[33m%s\x1b[0m', 'Found existing tsconfig.json');

			if (tsconfigPathsMatch(existingTsConfig, config.tsconfigjson)) {
				console.log('\x1b[32m%s\x1b[0m', '✓ tsconfig.json is already correct. No changes needed.');
			} else {
				const mergedConfig = mergeJson(existingTsConfig, config.tsconfigjson);
				console.log('\x1b[36m%s\x1b[0m', 'Proposed tsconfig.json changes:');
				console.log(JSON.stringify(mergedConfig, null, 2));

				const answer = await question('\nDo you want to apply these changes? (y/N): ');
				if (answer.toLowerCase() === 'y') {
					save('tsconfig.json', JSON.stringify(mergedConfig, null, 2));
					console.log('\x1b[32m%s\x1b[0m', '✓ Updated tsconfig.json');
				} else {
					console.log('\x1b[33m%s\x1b[0m', 'Skipped tsconfig.json update');
				}
			}
		} else {
			// If no tsconfig.json exists, create one with our config
			const answer = await question('No tsconfig.json found. Create one with recommended settings? (y/N): ');
			if (answer.toLowerCase() === 'y') {
				save('tsconfig.json', JSON.stringify(config.tsconfigjson, null, 2));
				console.log('\x1b[32m%s\x1b[0m', '✓ Created tsconfig.json');
			} else {
				console.log('\x1b[33m%s\x1b[0m', 'Skipped tsconfig.json creation');
			}
		}

		// Then proceed with other file downloads
		const downloadOutputs = await Promise.all([
			fetch(`${config.templaterepo}/components.json`).file('./components.json'),
			fetch(`${config.templaterepo}/tailwind.config.ts`).file('./tailwind.config.ts'),
		]);
		console.log('\x1b[32m%s\x1b[0m', 'Upon downloading files... \n' + downloadOutputs.join('\n'));
	} catch (error) {
		console.error('\x1b[31m%s\x1b[0m', 'Error initializing files');
	} finally {
		rl.close();
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
