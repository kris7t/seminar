import { describe, expect, it } from 'vitest';

import {
  bareAttributeWords,
  parseAttributeWords,
  readAttributeWords,
} from './attributeWords.ts';

describe('bareAttributeWords', () => {
  it('finds only the bare words, with their offsets', () => {
    expect(
      bareAttributeWords('#id .class only a=b title="in quotes" {1-3} swap'),
    ).toEqual([
      { word: 'only', index: 11 },
      { word: 'swap', index: 44 },
    ]);
  });
});

describe('readAttributeWords', () => {
  it('reads attributes with their offsets', () => {
    const text = '{1-3} #fib .wide step group=impl title="Two words"';
    expect(
      readAttributeWords(text).map(
        ({ name, nameStart, nameEnd, value, valueStart, valueEnd, quoted }) => [
          name,
          text.slice(nameStart, nameEnd),
          value,
          text.slice(valueStart, valueEnd),
          quoted,
        ],
      ),
    ).toEqual([
      ['#', '#', 'fib', 'fib', false],
      ['.', '.', 'wide', 'wide', false],
      ['step', 'step', undefined, '', false],
      ['group', 'group', 'impl', 'impl', false],
      ['title', 'title', 'Two words', '"Two words"', true],
    ]);
  });
});

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
      quoted: new Set(['title', 'note']),
    });
    expect(rest).toBeUndefined();
  });

  it('keeps the other words', () => {
    expect(parseAttributeWords('{1-3 | 5} #a 2x "quoted"')).toEqual({
      attributes: {
        id: 'a',
        classes: [],
        attributes: new Map(),
        quoted: new Set(),
      },
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
      attributes: { classes: [], attributes: new Map(), quoted: new Set() },
      rest: undefined,
    });
  });
});
