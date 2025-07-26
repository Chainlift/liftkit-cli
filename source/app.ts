import {config} from './config.js';
import {
  fetch,
  isValidUrl,
  hasPackageJson,
  mergeJson,
  save,
  question,
  rl,
  readJsonFile,
  fileExists,
  getFilePath,
  tsconfigPathsMatch,
} from './lib/base.js';
import type {JsonValue} from './lib/base.js';
import {RegistryProcessor} from './lib/registry-processor.js';
import {processRegistryWithDependencies} from './lib/registry-process.js';
import {type RegistryItem} from './lib/registry-types.js';
import chalk from 'chalk';

// Add this interface for package.json shape
interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

// Intentional TypeScript error for lint validation
// type IntentionalError = number;
// const shouldBeNumber: IntentionalError = "this is a string, not a number";

export async function initCommand() {
  try {
    // First handle tsconfig.json merging
    const tsconfigPath = getFilePath('tsconfig.json');
    let existingTsConfig = null;
    // Flattened: single switch for tsconfig existence and config match
    switch (true) {
      case fileExists(tsconfigPath) &&
        tsconfigPathsMatch(readJsonFile(tsconfigPath), config.tsconfigjson):
        existingTsConfig = readJsonFile(tsconfigPath);
        console.log('\x1b[33m%s\x1b[0m', 'Found existing tsconfig.json');
        console.log(
          '\x1b[32m%s\x1b[0m',
          '✓ tsconfig.json is already correct. No changes needed.',
        );
        break;
      case fileExists(tsconfigPath): {
        existingTsConfig = readJsonFile(tsconfigPath);
        console.log('\x1b[33m%s\x1b[0m', 'Found existing tsconfig.json');
        const mergedConfig = mergeJson(
          existingTsConfig as JsonValue,
          config.tsconfigjson as JsonValue,
        );
        console.log('\x1b[36m%s\x1b[0m', 'Proposed tsconfig.json changes:');
        printGitDiff(
          JSON.stringify(existingTsConfig, null, 2),
          JSON.stringify(mergedConfig, null, 2),
        );
        const answer = await question(
          '\nDo you want to apply these changes? (y/N): ',
        );
        switch (answer.toLowerCase() === 'y') {
          case true: {
            save('tsconfig.json', JSON.stringify(mergedConfig, null, 2));
            console.log('\x1b[32m%s\x1b[0m', '\u2713 Updated tsconfig.json');
            break;
          }
          default: {
            console.log('\x1b[33m%s\x1b[0m', 'Skipped tsconfig.json update');
            break;
          }
        }
        break;
      }
      default: {
        // If no tsconfig.json exists, create one with our config
        const answer2 = await question(
          'No tsconfig.json found. Create one with recommended settings? (y/N): ',
        );
        switch (answer2.toLowerCase() === 'y') {
          case true: {
            save('tsconfig.json', JSON.stringify(config.tsconfigjson, null, 2));
            console.log('\x1b[32m%s\x1b[0m', '\u2713 Created tsconfig.json');
            break;
          }
          default: {
            console.log('\x1b[33m%s\x1b[0m', 'Skipped tsconfig.json creation');
            break;
          }
        }
        break;
      }
    }
    // Add or update npm run add script in package.json
    const pkgPath = getFilePath('package.json');
    // Flattened: single switch for package.json existence and add script
    switch (true) {
      case fileExists(pkgPath): {
        const pkg = readJsonFile(pkgPath) as PackageJson;
        if (
          pkg &&
          (!pkg.scripts ||
            !pkg.scripts['add'] ||
            pkg.scripts['add'] !== 'liftkit add')
        ) {
          const answer3 = await question(
            'Add an "add" script to package.json ("liftkit add")? (y/N): ',
          );
          switch (answer3.toLowerCase() === 'y') {
            case true:
              pkg.scripts = pkg.scripts || {};
              pkg.scripts['add'] = 'liftkit add';
              save('package.json', JSON.stringify(pkg, null, 2));
              console.log(
                '\x1b[32m%s\x1b[0m',
                '✓ Added "add" script to package.json',
              );
              break;
            default:
              console.log('\x1b[33m%s\x1b[0m', 'Skipped adding "add" script');
              break;
          }
        } else if (pkg) {
          console.log(
            '\x1b[32m%s\x1b[0m',
            '✓ "add" script already exists in package.json',
          );
        }
        // Ensure shadcn@2.7.0 is installed as a devDependency
        const hasShadcn =
          pkg &&
          pkg.devDependencies &&
          pkg.devDependencies['shadcn'] === '2.7.0';
        switch (!hasShadcn) {
          case true:
            console.log(
              '\x1b[32m%s\x1b[0m',
              '✓ No shadcn dependency needed - using our own registry system',
            );
            break;
          default:
            console.log(
              '\x1b[33m%s\x1b[0m',
              'Note: shadcn dependency found but not required for liftkit',
            );
            break;
        }
        break;
      }
    }
    // Then proceed with other file downloads
    const downloadOutputs = await Promise.all([
      fetch(`${config.templaterepo}/components.json`).file('./components.json'),
    ]);
    console.log(
      '\x1b[32m%s\x1b[0m',
      'Upon downloading files... \n' + downloadOutputs.join('\n'),
    );
  } catch {
    console.error('\x1b[31m%s\x1b[0m', 'Error initializing files');
  } finally {
    rl.close();
  }
}

