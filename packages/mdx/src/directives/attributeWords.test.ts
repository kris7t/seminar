import { describe, expect, it } from 'vitest';

import { parseAttributeWords } from './attributeWords.ts';

describe('parseAttributeWords', () => {
  it('reads ids, classes, values, and bare words', () => {
    const { attributes, rest } = parseAttributeWords(
      '#fib .wide .tall step group=impl title="Two words" note=\'x y\'',
    );
    expect(attributes).toEqual({
      id: 'fib',
      classes: ['wide', 'tall'],
      attributes: new Map([
        ['step', ''],
        ['group', 'impl'],
        ['title', 'Two words'],
        ['note', 'x y'],
      ]),
    });
    expect(rest).toBeUndefined();
  });

  it('keeps the other words', () => {
    expect(parseAttributeWords('{1-3 | 5} #a 2x "quoted"')).toEqual({
      attributes: { id: 'a', classes: [], attributes: new Map() },
      rest: '{1-3 | 5} 2x "quoted"',
    });
  });

  it('reads unclosed braces in linear time', () => {
    const text = '{ '.repeat(100_000);
    const start = performance.now();
    expect(parseAttributeWords(text).rest).toBe(text.trim());
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('reads nothing from nothing', () => {
    expect(parseAttributeWords(undefined)).toEqual({
      attributes: { classes: [], attributes: new Map() },
      rest: undefined,
    });
  });
});
