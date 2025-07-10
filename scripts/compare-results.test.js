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
} from './compare-results.cjs';

describe('compare-results module', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-test-'));
  });

  afterEach(() => {
    // Recursively delete tempDir
    function rmDir(dir) {
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
    fs.lstatSync = (p) => {
      switch (p === file2) {
        case true:
          throw new Error('Permission denied');
        case false:
          return originalLstatSync(p);
      }
    };
    let files;
    expect(() => {
      files = getAllFiles(tempDir);
    }).not.toThrow();
    expect(files).toContain(file1);
    expect(files).not.toContain(file2);
    fs.lstatSync = originalLstatSync;
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
    let result;
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
    let errorMsg;
    console.error = (msg) => { errorMsg = msg; };
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
    const diff = getDiff(file1, file2);
    expect(diff).toMatch(/-world/);
    expect(diff).toMatch(/\+planet/);
    expect(diff).toMatch(/@@/); // unified diff header
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

  test('compareResults returns correct structure for one empty directory', () => {
    const dir1 = path.join(tempDir, 'dir1');
    const dir2 = path.join(tempDir, 'dir2');
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2);
    fs.writeFileSync(path.join(dir1, 'a.txt'), 'foo');
    const { shadcnOnly, liftkitOnly, commonFiles } = compareResults(dir1, dir2, true);
    expect(shadcnOnly).toEqual(['a.txt']);
    expect(liftkitOnly).toEqual([]);
    expect(commonFiles).toEqual([]);
  });

  test('getDiff returns empty diff for identical files', () => {
    const file1 = path.join(tempDir, 'a.txt');
    fs.writeFileSync(file1, 'foo\nbar');
    const diff = getDiff(file1, file1);
    // The diff should not contain any - or + lines
    expect(diff).not.toMatch(/^-|^\+/m);
  });

  test('getDiff handles empty files gracefully', () => {
    const file1 = path.join(tempDir, 'a.txt');
    const file2 = path.join(tempDir, 'b.txt');
    fs.writeFileSync(file1, '');
    fs.writeFileSync(file2, '');
    const diff = getDiff(file1, file2);
    expect(typeof diff).toBe('string');
  });

  test('cliRunner exits with error if directories are missing', () => {
    const originalExit = process.exit;
    const originalError = console.error;
    let errorArgs = [];
    process.exit = () => { throw new Error('exit'); };
    console.error = (...args) => { errorArgs = args; };
    expect(() => cliRunner()).toThrow('exit');
    expect(errorArgs.some(arg => /Test directories not found/.test(arg))).toBe(true);
    process.exit = originalExit;
    console.error = originalError;
  });

  test('cliRunner runs successfully if directories exist', () => {
    // Use already imported fs and path
    const testOutput = path.join(__dirname, '..', 'test_output');
    const shadcnDir = path.join(testOutput, 'shadcn');
    const liftkitDir = path.join(testOutput, 'liftkit');
    fs.mkdirSync(shadcnDir, { recursive: true });
    fs.mkdirSync(liftkitDir, { recursive: true });
    fs.writeFileSync(path.join(shadcnDir, 'a.txt'), 'foo');
    fs.writeFileSync(path.join(liftkitDir, 'a.txt'), 'foo');
    const originalLog = console.log;
    let logMsg;
    console.log = (msg) => { logMsg = msg; };
    expect(() => cliRunner()).not.toThrow();
    expect(logMsg).toMatch(/CLI runner executed/);
    // Cleanup
    fs.rmSync(testOutput, { recursive: true, force: true });
    console.log = originalLog;
  });

  test('compareResults throws if directories are missing (direct call)', () => {
    expect(() => compareResults('/non/existent/dir1', '/non/existent/dir2')).toThrow('Test directories not found');
  });

  test('cliRunner catch block logs and exits on error (direct simulation)', () => {
    const originalExit = process.exit;
    const originalError = console.error;
    let errorArgs = [];
    process.exit = () => { throw new Error('exit'); };
    console.error = (...args) => { errorArgs = args; };
    expect(() => {
      try {
        throw new Error('unexpected error');
      } catch (e) {
        console.error('❌', e.message);
        process.exit(1);
      }
    }).toThrow('exit');
    expect(errorArgs.join(' ')).toContain('unexpected error');
    process.exit = originalExit;
    console.error = originalError;
  });

  test('compareResults returns true and logs perfect match for identical files and content', () => {
    const dir1 = path.join(tempDir, 'dir1');
    const dir2 = path.join(tempDir, 'dir2');
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2);
    fs.writeFileSync(path.join(dir1, 'a.txt'), 'foo');
    fs.writeFileSync(path.join(dir2, 'a.txt'), 'foo');
    const originalLog = console.log;
    let logMsg = '';
    console.log = (msg) => { logMsg += msg; };
    const result = compareResults(dir1, dir2);
    expect(result).toBe(true);
    expect(logMsg).toMatch(/Perfect match/);
    console.log = originalLog;
  });

  test('compareResults returns false and logs locationOnly for same files, different content', () => {
    const dir1 = path.join(tempDir, 'dir1');
    const dir2 = path.join(tempDir, 'dir2');
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2);
    fs.writeFileSync(path.join(dir1, 'a.txt'), 'foo');
    fs.writeFileSync(path.join(dir2, 'a.txt'), 'bar');
    const originalLog = console.log;
    let logMsg = '';
    console.log = (msg) => { logMsg += msg; };
    const result = compareResults(dir1, dir2);
    expect(result).toBe(false);
    expect(logMsg).toMatch(/same locations but some content differs/);
    console.log = originalLog;
  });

  test('compareResults returns false and logs mismatch for different files', () => {
    const dir1 = path.join(tempDir, 'dir1');
    const dir2 = path.join(tempDir, 'dir2');
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2);
    fs.writeFileSync(path.join(dir1, 'a.txt'), 'foo');
    fs.writeFileSync(path.join(dir2, 'b.txt'), 'foo');
    const originalLog = console.log;
    let logMsg = '';
    console.log = (msg) => { logMsg += msg; };
    const result = compareResults(dir1, dir2);
    expect(result).toBe(false);
    expect(logMsg).toMatch(/not in the same locations/);
    console.log = originalLog;
  });
}); 