export async function addCommand(component: string) {
  switch (hasPackageJson() === false) {
    case true:
      rl.close();
      console.error('\x1b[31m%s\x1b[0m', 'No packageJson found');
      process.exit(1);
  }

  try {
    console.log(chalk.blue(`Adding component: ${component}`));

    // Initialize registry processor
    const registryProcessor = new RegistryProcessor({
      baseDir: process.cwd(),
      preserveSubdirectories: true,
      replaceRegistryPaths: true,
      installDependencies: true,
    });

    await registryProcessor.initialize();

    let registryItem: RegistryItem; // Changed from RegistryItem to any as RegistryItem is no longer imported

    if (isValidUrl(component)) {
      // Direct URL - fetch the JSON directly
      const response = await fetch(component);
      registryItem = await response.json();
    } else if (fileExists(component)) {
      // Local file path - read the JSON file
      registryItem = readJsonFile(component) as RegistryItem;
      if (!registryItem) {
        throw new Error(`Failed to parse JSON from file: ${component}`);
      }
    } else {
      // Component name - fetch from our registry
      const registryUrl = `https://liftkit.pages.dev/r/${component}.json`;
      const response = await fetch(registryUrl);
      // Note: fetch function doesn't have .ok property, we'll handle errors differently
      try {
        registryItem = await response.json();
      } catch {
        throw new Error(`Component '${component}' not found in registry`);
      }
    }

    // Validate the registry item
    const processor = await processRegistryWithDependencies();
    const validation = processor.validate(registryItem);
    if (!validation.isValid) {
      console.error('❌ Invalid registry item:');
      validation.errors.forEach((error: string) =>
        console.error(`  - ${error}`),
      );
      if (validation.warnings.length > 0) {
        console.warn('⚠️ Warnings:');
        validation.warnings.forEach((warning: string) =>
          console.warn(`  - ${warning}`),
        );
      }
      process.exit(1);
    }

    // Process dependencies if any
    if (
      registryItem.registryDependencies &&
      registryItem.registryDependencies.length > 0
    ) {
      console.log(
        chalk.yellow(
          `Processing ${registryItem.registryDependencies.length} dependencies...`,
        ),
      );
      await processDependencies(
        registryItem.registryDependencies,
        fetch,
        processor as {
          validate: (item: unknown) => {
            isValid: boolean;
            errors: string[];
            warnings: string[];
          };
        },
        registryProcessor as unknown as {
          processRegistryItem: (item: unknown) => Promise<void>;
        },
        (msg: string, err?: unknown) => console.error(chalk.red(msg), err),
      );
    }

    // Install the main component
    const result = await registryProcessor.processRegistryItem(registryItem);

    // Process additional configurations
    if (registryItem.cssVars) {
      await registryProcessor.processCSSVars(registryItem.cssVars);
    }

    console.log(
      chalk.green(`✓ Successfully added component: ${registryItem.name}`),
    );
    console.log(chalk.gray(`Files processed: ${result.processedFiles.length}`));
    if (
      result.npmDependencies.length > 0 ||
      result.devDependencies.length > 0
    ) {
      const allDeps = [...result.npmDependencies, ...result.devDependencies];
      console.log(chalk.gray(`Dependencies installed: ${allDeps.join(', ')}`));
    }
  } catch (error) {
    console.error(chalk.red('Error adding component:'));
    console.error(chalk.red('Error details:'), error);
    if (error instanceof Error) {
      console.error(chalk.red('Stack trace:'), error.stack);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

export async function processDependencies(
  dependencies: string[],
  fetchFn: typeof fetch,
  processor: {
    validate: (item: unknown) => {
      isValid: boolean;
      errors: string[];
      warnings: string[];
    };
  },
  registryProcessor: {processRegistryItem: (item: unknown) => Promise<void>},
  logError: (msg: string, err?: unknown) => void = console.error,
) {
  for (const depUrl of dependencies) {
    try {
      const depResponse = await fetchFn(depUrl);
      const depItem = await depResponse.json();
      // Validate the dependency
      const depValidation = processor.validate(depItem);
      if (!depValidation.isValid) {
        logError(`Invalid dependency ${depUrl}:`);
        if (depValidation.errors) {
          depValidation.errors.forEach((error: string) =>
            logError(`  - ${error}`),
          );
        }
        continue; // Skip invalid dependencies
      }
      await registryProcessor.processRegistryItem(depItem);
    } catch (error) {
      logError(`Failed to fetch dependency ${depUrl}:`, error);
    }
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
      let contextIdx: number | null;
      if (j > 0) {
        contextIdx = j;
      } else {
        contextIdx = null;
      }
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
