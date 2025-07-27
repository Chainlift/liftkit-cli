import {describe, it, expect} from 'vitest';
import {config} from './config.js';

describe('config', () => {
  it('should export a config object with all required properties', () => {
    expect(config).toHaveProperty('repo', 'https://liftkit.pages.dev');
    expect(config).toHaveProperty(
      'templaterepo',
      'https://raw.githubusercontent.com/Chainlift/liftkit-template/refs/heads/main',
    );
    expect(config).toHaveProperty('aliases');
    expect(config.aliases).toMatchObject({
      components: '@/components',
      ui: '@/components/ui',
      lib: '@/lib',
      hooks: '@/hooks',
    });
    expect(config).toHaveProperty('tsconfigjson');
    expect(config.tsconfigjson).toHaveProperty('compilerOptions');
    expect(config.tsconfigjson.compilerOptions).toHaveProperty('paths');
    expect(config.tsconfigjson.compilerOptions.paths).toMatchObject({
      '@/*': ['./src/*'],
    });
  });

  it('should have all aliases as non-empty strings', () => {
    Object.values(config.aliases).forEach(value => {
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    });
  });

  it('should have tsconfigjson.compilerOptions.paths as an object with string[] values', () => {
    const paths = config.tsconfigjson.compilerOptions.paths;
    expect(typeof paths).toBe('object');
    Object.values(paths).forEach(val => {
      expect(Array.isArray(val)).toBe(true);
      (val as string[]).forEach((entry: unknown) =>
        expect(typeof entry).toBe('string'),
      );
    });
  });
});
