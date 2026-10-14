import { describe, expect, it } from 'vitest';

import {
  parseAttributeBlock,
  splitLeadingAttributeBlock,
  splitTrailingAttributeBlock,
} from './attributes.ts';

describe('parseAttributeBlock', () => {
  it('parses ids, classes, and key-value pairs', () => {
    expect(
      parseAttributeBlock(
        '#intro .wide master=section title="A title" note=\'x y\'',
      ),
    ).toEqual({
      id: 'intro',
      classes: ['wide'],
      attributes: new Map([
        ['master', 'section'],
        ['title', 'A title'],
        ['note', 'x y'],
      ]),
      flags: [],
    });
  });

  it('parses accepted flags', () => {
    expect(parseAttributeBlock('step .x', new Set(['step']))).toEqual({
      classes: ['x'],
      attributes: new Map(),
      flags: ['step'],
    });
    expect(
      parseAttributeBlock('step other', new Set(['step'])),
    ).toBeUndefined();
  });

  it.each(['#', 'not an attribute', 'key="unterminated', 'a=1 + 2'])(
    'rejects %j',
    (contents) => {
      expect(parseAttributeBlock(contents)).toBeUndefined();
    },
  );
});

describe('splitTrailingAttributeBlock', () => {
  it('splits off a trailing block', () => {
    expect(splitTrailingAttributeBlock('Results {#results}')).toEqual([
      'Results',
      { id: 'results', classes: [], attributes: new Map(), flags: [] },
    ]);
  });

  it('ignores text without a valid block', () => {
    expect(splitTrailingAttributeBlock('Sets {a, b}')).toBeUndefined();
    expect(splitTrailingAttributeBlock('No block')).toBeUndefined();
    expect(splitTrailingAttributeBlock('Set {x}')).toBeUndefined();
  });
});

describe('splitLeadingAttributeBlock', () => {
  it('splits off a leading block', () => {
    expect(
      splitLeadingAttributeBlock('{step} Item', new Set(['step'])),
    ).toEqual([
      { classes: [], attributes: new Map(), flags: ['step'] },
      'Item',
    ]);
  });

  it('ignores text without a valid block', () => {
    expect(splitLeadingAttributeBlock('{a, b} is a set')).toBeUndefined();
    expect(splitLeadingAttributeBlock('Item {#id}')).toBeUndefined();
  });
});
