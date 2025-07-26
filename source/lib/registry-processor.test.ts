import {describe, it, expect, vi, beforeEach} from 'vitest';
import {RegistryProcessor} from './registry-processor.js';
import {RegistryType, CSSVars} from './registry-types.js';
import {RegistryItem} from './registry-types.js';

describe('RegistryProcessor', () => {
  let processor: RegistryProcessor;

  beforeEach(() => {
    processor = new RegistryProcessor({
      baseDir: '/tmp',
      installDependencies: false,
    });
  });

  it('processes all files in item.files and skips nulls', async () => {
    const item = {
      name: 'test',
      type: 'registry:component' as const,
      files: [
        {path: 'a', content: 'x', type: 'registry:component' as RegistryType},
        {
          path: 'skip',
          content: null,
          type: 'registry:component' as RegistryType,
        },
        {path: 'b', content: 'y', type: 'registry:component' as RegistryType},
      ] as import('./registry-types.js').RegistryFile[],
      dependencies: ['dep1'],
      devDependencies: ['devDep1'],
      registryDependencies: [],
    };

    const result = await processor.processRegistryItem(item);
    expect(result.processedFiles.length).toBe(2);
    expect(result.npmDependencies).toContain('dep1');
    expect(result.devDependencies).toContain('devDep1');
  });

  it('appends CSS variables to globals.css', async () => {
    const mockFs = {
      writeFileSync: vi.fn(),
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(),
    };
    const processor = new RegistryProcessor(
      {baseDir: '/tmp'},
      mockFs as unknown as typeof import('fs'),
    );
    const cssVars: CSSVars = {theme: {foo: 'red', bar: 'blue'}};
    await processor.processCSSVars(cssVars);
    expect(mockFs.writeFileSync).toHaveBeenCalled();
    expect(mockFs.writeFileSync.mock.calls.length).toBeGreaterThan(0);
    const callArgs = mockFs.writeFileSync.mock.calls[0]?.[1];
    expect(callArgs).toBeDefined();
    expect(callArgs).toContain('--foo: red;');
    expect(callArgs).toContain('--bar: blue;');
  });
});

describe('RegistryProcessor (public API)', () => {
  it('getProcessedUrls and clearProcessedUrls work as expected', () => {
    const processor = new RegistryProcessor({baseDir: '/tmp'});
    // Test the public methods
    expect(processor.getProcessedUrls()).toEqual([]);
    processor.clearProcessedUrls();
    expect(processor.getProcessedUrls()).toEqual([]);
  });
});

describe('File conflict checking', () => {
  it('should detect identical files and skip them', async () => {
    const mockFs = {
      writeFileSync: vi.fn(),
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(
        () => 'export const Button = () => <button>Click me</button>',
      ),
    };
    const tempDir = '/tmp/test-conflict';
    const processor = new RegistryProcessor(
      {
        baseDir: tempDir,
        skipConflicts: false,
      },
      mockFs as unknown as typeof import('fs'),
    );

    const existingContent =
      'export const Button = () => <button>Click me</button>';
    const registryItem: RegistryItem = {
      name: 'button',
      type: 'registry:component',
      files: [
        {
          path: 'registry/nextjs/components/button.tsx',
          content: existingContent,
          type: 'registry:component',
        },
      ],
    };

    const result = await processor.processRegistryItem(registryItem);

    expect(result.processedFiles).toHaveLength(1);
  });

  it('should skip conflict checking when skipConflicts is true', async () => {
    const mockFs = {
      writeFileSync: vi.fn(),
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(
        () => 'export const OldButton = () => <button>Old</button>',
      ),
    };
    const tempDir = '/tmp/test-conflict';
    const processor = new RegistryProcessor(
      {
        baseDir: tempDir,
        skipConflicts: true,
      },
      mockFs as unknown as typeof import('fs'),
    );

    const newContent = 'export const NewButton = () => <button>New</button>';
    const registryItem: RegistryItem = {
      name: 'button',
      type: 'registry:component',
      files: [
        {
          path: 'registry/nextjs/components/button.tsx',
          content: newContent,
          type: 'registry:component',
        },
      ],
    };

    const result = await processor.processRegistryItem(registryItem);

    expect(result.processedFiles).toHaveLength(1);
  });
});
