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
  writeComponentsJson,
} from './lib/base.js';
import type {JsonValue} from './lib/base.js';
import {RegistryProcessor} from './lib/registry-processor.js';
import {processRegistryWithDependencies} from './lib/registry-process.js';
import {type RegistryItem} from './lib/registry-types.js';
import chalk from 'chalk';

// Interface for package.json shape
interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface InitOptions {
  yes?: boolean;
}

interface AddOptions {
  force?: boolean;
  skipConflicts?: boolean;
}

const COLORS = {
  YELLOW: '\x1b[33m%s\x1b[0m',
  GREEN: '\x1b[32m%s\x1b[0m',
  CYAN: '\x1b[36m%s\x1b[0m',
  RED: '\x1b[31m%s\x1b[0m',
} as const;

const MESSAGES = {
  FOUND_TSCONFIG: 'Found existing tsconfig.json',
  TSCONFIG_CORRECT: '✓ tsconfig.json is already correct. No changes needed.',
  UPDATED_TSCONFIG: '\u2713 Updated tsconfig.json',
  CREATED_TSCONFIG: '\u2713 Created tsconfig.json',
  SKIPPED_TSCONFIG_UPDATE: 'Skipped tsconfig.json update',
  SKIPPED_TSCONFIG_CREATION: 'Skipped tsconfig.json creation',
  ADDED_SCRIPT: '✓ Added "add" script to package.json',
  SCRIPT_EXISTS: '✓ "add" script already exists in package.json',
  SKIPPED_SCRIPT: 'Skipped adding "add" script',
  PROPOSED_CHANGES: 'Proposed tsconfig.json changes:',
  ERROR_INIT: 'Error initializing files',
  NO_PACKAGE_JSON: 'No packageJson found',
  COMPONENTS_JSON_CREATED: '✓ Created components.json',
  SKIPPED_COMPONENTS_JSON: 'Skipped components.json creation',
} as const;

export async function initCommand(options: InitOptions = {}): Promise<void> {
  try {
    await handleTsconfigInit(options);
    await handlePackageJsonInit(options);
  } catch (error) {
    console.error(COLORS.RED, MESSAGES.ERROR_INIT);
    console.error(error);
  } finally {
    rl.close();
  }
}

async function handleTsconfigInit(options: InitOptions): Promise<void> {
  const tsconfigPath = getFilePath('tsconfig.json');
  const tsconfigExists = fileExists(tsconfigPath);

  if (tsconfigExists) {
    const existingTsConfig = readJsonFile(tsconfigPath);
    console.log(COLORS.YELLOW, MESSAGES.FOUND_TSCONFIG);

    if (tsconfigPathsMatch(existingTsConfig, config.tsconfigjson)) {
      console.log(COLORS.GREEN, MESSAGES.TSCONFIG_CORRECT);
      return;
    }

    await handleTsconfigUpdate(existingTsConfig as JsonValue, options);
  } else {
    await handleTsconfigCreation(options);
  }
}

async function handleTsconfigUpdate(
  existingTsConfig: JsonValue,
  options: InitOptions,
): Promise<void> {
  const mergedConfig = mergeJson(
    existingTsConfig,
    config.tsconfigjson as JsonValue,
  );

  console.log(COLORS.CYAN, MESSAGES.PROPOSED_CHANGES);
  printGitDiff(
    JSON.stringify(existingTsConfig, null, 2),
    JSON.stringify(mergedConfig, null, 2),
  );

  const answer = await getUserConfirmation(
    options.yes,
    '\nDo you want to apply these changes? (Y/n): ',
  );

  if (answer.toLowerCase() !== 'n') {
    save('tsconfig.json', JSON.stringify(mergedConfig, null, 2));
    console.log(COLORS.GREEN, MESSAGES.UPDATED_TSCONFIG);
  } else {
    console.log(COLORS.YELLOW, MESSAGES.SKIPPED_TSCONFIG_UPDATE);
  }
}

