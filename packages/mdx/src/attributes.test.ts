import { describe, expect, it } from 'vitest';

import {
  parseAttributeBlock,
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
    });
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
      { id: 'results', classes: [], attributes: new Map() },
    ]);
  });

  it('ignores text without a valid block', () => {
    expect(splitTrailingAttributeBlock('Sets {a, b}')).toBeUndefined();
    expect(splitTrailingAttributeBlock('No block')).toBeUndefined();
  });
});
