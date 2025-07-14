import {describe, it, expect} from 'vitest';
import {mergeJson} from './base.js';
import type {JsonValue} from './base.js';

describe('mergeJson', () => {
  it('merges two objects recursively', () => {
    const a = {foo: 1, bar: {baz: 2}};
    const b = {bar: {qux: 3}, quux: 4};
    expect(mergeJson(a, b)).toEqual({foo: 1, bar: {baz: 2, qux: 3}, quux: 4});
  });

  it('merges arrays by concatenation', () => {
    const a = [1, 2];
    const b = [3, 4];
    expect(mergeJson(a, b)).toEqual([1, 2, 3, 4]);
  });

  it('returns source if target is null or undefined', () => {
    expect(mergeJson(undefined as unknown as JsonValue, 5)).toBe(5);
    expect(mergeJson(null, 5)).toBe(5);
  });

  it('returns source if types mismatch', () => {
    expect(mergeJson({foo: 1}, 2)).toBe(2);
    expect(mergeJson([1, 2], {foo: 3})).toEqual({foo: 3});
  });

  it('merges deeply nested objects', () => {
    const a = {a: {b: {c: 1}}};
    const b = {a: {b: {d: 2}}};
    expect(mergeJson(a, b)).toEqual({a: {b: {c: 1, d: 2}}});
  });
});