async function handleTsconfigCreation(options: InitOptions): Promise<void> {
  const answer = await getUserConfirmation(
    options.yes,
    'No tsconfig.json found. Create one with recommended settings? (Y/n): ',
  );

  if (answer.toLowerCase() !== 'n') {
    save('tsconfig.json', JSON.stringify(config.tsconfigjson, null, 2));
    console.log(COLORS.GREEN, MESSAGES.CREATED_TSCONFIG);
  } else {
    console.log(COLORS.YELLOW, MESSAGES.SKIPPED_TSCONFIG_CREATION);
  }
}

async function handlePackageJsonInit(options: InitOptions): Promise<void> {
  const pkgPath = getFilePath('package.json');

  if (!fileExists(pkgPath)) {
    return;
  }

  const pkg = readJsonFile(pkgPath) as PackageJson;

  if (!pkg) {
    return;
  }

  const needsAddScript =
    !pkg.scripts?.['add'] || pkg.scripts['add'] !== 'liftkit add';

  if (needsAddScript) {
    const answer = await getUserConfirmation(
      options.yes,
      'Add an "add" script to package.json ("liftkit add")? (Y/n): ',
    );

    if (answer.toLowerCase() !== 'n') {
      pkg.scripts = pkg.scripts ?? {};
      pkg.scripts['add'] = 'liftkit add';
      save('package.json', JSON.stringify(pkg, null, 2));
      console.log(COLORS.GREEN, MESSAGES.ADDED_SCRIPT);
    } else {
      console.log(COLORS.YELLOW, MESSAGES.SKIPPED_SCRIPT);
    }
  } else {
    console.log(COLORS.GREEN, MESSAGES.SCRIPT_EXISTS);
  }

  await handleComponentsJsonCreation(options);
}

async function getUserConfirmation(
  autoYes: boolean | undefined,
  prompt: string,
): Promise<string> {
  if (autoYes === true) {
    return 'y';
  }
  return await question(prompt);
}

async function handleComponentsJsonCreation(
  options: InitOptions,
): Promise<void> {
  const answer = await getUserConfirmation(
    options.yes,
    'Create components.json configuration file? (Y/n): ',
  );

  if (answer.toLowerCase() !== 'n') {
    writeComponentsJson();
    console.log(COLORS.GREEN, MESSAGES.COMPONENTS_JSON_CREATED);
  } else {
    console.log(COLORS.YELLOW, MESSAGES.SKIPPED_COMPONENTS_JSON);
  }
}

export async function addCommand(
  component: string,
  options: AddOptions = {},
): Promise<void> {
  if (!hasPackageJson()) {
    rl.close();
    console.error(COLORS.RED, MESSAGES.NO_PACKAGE_JSON);
    process.exit(1);
  }

  try {
    console.log(chalk.blue(`Adding component: ${component}`));

    const registryProcessor = new RegistryProcessor({
      baseDir: process.cwd(),
      preserveSubdirectories: true,
      replaceRegistryPaths: true,
      installDependencies: true,
      skipConflicts: Boolean(options.force || options.skipConflicts),
    });

    await registryProcessor.initialize();

    const registryItem = await fetchRegistryItem(component);

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

    await processRegistryDependencies(registryItem, registryProcessor);

    const result = await registryProcessor.processRegistryItem(registryItem);

    if (registryItem.cssVars) {
      await registryProcessor.processCSSVars(registryItem.cssVars);
    }

    logSuccessMessages(registryItem, result);
  } catch (error) {
    handleAddCommandError(error);
  } finally {
    rl.close();
  }
}

