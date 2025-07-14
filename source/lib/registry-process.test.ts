import {describe, it, expect, vi, beforeEach} from 'vitest';
import * as process from './registry-process.js';
import {RegistryItem, DependencyNode} from './registry-types.js';

globalThis.fetch = vi.fn();

const mockItem = (
  name: string,
  deps: string[] = [],
  npm: string[] = [],
  dev: string[] = [],
): RegistryItem => ({
  name,
  type: 'registry:component',
  registryDependencies: deps,
  dependencies: npm,
  devDependencies: dev,
  files: [],
});

describe('registry-process', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('extractRegistryDependencies returns registryDependencies or []', () => {
    const item: RegistryItem = {
      name: 'foo',
      type: 'registry:component',
      registryDependencies: ['a'],
      dependencies: [],
      devDependencies: [],
      files: [],
    };
    expect(process.extractRegistryDependencies(item)).toEqual(['a']);
    const item2: RegistryItem = {
      name: 'bar',
      type: 'registry:component',
      registryDependencies: [],
      dependencies: [],
      devDependencies: [],
      files: [],
    };
    expect(process.extractRegistryDependencies(item2)).toEqual([]);
  });

  it('extractNpmDependencies returns dependencies and devDependencies', () => {
    const item: RegistryItem = {
      name: 'foo',
      type: 'registry:component',
      registryDependencies: [],
      dependencies: ['a'],
      devDependencies: ['b'],
      files: [],
    };
    expect(process.extractNpmDependencies(item)).toEqual(['a', 'b']);
    const item2: RegistryItem = {
      name: 'bar',
      type: 'registry:component',
      registryDependencies: [],
      dependencies: [],
      devDependencies: [],
      files: [],
    };
    expect(process.extractNpmDependencies(item2)).toEqual([]);
  });

  it('flattenDependencyTree returns all items in tree', () => {
    const tree: DependencyNode = {
      name: 'root',
      item: {
        name: 'root',
        type: 'registry:component',
        registryDependencies: [],
        dependencies: [],
        devDependencies: [],
        files: [],
      },
      registryDependencies: [
        {
          name: 'a',
          item: {
            name: 'a',
            type: 'registry:component',
            registryDependencies: [],
            dependencies: [],
            devDependencies: [],
            files: [],
          },
          registryDependencies: [],
          dependencies: [],
          depth: 1,
        },
      ],
      dependencies: [],
      depth: 0,
    };
    expect(
      process.flattenDependencyTree(tree).map((i: RegistryItem) => i.name),
    ).toEqual(['root', 'a']);
  });

  it('getAllDependencies collects all registry and npm dependencies', () => {
    const items = [
      mockItem('a', ['b'], ['npm1'], ['dev1']),
      mockItem('b', [], ['npm2'], []),
    ];
    const tree: DependencyNode = {
      name: 'a',
      item: items[0]!,
      registryDependencies: [
        {
          name: 'b',
          item: items[1]!,
          registryDependencies: [],
          dependencies: [],
          depth: 1,
        },
      ],
      dependencies: [],
      depth: 0,
    };
    const result = process.getAllDependencies(tree);
    expect(result.registryDependencies).toContain('b');
    expect(result.npmDependencies).toEqual(
      expect.arrayContaining(['npm1', 'dev1', 'npm2']),
    );
    expect(result.allItems.length).toBe(2);
  });

  it('calculateInstallationOrder returns items in dependency order', () => {
    const tree: DependencyNode = {
      name: 'root',
      item: {
        name: 'root',
        type: 'registry:component',
        registryDependencies: [],
        dependencies: [],
        devDependencies: [],
        files: [],
      },
      registryDependencies: [
        {
          name: 'a',
          item: {
            name: 'a',
            type: 'registry:component',
            registryDependencies: [],
            dependencies: [],
            devDependencies: [],
            files: [],
          },
          registryDependencies: [],
          dependencies: [],
          depth: 1,
        },
      ],
      dependencies: [],
      depth: 0,
    };
    const order = process
      .calculateInstallationOrder(tree)
      .map((i: RegistryItem) => i.name);
    expect(order).toEqual(['a', 'root']);
  });

  it('fetchSchema throws on non-ok response', async () => {
    (globalThis.fetch as unknown) = vi
      .fn()
      .mockResolvedValue({ok: false, status: 404, statusText: 'Not Found'});
    await expect(process.fetchSchema('url')).rejects.toThrow(
      'Failed to fetch schema',
    );
  });

  it('fetchSchema returns json on ok', async () => {
    (globalThis.fetch as unknown) = vi
      .fn()
      .mockResolvedValue({ok: true, json: () => Promise.resolve({foo: 1})});
    await expect(process.fetchSchema('url')).resolves.toEqual({foo: 1});
  });

  it('fetchRegistryIndex throws on non-ok response', async () => {
    (globalThis.fetch as unknown) = vi
      .fn()
      .mockResolvedValue({ok: false, status: 500});
    await expect(process.fetchRegistryIndex('base')).rejects.toThrow(
      'Failed to fetch registry index',
    );
  });

  it('fetchRegistryItem throws on non-ok response', async () => {
    (globalThis.fetch as unknown) = vi
      .fn()
      .mockResolvedValue({ok: false, status: 500});
    await expect(process.fetchRegistryItem('foo', 'base')).rejects.toThrow(
      'Failed to fetch registry item',
    );
  });

  it('fetchRegistryItems calls fetchRegistryItem for each name', async () => {
    (globalThis.fetch as unknown) = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'x',
          type: 'registry:component',
          registryDependencies: [],
          dependencies: [],
          devDependencies: [],
          files: [],
        }),
    });
    const result = await process.fetchRegistryItems(['a', 'b'], 'base');
    expect(result.length).toBe(2);
    expect(result[0]).toHaveProperty('name', 'x');
  });

  it('buildDependencyTree throws on circular dependency', async () => {
    (globalThis.fetch as unknown) = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'a',
          type: 'registry:component',
          registryDependencies: ['a'],
          dependencies: [],
          devDependencies: [],
          files: [],
        }),
    });
    await expect(process.buildDependencyTree('a')).rejects.toThrow(
      'Circular dependency',
    );
  });
});
