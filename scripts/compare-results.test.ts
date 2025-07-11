import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getAllFiles,
  getRelativePath,
  compareFileContents,
  compareResults,
  getDiff,
  cliRunner,
  isBinaryFile
} from './compare-results.js';

describe('compare-results module', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-test-'));
  });

  afterEach(() => {
    // Recursively delete tempDir
    function rmDir(dir: string) {
      switch (fs.existsSync(dir)) {
        case true:
          fs.readdirSync(dir).forEach((file) => {
            const curPath = path.join(dir, file);
            switch (fs.lstatSync(curPath).isDirectory()) {
              case true:
                rmDir(curPath);
                break;
              case false:
                fs.unlinkSync(curPath);
                break;
            }
          });
          fs.rmdirSync(dir);
          break;
      }
    }
    rmDir(tempDir);
  });

  test('getAllFiles returns all files recursively', () => {
    const subDir = path.join(tempDir, 'sub');
    fs.mkdirSync(subDir);
    const file1 = path.join(tempDir, 'a.txt');
    const file2 = path.join(subDir, 'b.txt');
    fs.writeFileSync(file1, 'foo');
    fs.writeFileSync(file2, 'bar');
    const files = getAllFiles(tempDir);
    expect(files.sort()).toEqual([file1, file2].sort());
  });

  test('getRelativePath returns correct relative path', () => {
    const base = '/foo/bar';
    const file = '/foo/bar/baz/qux.txt';
    expect(getRelativePath(file, base)).toBe('baz/qux.txt');
  });

  test('getRelativePath uses path.relative for robust normalization', () => {
    // Handles trailing slashes, different OS separators, etc.
    const base = path.join('/foo/bar/');
    const file = path.join('/foo/bar', 'baz', 'qux.txt');
    // Should always return 'baz/qux.txt' regardless of trailing slash or OS
    expect(getRelativePath(file, base)).toBe(path.join('baz', 'qux.txt'));
  });

  test('getAllFiles skips unreadable files and does not throw', () => {
    const file1 = path.join(tempDir, 'a.txt');
    fs.writeFileSync(file1, 'foo');
    const file2 = path.join(tempDir, 'b.txt');
    fs.writeFileSync(file2, 'bar');
    // Simulate unreadable file by mocking fs.lstatSync
    const originalLstatSync = fs.lstatSync;
    const mockLstatSync = (p: string) => {
      switch (p === file2) {
        case true:
          throw new Error('Permission denied');
        case false:
          return originalLstatSync(p);
      }
    };
    (fs as unknown as { lstatSync: typeof mockLstatSync }).lstatSync = mockLstatSync;
    let files: string[] = [];
    expect(() => {
      files = getAllFiles(tempDir);
    }).not.toThrow();
    expect(files).toContain(file1);
    expect(files).not.toContain(file2);
    // Restore original function
    (fs as unknown as { lstatSync: typeof originalLstatSync }).lstatSync = originalLstatSync;
  });

  test('getAllFiles skips symlinks and does not recurse into them', () => {
    const subDir = path.join(tempDir, 'sub');
    fs.mkdirSync(subDir);
    const file1 = path.join(subDir, 'a.txt');
    fs.writeFileSync(file1, 'foo');
    const symlink = path.join(tempDir, 'link');
    fs.symlinkSync(subDir, symlink);
    const files = getAllFiles(tempDir);
    expect(files).toContain(file1);
    expect(files).not.toContain(symlink);
  });

  test('compareFileContents skips binary files and returns false', () => {
    const file1 = path.join(tempDir, 'a.bin');
    const file2 = path.join(tempDir, 'b.txt');
    // Write binary data to file1
    fs.writeFileSync(file1, Buffer.from([0, 159, 146, 150]));
    fs.writeFileSync(file2, 'hello');
    let result: boolean = false;
    expect(() => {
      result = compareFileContents(file1, file2);
    }).not.toThrow();
    expect(result).toBe(false);
  });

  test('compareFileContents does not collapse all whitespace, only trims leading/trailing', () => {
    const file1 = path.join(tempDir, 'a.js');
    const file2 = path.join(tempDir, 'b.js');
    fs.writeFileSync(file1, 'const x = "foo   bar";');
    fs.writeFileSync(file2, 'const x = "foo bar";');
    expect(compareFileContents(file1, file2)).toBe(false);
    // But leading/trailing whitespace should be ignored
    fs.writeFileSync(file1, '   const x = 1;   ');
    fs.writeFileSync(file2, 'const x = 1;');
    expect(compareFileContents(file1, file2)).toBe(true);
  });

  test('compareFileContents does not remove comment-like patterns inside string literals', () => {
    const file1 = path.join(tempDir, 'a.js');
    const file2 = path.join(tempDir, 'b.js');
    // Only real comments should be removed, not comment-like text in strings
    fs.writeFileSync(file1, 'const x = "// not a comment"; // real comment');
    fs.writeFileSync(file2, 'const x = "// not a comment";');
    expect(compareFileContents(file1, file2)).toBe(true);
    fs.writeFileSync(file1, 'const x = "/* not a comment */"; /* real comment */');
    fs.writeFileSync(file2, 'const x = "/* not a comment */";');
    expect(compareFileContents(file1, file2)).toBe(true);
    // But if the string content is different, should not match
    fs.writeFileSync(file1, 'const x = "// not a comment!"; // real comment');
    fs.writeFileSync(file2, 'const x = "/* not a comment */";');
    expect(compareFileContents(file1, file2)).toBe(false);
  });

  test('isBinaryFile returns false if file cannot be opened (error branch)', () => {
    // Use a non-existent file path
    expect(isBinaryFile('/non/existent/file.bin')).toBe(false);
  });

  test('compareFileContents returns false and logs error if file cannot be read (error branch)', () => {
    const originalError = console.error;
    let errorMsg: string = '';
    console.error = (msg: string) => { errorMsg = msg; };
    // Use a non-existent file path
    expect(compareFileContents('/non/existent/file1.txt', '/non/existent/file2.txt')).toBe(false);
    expect(errorMsg).toMatch(/Error comparing files/);
    console.error = originalError;
  });

  test('getDiff outputs a unified diff for content mismatches', () => {
    const file1 = path.join(tempDir, 'a.txt');
    const file2 = path.join(tempDir, 'b.txt');
    fs.writeFileSync(file1, 'hello\nworld\nfoo');
    fs.writeFileSync(file2, 'hello\nplanet\nfoo');
    const diffOutput = getDiff(file1, file2);
    expect(diffOutput).toMatch(/-world/);
    expect(diffOutput).toMatch(/\+planet/);
    expect(diffOutput).toMatch(/@@/); // unified diff header
  });

  test('getAllFiles returns empty array for empty directory', () => {
    const files = getAllFiles(tempDir);
    expect(files).toEqual([]);
  });

  test('getAllFiles returns empty array for non-existent directory', () => {
    const files = getAllFiles(path.join(tempDir, 'does-not-exist'));
    expect(files).toEqual([]);
  });

  test('getRelativePath returns empty string for identical paths', () => {
    const file = '/foo/bar/baz.txt';
    expect(getRelativePath(file, file)).toBe('');
  });

  test('getRelativePath returns ..-prefixed path for outside base', () => {
    const base = '/foo/bar';
    const file = '/foo/baz.txt';
    expect(getRelativePath(file, base)).toMatch(/^\.\./);
  });

  test('compareFileContents returns true for identical files', () => {
    const file1 = path.join(tempDir, 'a.txt');
    fs.writeFileSync(file1, 'hello world');
    expect(compareFileContents(file1, file1)).toBe(true);
  });

  test('compareFileContents returns true for empty files', () => {
    const file1 = path.join(tempDir, 'a.txt');
    const file2 = path.join(tempDir, 'b.txt');
    fs.writeFileSync(file1, '');
    fs.writeFileSync(file2, '');
    expect(compareFileContents(file1, file2)).toBe(true);
  });

  test('compareFileContents returns false for different files', () => {
    const file1 = path.join(tempDir, 'a.txt');
    const file2 = path.join(tempDir, 'b.txt');
    fs.writeFileSync(file1, 'hello');
    fs.writeFileSync(file2, 'world');
    expect(compareFileContents(file1, file2)).toBe(false);
  });

  test('compareFileContents handles files with only comments', () => {
    const file1 = path.join(tempDir, 'a.js');
    const file2 = path.join(tempDir, 'b.js');
    fs.writeFileSync(file1, '// comment 1\n/* comment 2 */');
    fs.writeFileSync(file2, '// different comment\n/* another comment */');
    expect(compareFileContents(file1, file2)).toBe(true);
  });

  test('compareFileContents handles files with mixed content and comments', () => {
    const file1 = path.join(tempDir, 'a.js');
    const file2 = path.join(tempDir, 'b.js');
    fs.writeFileSync(file1, 'const x = 1; // comment\n/* block comment */\nconst y = 2;');
    fs.writeFileSync(file2, 'const x = 1;\nconst y = 2;');
    expect(compareFileContents(file1, file2)).toBe(true);
  });

  test('compareResults throws error for non-existent directories', () => {
    expect(() => compareResults('/non/existent1', '/non/existent2')).toThrow('Test directories not found');
  });

  test('compareResults returns true for identical directory structures', () => {
    const dir1 = path.join(tempDir, 'dir1');
    const dir2 = path.join(tempDir, 'dir2');
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2);
    
    const file1 = path.join(dir1, 'test.txt');
    const file2 = path.join(dir2, 'test.txt');
    fs.writeFileSync(file1, 'hello world');
    fs.writeFileSync(file2, 'hello world');
    
    expect(compareResults(dir1, dir2)).toBe(true);
  });

  test('compareResults returns false for different file contents', () => {
    const dir1 = path.join(tempDir, 'dir1');
    const dir2 = path.join(tempDir, 'dir2');
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2);
    
    const file1 = path.join(dir1, 'test.txt');
    const file2 = path.join(dir2, 'test.txt');
    fs.writeFileSync(file1, 'hello world');
    fs.writeFileSync(file2, 'different content');
    
    expect(compareResults(dir1, dir2)).toBe(false);
  });

  test('compareResults returns false for different directory structures', () => {
    const dir1 = path.join(tempDir, 'dir1');
    const dir2 = path.join(tempDir, 'dir2');
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2);
    
    const file1 = path.join(dir1, 'test.txt');
    fs.writeFileSync(file1, 'hello world');
    // dir2 has no files
    
    expect(compareResults(dir1, dir2)).toBe(false);
  });

  test('cliRunner handles missing directories gracefully', () => {
    // Ensure test_output/shadcn and test_output/liftkit do not exist
    const testOutputDir = path.join(__dirname, '..', 'test_output');
    const shadcnDir = path.join(testOutputDir, 'shadcn');
    const liftkitDir = path.join(testOutputDir, 'liftkit');
    [shadcnDir, liftkitDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
    const originalError = console.error;
    let errorArgs: unknown[] = [];
    console.error = (...args: unknown[]) => { errorArgs = args; };
    expect(() => cliRunner()).toThrow('Test directories not found');
    expect(errorArgs.some(arg => typeof arg === 'string' && arg.includes('Test directories not found'))).toBe(true);
    console.error = originalError;
  });
}); 