async function fetchRegistryItem(component: string): Promise<RegistryItem> {
  if (isValidUrl(component)) {
    const response = await fetch(component);
    return (await response.json()) as RegistryItem;
  }

  if (fileExists(component)) {
    const item = readJsonFile(component) as RegistryItem;
    if (!item) {
      throw new Error(`Failed to parse JSON from file: ${component}`);
    }
    return item;
  }

  const registryUrl = `https://liftkit.pages.dev/r/${component}.json`;
  const response = await fetch(registryUrl);

  try {
    return (await response.json()) as RegistryItem;
  } catch {
    throw new Error(`Component '${component}' not found in registry`);
  }
}

async function processRegistryDependencies(
  registryItem: RegistryItem,
  registryProcessor: RegistryProcessor,
): Promise<void> {
  if (!registryItem.registryDependencies?.length) {
    return;
  }

  console.log(
    chalk.yellow(
      `Processing ${registryItem.registryDependencies.length} dependencies...`,
    ),
  );

  const processor = await processRegistryWithDependencies();

  await processDependencies(
    registryItem.registryDependencies,
    fetch,
    processor,
    registryProcessor,
    (msg: string, err?: unknown) => console.error(chalk.red(msg), err),
  );
}

function logSuccessMessages(
  registryItem: RegistryItem,
  result: Awaited<ReturnType<RegistryProcessor['processRegistryItem']>>,
): void {
  console.log(
    chalk.green(`✓ Successfully added component: ${registryItem.name}`),
  );
  console.log(chalk.gray(`Files processed: ${result.processedFiles.length}`));

  const allDeps = [...result.npmDependencies, ...result.devDependencies];
  if (allDeps.length > 0) {
    console.log(chalk.gray(`Dependencies installed: ${allDeps.join(', ')}`));
  }
}

function handleAddCommandError(error: unknown): never {
  if (
    error instanceof Error &&
    error.message === 'User cancelled file overwrite'
  ) {
    console.log(chalk.yellow('Operation cancelled by user'));
    process.exit(0);
  }

  console.error(chalk.red('Error adding component:'));
  console.error(chalk.red('Error details:'), error);

  if (error instanceof Error && error.stack) {
    console.error(chalk.red('Stack trace:'), error.stack);
  }

  process.exit(1);
}

export async function processDependencies(
  dependencies: string[],
  fetchFn: typeof fetch,
  processor: {validate: (item: RegistryItem) => ValidationResult},
  registryProcessor: {
    processRegistryItem: (item: RegistryItem) => Promise<unknown>;
  },
  logError: (msg: string, err?: unknown) => void = console.error,
): Promise<void> {
  for (const depUrl of dependencies) {
    try {
      const depResponse = await fetchFn(depUrl);
      const depItem = (await depResponse.json()) as RegistryItem;

      const depValidation = processor.validate(depItem);

      if (!depValidation.isValid) {
        logError(`Invalid dependency ${depUrl}:`);
        depValidation.errors.forEach((error: string) =>
          logError(`  - ${error}`),
        );
        continue;
      }

      await registryProcessor.processRegistryItem(depItem);
    } catch (error) {
      logError(`Failed to fetch dependency ${depUrl}:`, error);
    }
  }
}

function printGitDiff(oldStr: string, newStr: string): void {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  let i = 0;
  let j = 0;

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
      // Handle additions
      handleAdditionsInDiff(newLines, oldLines, i, j);

      // Skip processed additions
      while (
        j < newLines.length &&
        (i >= oldLines.length || oldLines[i] !== newLines[j])
      ) {
        j++;
      }
    } else {
      i++;
    }
  }
}

function handleAdditionsInDiff(
  newLines: string[],
  oldLines: string[],
  i: number,
  j: number,
): void {
  // Show context if available
  if (j > 0) {
    console.log(`${j}  ${newLines[j - 1]}`);
  }

  // Print all consecutive additions
  let currentJ = j;
  while (
    currentJ < newLines.length &&
    (i >= oldLines.length || oldLines[i] !== newLines[currentJ])
  ) {
    console.log(chalk.green(`+ ${currentJ + 1}  ${newLines[currentJ]}`));
    currentJ++;
  }
}
