import {config} from './config.js';
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
	tsconfigPathsMatch,
} from './lib.js';
import chalk from 'chalk';

export async function initCommand() {
	try {
		// First handle tsconfig.json merging
		const tsconfigPath = getFilePath('tsconfig.json');
		let existingTsConfig = null;

		if (fileExists(tsconfigPath)) {
			existingTsConfig = readJsonFile(tsconfigPath);
			console.log('\x1b[33m%s\x1b[0m', 'Found existing tsconfig.json');

			if (tsconfigPathsMatch(existingTsConfig, config.tsconfigjson)) {
				console.log(
					'\x1b[32m%s\x1b[0m',
					'✓ tsconfig.json is already correct. No changes needed.',
				);
			} else {
				const mergedConfig = mergeJson(existingTsConfig, config.tsconfigjson);
				console.log('\x1b[36m%s\x1b[0m', 'Proposed tsconfig.json changes:');
				printGitDiff(
					JSON.stringify(existingTsConfig, null, 2),
					JSON.stringify(mergedConfig, null, 2),
				);

				const answer = await question(
					'\nDo you want to apply these changes? (y/N): ',
				);
				if (answer.toLowerCase() === 'y') {
					save('tsconfig.json', JSON.stringify(mergedConfig, null, 2));
					console.log('\x1b[32m%s\x1b[0m', '✓ Updated tsconfig.json');
				} else {
					console.log('\x1b[33m%s\x1b[0m', 'Skipped tsconfig.json update');
				}
			}
		} else {
			// If no tsconfig.json exists, create one with our config
			const answer = await question(
				'No tsconfig.json found. Create one with recommended settings? (y/N): ',
			);
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
			fetch(`${config.templaterepo}/tailwind.config.ts`).file(
				'./tailwind.config.ts',
			),
		]);
		console.log(
			'\x1b[32m%s\x1b[0m',
			'Upon downloading files... \n' + downloadOutputs.join('\n'),
		);
	} catch (error) {
		console.error('\x1b[31m%s\x1b[0m', 'Error initializing files');
	} finally {
		rl.close();
	}
}

export async function addCommand(component: string) {
	if (hasPackageJson() === false) {
		rl.close();
		console.error('\x1b[31m%s\x1b[0m', 'No packageJson found');
		process.exit(1);
	}

	rl.close();
	if (isValidUrl(component)) {
		runNpxAndExit('shadcn@2.7.0', ['add', component]);
	} else {
		runNpxAndExit('shadcn@2.7.0', [
			'add',
			`https://liftkit.pages.dev/r/${component}.json`,
		]);
	}
}

function printGitDiff(oldStr: string, newStr: string) {
	const oldLines = oldStr.split('\n');
	const newLines = newStr.split('\n');
	let i = 0,
		j = 0;
	while (i < oldLines.length || j < newLines.length) {
		if (
			i < oldLines.length &&
			j < newLines.length &&
			oldLines[i] === newLines[j]
		) {
			// Context line
			console.log(`${j + 1}  ${oldLines[i]}`);
			i++;
			j++;
		} else if (
			j < newLines.length &&
			(i >= oldLines.length || oldLines[i] !== newLines[j])
		) {
			// Start of a chunk of additions
			const contextIdx = j > 0 ? j : null;
			if (contextIdx !== null && contextIdx > 0) {
				console.log(`${contextIdx}  ${newLines[contextIdx - 1]}`);
			}
			// Print all consecutive additions
			while (
				j < newLines.length &&
				(i >= oldLines.length || oldLines[i] !== newLines[j])
			) {
				console.log(chalk.green(`+ ${j + 1}  ${newLines[j]}`));
				j++;
			}
		} else {
			i++;
		}
	}
}
