import { describe, expect, it } from 'vitest';

import { StructuralKeys } from './StructuralKeys.ts';

describe('StructuralKeys', () => {
  it('encodes plain objects and arrays structurally', () => {
    const keys = new StructuralKeys();
    expect(keys.of({ a: 1, b: [2, 'c'] })).toBe(keys.of({ b: [2, 'c'], a: 1 }));
    expect(keys.of([1, 2])).not.toBe(keys.of([2, 1]));
    expect(keys.of('1')).not.toBe(keys.of(1));
    expect(keys.of(0)).not.toBe(keys.of(-0));
    expect(keys.of(undefined)).not.toBe(keys.of(null));
  });

  it('encodes other objects, functions, and symbols by identity', () => {
    const keys = new StructuralKeys();
    const date = new Date(0);
    const symbol = Symbol('a');
    expect(keys.of(date)).toBe(keys.of(date));
    expect(keys.of(date)).not.toBe(keys.of(new Date(0)));
    expect(keys.of(symbol)).toBe(keys.of(symbol));
    expect(keys.of(symbol)).not.toBe(keys.of(Symbol('a')));
    expect(keys.of(() => 0)).not.toBe(keys.of(() => 0));
  });

  it('rejects cyclic values', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => new StructuralKeys().of(cyclic)).toThrow(TypeError);
  });
});
