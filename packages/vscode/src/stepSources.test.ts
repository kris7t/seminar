import { describe, expect, it } from 'vitest';

import type { StepSource } from './sidebarPage.ts';
import {
  hiddenSources,
  sourceOfStep,
  sourcesIn,
  stepOfCursor,
} from './stepSources.ts';

function source(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
  path: number[],
  visible: boolean,
  other: Partial<StepSource> = {},
): StepSource {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
    path,
    last: path.at(-1) ?? 0,
    visible,
    ...other,
  };
}

const at = (line: number, column: number) => ({ line, column });

describe('stepOfCursor', () => {
  it('stays outside of steppers', () => {
    expect(stepOfCursor([source(3, 1, 3, 5, [1], false)], at(1, 1))).toBe(
      undefined,
    );
  });

  it('goes to the step of a stepper that is not visible', () => {
    expect(stepOfCursor([source(3, 1, 3, 5, [1], false)], at(3, 2))).toEqual([
      1,
    ]);
  });

  it('stays on a stepper that is visible', () => {
    expect(stepOfCursor([source(3, 1, 3, 5, [1], true)], at(3, 2))).toBe(
      undefined,
    );
  });

  it('counts the end of a stepper, as the cursor can be after it', () => {
    expect(stepOfCursor([source(3, 1, 3, 5, [1], false)], at(3, 5))).toEqual([
      1,
    ]);
    expect(stepOfCursor([source(3, 1, 3, 5, [1], false)], at(3, 6))).toBe(
      undefined,
    );
  });

  it('tells apart steppers on the same line', () => {
    const sources = [
      source(5, 1, 5, 11, [1], true),
      source(5, 12, 5, 22, [2], false),
    ];
    expect(stepOfCursor(sources, at(5, 3))).toBeUndefined();
    expect(stepOfCursor(sources, at(5, 15))).toEqual([2]);
  });

  it('uses the innermost stepper', () => {
    const sources = [
      source(3, 1, 9, 4, [1], true),
      source(5, 1, 5, 9, [1, 1], false),
    ];
    expect(stepOfCursor(sources, at(5, 2))).toEqual([1, 1]);
    expect(stepOfCursor(sources, at(7, 1))).toBeUndefined();
  });

  it('finds a stepper visible if another one at the same place is', () => {
    const sources = [
      source(3, 1, 3, 5, [1], false),
      source(3, 1, 3, 5, [2], true),
    ];
    expect(stepOfCursor(sources, at(3, 2))).toBeUndefined();
  });
});

describe('stepOfCursor with a single step in a paragraph', () => {
  // A paragraph with only `:step[Far]`, which has the same range.
  const sources = [
    source(15, 1, 15, 16, [3], true),
    source(15, 1, 15, 16, [3, 1], false),
  ];

  it('goes to the step, as the paragraph around it says nothing', () => {
    expect(stepOfCursor(sources, at(15, 3))).toEqual([3, 1]);
  });

  it('fades it', () => {
    expect(hiddenSources(sources)).toHaveLength(2);
  });
});

describe('sourcesIn', () => {
  const inDeck = source(1, 1, 1, 5, [1], true, { file: '/deck' });
  const unknown = source(2, 1, 2, 5, [1], true);
  const other = source(3, 1, 3, 5, [1], true, { file: '/other' });

  it('takes steppers without a file to be in the deck', () => {
    expect(sourcesIn([inDeck, unknown, other], '/deck', '/deck')).toEqual([
      inDeck,
      unknown,
    ]);
    expect(sourcesIn([inDeck, unknown, other], '/other', '/deck')).toEqual([
      other,
    ]);
  });
});

describe('sourceOfStep', () => {
  it('finds the first stepper of the step', () => {
    const later = source(9, 1, 9, 5, [2], true);
    const first = source(5, 1, 5, 5, [2], true);
    expect(sourceOfStep([later, first], [2])).toBe(first);
  });

  it('finds steppers of several steps', () => {
    const several = source(5, 1, 5, 5, [2], true, { last: 4 });
    expect(sourceOfStep([several], [3])).toBe(several);
    expect(sourceOfStep([several], [5])).toBeUndefined();
  });

  it('looks on the level of the step', () => {
    const nested = source(5, 1, 5, 5, [2, 1], true);
    expect(sourceOfStep([nested], [2])).toBeUndefined();
    expect(sourceOfStep([nested], [2, 1])).toBe(nested);
    expect(sourceOfStep([nested], [3, 1])).toBeUndefined();
  });

  it('finds nothing for the start of the slide', () => {
    expect(sourceOfStep([source(1, 1, 1, 5, [1], true)], [])).toBeUndefined();
  });
});

describe('hiddenSources', () => {
  it('only has steppers that are not visible', () => {
    const hidden = source(3, 1, 3, 5, [2], false);
    expect(hiddenSources([source(1, 1, 1, 5, [1], true), hidden])).toEqual([
      hidden,
    ]);
  });

  it('leaves out what something visible is at the same place as', () => {
    expect(
      hiddenSources([
        source(3, 1, 3, 5, [2], false),
        source(3, 1, 3, 5, [1], true),
      ]),
    ).toEqual([]);
  });
});
