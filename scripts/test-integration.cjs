#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
            fs.rmSync(SHADCN_DIR, { recursive: true, force: true });
            break;
    }
    switch (fs.existsSync(LIFTKIT_DIR)) {
        case true:
            fs.rmSync(LIFTKIT_DIR, { recursive: true, force: true });
            break;
    }
    
    // Clean up any existing component files from main directory
    const mainDir = path.join(__dirname, '..');
    const dirsToClean = ['components', 'lib', 'src'];
    dirsToClean.forEach(dir => {
        const dirPath = path.join(mainDir, dir);
        switch (fs.existsSync(dirPath)) {
            case true:
                fs.rmSync(dirPath, { recursive: true, force: true });
                break;
        }
    });
    
    fs.mkdirSync(SHADCN_DIR, { recursive: true });
    fs.mkdirSync(LIFTKIT_DIR, { recursive: true });
}

// Test shadcn CLI
function testShadcn() {
    console.log('📦 Testing shadcn CLI...');
    
    try {
        // Initialize a new Next.js app with TypeScript and src directory
        execSync('npx -y create-next-app@latest . --typescript --no-tailwind --eslint --src-dir --app --use-npm --yes', { cwd: SHADCN_DIR, stdio: 'inherit' });
        
        // Install shadcn CLI
        execSync(`npm install shadcn@${SHADCN_VERSION}`, { cwd: SHADCN_DIR, stdio: 'inherit' });
        
        // Copy components.json to skip configuration prompts
        const testComponentsJsonPath = path.join(SHADCN_DIR, 'components.json');
        
        // Create a minimal components.json for shadcn test
        const testConfig = {
            "$schema": "https://ui.shadcn.com/schema.json",
            "style": "new-york",
            "rsc": true,
            "tsx": true,
            "tailwind": {
                "config": "tailwind.config.ts",
                "css": "src/app/globals.css",
                "baseColor": "neutral",
                "cssVariables": true,
                "prefix": ""
            },
            "aliases": {
                "components": "@/components",
                "utils": "@/lib/utils",
                "ui": "@/components/ui",
                "lib": "@/lib",
                "hooks": "@/hooks"
            },
            "iconLibrary": "lucide"
        };
        fs.writeFileSync(testComponentsJsonPath, JSON.stringify(testConfig, null, 2));
        
        // Create tailwind.config.ts
        const tailwindConfig = `export default {
    content: ['./registry/**/*.{js,ts,jsx,tsx}'],
  };`;
        fs.writeFileSync(path.join(SHADCN_DIR, 'tailwind.config.ts'), tailwindConfig);
        
        // Create tsconfig.json (overwrite Next.js default if needed)
        const tsConfig = {
            "extends": "@sindresorhus/tsconfig",
            "compilerOptions": {
                "outDir": "dist",
                "paths": {
                    "@/*": ["./src/*"]
                }
            },
            "include": ["source"]
        };
        fs.writeFileSync(path.join(SHADCN_DIR, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
        
        // Add the component
        console.log(`Running: npx shadcn@${SHADCN_VERSION} add ${REGISTRY_URL} -y`);
        execSync(`npx shadcn@${SHADCN_VERSION} add ${REGISTRY_URL} -y`, { 
            cwd: SHADCN_DIR, 
            stdio: 'inherit' 
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
        execSync('npx -y create-next-app@latest . --typescript --no-tailwind --eslint --src-dir --app --use-npm --yes', { cwd: LIFTKIT_DIR, stdio: 'inherit' });
        
        // Copy our CLI to the test directory
        const cliPath = path.join(__dirname, '..', 'dist', 'cli.cjs');
        const testCliPath = path.join(LIFTKIT_DIR, 'cli.cjs');
        fs.copyFileSync(cliPath, testCliPath);
        
        // Copy components.json for configuration
        const componentsJsonPath = path.join(__dirname, '..', 'components.json');
        const testComponentsJsonPath = path.join(LIFTKIT_DIR, 'components.json');
        
        // Read the original components.json and update aliases to use @/ prefix
        const originalConfig = JSON.parse(fs.readFileSync(componentsJsonPath, 'utf8'));
        const testConfig = {
            ...originalConfig,
            aliases: {
                "components": "@/components",
                "utils": "@/lib/utils",
                "ui": "@/components/ui",
                "lib": "@/lib",
                "hooks": "@/hooks"
            }
        };
        fs.writeFileSync(testComponentsJsonPath, JSON.stringify(testConfig, null, 2));
        
        // Create tsconfig.json for LiftKit test to match shadcn structure (overwrite Next.js default if needed)
        const tsConfig = {
            "extends": "@sindresorhus/tsconfig",
            "compilerOptions": {
                "outDir": "dist",
                "paths": {
                    "@/*": ["./src/*"]
                }
            },
            "include": ["source"]
        };
        fs.writeFileSync(path.join(LIFTKIT_DIR, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
        
        // Add the component
        console.log(`Running: ./cli.cjs add ${TEST_COMPONENT}`);
        execSync(`./cli.cjs add ${TEST_COMPONENT}`, { 
            cwd: LIFTKIT_DIR, 
            stdio: 'inherit' 
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
    
    const shadcnFiles = getAllFiles(shadcnSrc).map(f => f.replace(shadcnSrc, ''));
    const liftkitFiles = getAllFiles(liftkitSrc).map(f => f.replace(liftkitSrc, ''));
    
    console.log(`📊 shadcn generated ${shadcnFiles.length} files in /src`);
    console.log(`📊 LiftKit generated ${liftkitFiles.length} files in /src`);
    
    // Flattened: single switch for file count and location match
    switch (true) {
        case shadcnFiles.length !== liftkitFiles.length:
            console.log('⚠️  File count mismatch!');
            console.log('shadcn files:', shadcnFiles.join(', '));
            console.log('LiftKit files:', liftkitFiles.sort());
            break;
        default:
            console.log('✅ File counts match');
            break;
    }
    
    const locationMatch = JSON.stringify(shadcnFiles.sort()) === JSON.stringify(liftkitFiles.sort());
    switch (locationMatch) {
        case true:
            console.log('✅ File locations match');
            break;
        case false:
            console.log('❌ File locations do not match');
            console.log('shadcn locations:', shadcnFiles.sort());
            console.log('LiftKit locations:', liftkitFiles.sort());
            break;
    }
    
    // Calculate similarity score
    const similarityScore = calculateSimilarityScore(shadcnSrc, liftkitSrc);
    
    console.log(`\n📈 Similarity Analysis:`);
    console.log(`   Overall Similarity: ${similarityScore.overall}%`);
    console.log(`   File Count Match: ${similarityScore.fileCount ? '✅' : '❌'}`);
    console.log(`   File Location Match: ${similarityScore.fileLocation ? '✅' : '❌'}`);
    console.log(`   Content Similarity: ${similarityScore.content}%`);
    console.log(`   Functional Similarity: ${similarityScore.functional}%`);
    
    // Determine if test passes based on similarity thresholds
    const PASS_THRESHOLD = 85; // 85% similarity is considered a pass
    const FUNCTIONAL_THRESHOLD = 95; // 95% functional similarity required
    
    const testPasses = similarityScore.overall >= PASS_THRESHOLD && 
                      similarityScore.functional >= FUNCTIONAL_THRESHOLD;
    
    switch (true) {
        case testPasses:
            console.log(`\n✅ Test PASSED - Similarity score ${similarityScore.overall}% >= ${PASS_THRESHOLD}%`);
            return true;
        default:
            console.log(`\n❌ Test FAILED - Similarity score ${similarityScore.overall}% < ${PASS_THRESHOLD}%`);
            
            // Show detailed diff for failed tests
            showDetailedDiff(shadcnSrc, liftkitSrc);
            return false;
    }
}

function calculateSimilarityScore(shadcnSrc, liftkitSrc) {
    const shadcnFiles = getAllFiles(shadcnSrc);
    const liftkitFiles = getAllFiles(liftkitSrc);
    
    // File count similarity
    const fileCountMatch = shadcnFiles.length === liftkitFiles.length;
    const fileCountScore = fileCountMatch ? 100 : 0;
    
    // File location similarity
    const shadcnPaths = shadcnFiles.map(f => f.replace(shadcnSrc, ''));
    const liftkitPaths = liftkitFiles.map(f => f.replace(liftkitSrc, ''));
    const fileLocationMatch = JSON.stringify(shadcnPaths.sort()) === JSON.stringify(liftkitPaths.sort());
    const fileLocationScore = fileLocationMatch ? 100 : 0;
    
    // Content similarity (comparing actual file contents)
    const contentScore = calculateContentSimilarity(shadcnSrc, liftkitSrc);
    
    // Functional similarity (ignoring cosmetic differences)
    const functionalScore = calculateFunctionalSimilarity(shadcnSrc, liftkitSrc);
    
    // Overall score (weighted average)
    const overall = Math.round(
        (fileCountScore * 0.1) + 
        (fileLocationScore * 0.2) + 
        (contentScore * 0.3) + 
        (functionalScore * 0.4)
    );
    
    return {
        overall,
        fileCount: fileCountMatch,
        fileLocation: fileLocationMatch,
        content: contentScore,
        functional: functionalScore
    };
}

function calculateContentSimilarity(shadcnSrc, liftkitSrc) {
    const shadcnFiles = getAllFiles(shadcnSrc);
    const liftkitFiles = getAllFiles(liftkitSrc);
    
    let totalSimilarity = 0;
    let comparedFiles = 0;
    
    // Create a map of relative paths to full paths
    const shadcnFileMap = new Map();
    const liftkitFileMap = new Map();
    
    shadcnFiles.forEach(file => {
        const relativePath = file.replace(shadcnSrc, '');
        shadcnFileMap.set(relativePath, file);
    });
    
    liftkitFiles.forEach(file => {
        const relativePath = file.replace(liftkitSrc, '');
        liftkitFileMap.set(relativePath, file);
    });
    
    // Compare files that exist in both directories
    const allPaths = new Set([...shadcnFileMap.keys(), ...liftkitFileMap.keys()]);
    allPaths.forEach(relativePath => {
        const shadcnFile = shadcnFileMap.get(relativePath);
        const liftkitFile = liftkitFileMap.get(relativePath);
        if (shadcnFile && liftkitFile) {
            const similarity = compareFileContents(shadcnFile, liftkitFile);
            totalSimilarity += similarity;
            comparedFiles++;
        }
    });
    
    return comparedFiles > 0 ? Math.round(totalSimilarity / comparedFiles) : 0;
}

function calculateFunctionalSimilarity(shadcnSrc, liftkitSrc) {
    const shadcnFiles = getAllFiles(shadcnSrc);
    const liftkitFiles = getAllFiles(liftkitSrc);
    
    let totalSimilarity = 0;
    let comparedFiles = 0;
    
    const shadcnFileMap = new Map();
    const liftkitFileMap = new Map();
    
    shadcnFiles.forEach(file => {
        const relativePath = file.replace(shadcnSrc, '');
        shadcnFileMap.set(relativePath, file);
    });
    
    liftkitFiles.forEach(file => {
        const relativePath = file.replace(liftkitSrc, '');
        liftkitFileMap.set(relativePath, file);
    });
    
    const allPaths = new Set([...shadcnFileMap.keys(), ...liftkitFileMap.keys()]);
    allPaths.forEach(relativePath => {
        const shadcnFile = shadcnFileMap.get(relativePath);
        const liftkitFile = liftkitFileMap.get(relativePath);
        if (shadcnFile && liftkitFile) {
            const similarity = compareFileContentsFunctional(shadcnFile, liftkitFile);
            totalSimilarity += similarity;
            comparedFiles++;
        }
    });
    
    return comparedFiles > 0 ? Math.round(totalSimilarity / comparedFiles) : 0;
}

function compareFileContents(file1, file2) {
    try {
        const content1 = fs.readFileSync(file1, 'utf8');
        const content2 = fs.readFileSync(file2, 'utf8');
        
        switch (content1 === content2) {
            case true:
                return 100;
        }
        
        // Calculate similarity based on common lines
        const lines1 = content1.split('\n');
        const lines2 = content2.split('\n');
        
        const commonLines = lines1.filter(line => lines2.includes(line));
        const totalLines = Math.max(lines1.length, lines2.length);
        
        return totalLines > 0 ? Math.round((commonLines.length / totalLines) * 100) : 0;
    } catch {
        return 0;
    }
}

function compareFileContentsFunctional(file1, file2) {
    try {
        let content1 = fs.readFileSync(file1, 'utf8');
        let content2 = fs.readFileSync(file2, 'utf8');
        
        // Normalize content for functional comparison
        content1 = normalizeForFunctionalComparison(content1);
        content2 = normalizeForFunctionalComparison(content2);
        
        switch (content1 === content2) {
            case true:
                return 100;
        }
        
        // Calculate similarity based on normalized content
        const lines1 = content1.split('\n').filter(line => line.trim());
        const lines2 = content2.split('\n').filter(line => line.trim());
        
        const commonLines = lines1.filter(line => lines2.includes(line));
        const totalLines = Math.max(lines1.length, lines2.length);
        
        return totalLines > 0 ? Math.round((commonLines.length / totalLines) * 100) : 0;
    } catch {
        return 0;
    }
}

function normalizeForFunctionalComparison(content) {
    return content
        // Remove comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // /* ... */ comments
        .replace(/\/\/.*$/gm, '') // // ... comments
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

function showDetailedDiff(shadcnSrc, liftkitSrc) {
    try {
        console.log('\n🔍 Detailed diff output:');
        console.log('='.repeat(50));
        const diffOutput = execSync(`diff -r "${shadcnSrc}" "${liftkitSrc}"`, { 
            encoding: 'utf8',
            stdio: 'pipe'
        });
        switch (true) {
            case !!diffOutput.trim():
                console.log(diffOutput);
                break;
            default:
                console.log('No differences found');
                break;
        }
        console.log('='.repeat(50));
        
    } catch (error) {
        switch (true) {
            case error.status === 1:
                console.log('\n📋 Diff output:');
                console.log('='.repeat(50));
                console.log(error.stdout || error.stderr);
                console.log('='.repeat(50));
                break;
            default:
                console.error('❌ Error running diff comparison:', error.message);
                break;
        }
    }
}

// Helper function to get all files recursively
function getAllFiles(dir) {
    const items = fs.readdirSync(dir);
    return items.flatMap(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && item === 'node_modules') {
            return [];
        } else if (stat.isDirectory()) {
            return getAllFiles(fullPath);
        } else if (!stat.isDirectory() && item === 'components.json') {
            return [];
        } else {
            return [fullPath];
        }
    });
}

// Main test runner
function runTests() {
    cleanup();
    
    const shadcnSuccess = testShadcn();
    const liftkitSuccess = testLiftKit();
    
    if (shadcnSuccess && liftkitSuccess) {
        const comparisonSuccess = compareResults();
        switch (comparisonSuccess) {
            case true:
                console.log('🎉 All tests passed!');
                process.exit(0);
                break;
            case false:
                console.log('❌ Tests failed - results do not match');
                process.exit(1);
                break;
        }
    } else {
        console.log('❌ Tests failed - one or both CLIs failed');
        process.exit(1);
    }
}

// Run the tests
runTests(); 