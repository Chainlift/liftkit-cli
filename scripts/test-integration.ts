#!/usr/bin/env node

import {execSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TEST_COMPONENT = 'button';
const SHADCN_VERSION = '2.7.0';
const REGISTRY_URL = 'https://liftkit.pages.dev/r/button.json';

// Paths
const TEST_OUTPUT_DIR = path.join(__dirname, '..', 'test_output');
const SHADCN_DIR = path.join(TEST_OUTPUT_DIR, 'shadcn');
const LIFTKIT_DIR = path.join(TEST_OUTPUT_DIR, 'liftkit');

console.log('🧪 Starting Integration Tests...\n');

// Clean up previous test runs
function cleanup() {
  console.log('🧹 Cleaning up previous test runs...');
  switch (fs.existsSync(SHADCN_DIR)) {
    case true:
      fs.rmSync(SHADCN_DIR, {recursive: true, force: true});
      break;
  }
  switch (fs.existsSync(LIFTKIT_DIR)) {
    case true:
      fs.rmSync(LIFTKIT_DIR, {recursive: true, force: true});
      break;
  }

  // Clean up any existing component files from main directory
  const mainDir = path.join(__dirname, '..');
  const dirsToClean = ['components', 'lib', 'src'];
  dirsToClean.forEach(dir => {
    const dirPath = path.join(mainDir, dir);
    switch (fs.existsSync(dirPath)) {
      case true:
        fs.rmSync(dirPath, {recursive: true, force: true});
        break;
    }
  });

  fs.mkdirSync(SHADCN_DIR, {recursive: true});
  fs.mkdirSync(LIFTKIT_DIR, {recursive: true});
}

// Test shadcn CLI
function testShadcn() {
  console.log('📦 Testing shadcn CLI...');

  try {
    // Initialize a new Next.js app with TypeScript and src directory
    execSync(
      'npx -y create-next-app@latest . --typescript --no-tailwind --eslint --src-dir --app --use-npm --yes',
      {cwd: SHADCN_DIR, stdio: 'inherit'},
    );

    // Install shadcn CLI
    execSync(`npm install shadcn@${SHADCN_VERSION}`, {
      cwd: SHADCN_DIR,
      stdio: 'inherit',
    });

    // Copy components.json to skip configuration prompts
    const testComponentsJsonPath = path.join(SHADCN_DIR, 'components.json');

    // Create a minimal components.json for shadcn test
    const testConfig = {
      $schema: 'https://ui.shadcn.com/schema.json',
      style: 'new-york',
      rsc: true,
      tsx: true,
      tailwind: {
        config: 'tailwind.config.ts',
        css: 'src/app/globals.css',
        baseColor: 'neutral',
        cssVariables: true,
        prefix: '',
      },
      aliases: {
        components: '@/components',
        utils: '@/lib/utils',
        ui: '@/components/ui',
        lib: '@/lib',
        hooks: '@/hooks',
      },
      iconLibrary: 'lucide',
    };
    fs.writeFileSync(
      testComponentsJsonPath,
      JSON.stringify(testConfig, null, 2),
    );

    // Create tailwind.config.ts
    const tailwindConfig = `export default {
    content: ['./registry/**/*.{js,ts,jsx,tsx}'],
  };`;
    fs.writeFileSync(
      path.join(SHADCN_DIR, 'tailwind.config.ts'),
      tailwindConfig,
    );

    // Create tsconfig.json (overwrite Next.js default if needed)
    const tsConfig = {
      extends: '@sindresorhus/tsconfig',
      compilerOptions: {
        outDir: 'dist',
        paths: {
          '@/*': ['./src/*'],
        },
      },
      include: ['source'],
    };
    fs.writeFileSync(
      path.join(SHADCN_DIR, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2),
    );

    // Add the component
    console.log(`Running: npx shadcn@${SHADCN_VERSION} add ${REGISTRY_URL} -y`);
    execSync(`npx shadcn@${SHADCN_VERSION} add ${REGISTRY_URL} -y`, {
      cwd: SHADCN_DIR,
      stdio: 'inherit',
    });

    console.log('✅ shadcn test completed successfully\n');
    return true;
  } catch {
    console.error('❌ shadcn test failed');
    return false;
  }
}

// Test LiftKit CLI
function testLiftKit() {
  console.log('🚀 Testing LiftKit CLI...');

  try {
    // Initialize a new Next.js app with TypeScript and src directory
    execSync(
      'npx -y create-next-app@latest . --typescript --no-tailwind --eslint --src-dir --app --use-npm --yes',
      {cwd: LIFTKIT_DIR, stdio: 'inherit'},
    );

    // Copy our CLI to the test directory
    const cliPath = path.join(__dirname, '..', 'dist', 'cli.cjs');
    const testCliPath = path.join(LIFTKIT_DIR, 'cli.cjs');
    fs.copyFileSync(cliPath, testCliPath);

    // Copy components.json for configuration
    const componentsJsonPath = path.join(__dirname, '..', 'components.json');
    const testComponentsJsonPath = path.join(LIFTKIT_DIR, 'components.json');

    // Read the original components.json and update aliases to use @/ prefix
    const originalConfig = JSON.parse(
      fs.readFileSync(componentsJsonPath, 'utf8'),
    );
    const testConfig = {
      ...originalConfig,
      aliases: {
        components: '@/components',
        ui: '@/components/ui',
        lib: '@/lib',
        hooks: '@/hooks',
      },
    };
    fs.writeFileSync(
      testComponentsJsonPath,
      JSON.stringify(testConfig, null, 2),
    );

    // Create tsconfig.json for LiftKit test to match shadcn structure (overwrite Next.js default if needed)
    const tsConfig = {
      extends: '@sindresorhus/tsconfig',
      compilerOptions: {
        outDir: 'dist',
        paths: {
          '@/*': ['./src/*'],
        },
      },
      include: ['source'],
    };
    fs.writeFileSync(
      path.join(LIFTKIT_DIR, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2),
    );

    // Add the component
    console.log(`Running: ./cli.cjs add ${TEST_COMPONENT}`);
    execSync(`./cli.cjs add ${TEST_COMPONENT}`, {
      cwd: LIFTKIT_DIR,
      stdio: 'inherit',
    });

    console.log('✅ LiftKit test completed successfully\n');
    return true;
  } catch {
    console.error('❌ LiftKit test failed');
    return false;
  }
}

// Compare results
function compareResults() {
  console.log('🔍 Comparing results using diff...');

  // Only compare files in /src for both outputs
  const shadcnSrc = path.join(SHADCN_DIR, 'src');
  const liftkitSrc = path.join(LIFTKIT_DIR, 'src');

  // Flattened: single switch for directory existence
  switch (true) {
    case !fs.existsSync(shadcnSrc):
      console.log('❌ shadcn src directory does not exist');
      return false;
    case !fs.existsSync(liftkitSrc):
      console.log('❌ LiftKit src directory does not exist');
      return false;
  }

  const shadcnFiles = getAllFiles(shadcnSrc);
  const liftkitFiles = getAllFiles(liftkitSrc);

  // Create a map of relative paths to full paths
  const shadcnMap = new Map();
  const liftkitMap = new Map();

  shadcnFiles.forEach(file => {
    const relative = path.relative(shadcnSrc, file);
    shadcnMap.set(relative, file);
  });

  liftkitFiles.forEach(file => {
    const relative = path.relative(liftkitSrc, file);
    liftkitMap.set(relative, file);
  });

  // Find common files
  const commonFiles: string[] = [];
  const shadcnOnly: string[] = [];
  const liftkitOnly: string[] = [];

  // Flattened: single switch for map membership
  shadcnMap.forEach((_shadcnPath, relativePath) => {
    if (liftkitMap.has(relativePath)) {
      commonFiles.push(relativePath);
    } else {
      shadcnOnly.push(relativePath);
    }
  });

  liftkitMap.forEach((_liftkitPath, relativePath) => {
    if (!shadcnMap.has(relativePath)) {
      liftkitOnly.push(relativePath);
    }
  });

  // Compare content of common files
  let contentMatches = 0;
  let contentMismatches = 0;

  // Flattened: single switch for content matches
  commonFiles.forEach(relativePath => {
    const shadcnPath = shadcnMap.get(relativePath);
    const liftkitPath = liftkitMap.get(relativePath);

    // Skip binary files
    if (isBinaryFile(shadcnPath) || isBinaryFile(liftkitPath)) {
      console.log(`⏭️  Skipping binary file: ${relativePath}`);
      return; // Skip this file
    }

    const matches = compareFileContents(shadcnPath, liftkitPath);
    if (matches) {
      contentMatches++;
    } else {
      contentMismatches++;
      console.log(`❌ Content differs: ${relativePath}`);
    }
  });

  console.log(
    `📊 Comparison results: ${contentMatches} matches, ${contentMismatches} mismatches`,
  );

  // Overall assessment
  const locationMatch = shadcnOnly.length === 0 && liftkitOnly.length === 0;
  const contentMatch = contentMismatches === 0;
  let caseType = '';

  // Flattened: single switch for overall assessment
  switch (true) {
    case locationMatch && contentMatch:
      caseType = 'perfect';
      break;
    case locationMatch:
      caseType = 'locationOnly';
      break;
    default:
      caseType = 'mismatch';
      break;
  }

  switch (true) {
    case caseType === 'perfect':
      console.log(
        '🎉 Perfect match! All files are in the same locations with identical content.',
      );
      return true;
    case caseType === 'locationOnly':
      console.log(
        '⚠️  Files are in the same locations but some content differs.',
      );
      return false;
    default:
      console.log('❌ Files are not in the same locations.');
      return false;
  }
}

// Helper function to get all files recursively
function getAllFiles(dir: string): string[] {
  let items;
  try {
    items = fs.readdirSync(dir);
  } catch {
    // console.warn(`Warning: Could not read directory ${dir}`);
    return [];
  }
  return (items || []).flatMap(item => {
    const fullPath = path.join(dir, item);
    let stat;
    try {
      stat = fs.lstatSync(fullPath);
    } catch {
      // console.warn(`Warning: Could not stat ${fullPath}`);
      return [];
    }
    if (stat.isSymbolicLink()) {
      // console.warn(`Warning: Skipping symlink ${fullPath}`);
      return [];
    } else if (stat.isDirectory()) {
      return getAllFiles(fullPath);
    } else {
      return [fullPath];
    }
  });
}

// Helper function to compare file contents
function compareFileContents(shadcnPath: string, liftkitPath: string): boolean {
  try {
    const shadcnContent = fs.readFileSync(shadcnPath, 'utf-8');
    const liftkitContent = fs.readFileSync(liftkitPath, 'utf-8');

    // Remove timestamps and comments for comparison
    let cleanShadcn = shadcnContent
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    let cleanLiftkit = liftkitContent
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    // Normalize import paths that differ between shadcn and liftkit
    // shadcn uses @/registry/universal/lib/css/types/ while liftkit uses @/lib/css/types/
    cleanShadcn = cleanShadcn.replace(
      /@\/registry\/universal\/lib\/css\/types\//g,
      '@/lib/css/types/',
    );
    cleanLiftkit = cleanLiftkit.replace(
      /@\/registry\/universal\/lib\/css\/types\//g,
      '@/lib/css/types/',
    );

    return cleanShadcn === cleanLiftkit;
  } catch (error) {
    console.error(`Error comparing files: ${(error as Error).message}`);
    return false;
  }
}

function isBinaryFile(filePath: string): boolean {
  // Check file extension for common binary files
  const binaryExtensions = [
    '.ico',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.svg',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
  ];
  const ext = path.extname(filePath).toLowerCase();
  if (binaryExtensions.includes(ext)) {
    return true;
  }

  // Also check for null bytes in the first 100 bytes
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(100);
    const bytesRead = fs.readSync(fd, buffer, 0, 100, 0);
    fs.closeSync(fd);
    return Array.from({length: bytesRead}).some((_, i) => buffer[i] === 0);
  } catch {
    // If we can't read the file, treat as non-binary for now
    return false;
  }
}

// Main execution
function main() {
  cleanup();

  const shadcnSuccess = testShadcn();
  const liftkitSuccess = testLiftKit();

  if (shadcnSuccess && liftkitSuccess) {
    const comparisonSuccess = compareResults();
    if (comparisonSuccess) {
      console.log('🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('❌ Comparison failed');
      process.exit(1);
    }
  } else {
    console.log('❌ One or more tests failed');
    process.exit(1);
  }
}

main();
