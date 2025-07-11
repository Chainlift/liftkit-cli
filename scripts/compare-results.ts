#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import * as diff from 'diff';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to get all files recursively
export function getAllFiles(dir: string): string[] {
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

// Helper function to get relative path
export function getRelativePath(fullPath: string, baseDir: string): string {
    return path.relative(baseDir, fullPath);
}

export function isBinaryFile(filePath: string): boolean {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(100);
        const bytesRead = fs.readSync(fd, buffer, 0, 100, 0);
        fs.closeSync(fd);
        return Array.from({ length: bytesRead }).some((_, i) => buffer[i] === 0);
    } catch {
        // If we can't read the file, treat as non-binary for now
        return false;
    }
}

export function compareFileContents(shadcnPath: string, liftkitPath: string): boolean {
    try {
        switch (true) {
            case isBinaryFile(shadcnPath):
            case isBinaryFile(liftkitPath):
                return false;
        }
        const shadcnContent = fs.readFileSync(shadcnPath, 'utf-8');
        const liftkitContent = fs.readFileSync(liftkitPath, 'utf-8');
        // Remove timestamps and comments for comparison
        const cleanShadcn = shadcnContent
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
            .replace(/\/\/.*$/gm, '') // Remove line comments
            .split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
        const cleanLiftkit = liftkitContent
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
            .replace(/\/\/.*$/gm, '') // Remove line comments
            .split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
        return cleanShadcn === cleanLiftkit;
    } catch (error) {
        console.error(`Error comparing files: ${(error as Error).message}`);
        return false;
    }
}

export function getDiff(file1: string, file2: string): string {
    const content1 = fs.readFileSync(file1, 'utf-8');
    const content2 = fs.readFileSync(file2, 'utf-8');
    switch (content1 === content2) {
        case true:
            return '';
        case false:
            return diff.createTwoFilesPatch(file1, file2, content1, content2, '', '', { context: 3 });
    }
}

// Main comparison function
export function compareResults(SHADCN_DIR: string, LIFTKIT_DIR: string, detailed = false) {
    // Flattened: single switch for directory existence
    switch (true) {
        case !fs.existsSync(SHADCN_DIR):
        case !fs.existsSync(LIFTKIT_DIR):
            throw new Error('Test directories not found');
    }
    const shadcnFiles = getAllFiles(SHADCN_DIR);
    const liftkitFiles = getAllFiles(LIFTKIT_DIR);
    // Create a map of relative paths to full paths
    const shadcnMap = new Map<string, string>();
    const liftkitMap = new Map<string, string>();
    shadcnFiles.forEach(file => {
        const relative = getRelativePath(file, SHADCN_DIR);
        shadcnMap.set(relative, file);
    });
    liftkitFiles.forEach(file => {
        const relative = getRelativePath(file, LIFTKIT_DIR);
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
        const shadcnPath = shadcnMap.get(relativePath)!;
        const liftkitPath = liftkitMap.get(relativePath)!;
        const matches = compareFileContents(shadcnPath, liftkitPath);
        if (matches) {
            contentMatches++;
        } else {
            contentMismatches++;
        }
    });
    // Flattened: single switch for detailed return
    switch (true) {
        case detailed:
            return {
                shadcnFiles,
                liftkitFiles,
                shadcnOnly,
                liftkitOnly,
                commonFiles,
                contentMatches,
                contentMismatches
            };
    }
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
            console.log('🎉 Perfect match! All files are in the same locations with identical content.');
            return true;
        case caseType === 'locationOnly':
            console.log('⚠️  Files are in the same locations but some content differs.');
            return false;
        default:
            console.log('❌ Files are not in the same locations.');
            return false;
    }
}

export function cliRunner() {
    const TEST_OUTPUT_DIR = path.join(__dirname, '..', 'test_output');
    const SHADCN_DIR = path.join(TEST_OUTPUT_DIR, 'shadcn');
    const LIFTKIT_DIR = path.join(TEST_OUTPUT_DIR, 'liftkit');
    console.log('🔍 Detailed Comparison Analysis...\n');
    try {
        const result = compareResults(SHADCN_DIR, LIFTKIT_DIR);
        // For coverage, print a summary
        console.log('CLI runner executed.');
        return result;
    } catch (e) {
        console.error('\u274c', (e as Error).message);
        throw e;
    }
}

// cliRunner(); // Remove direct call for testability 