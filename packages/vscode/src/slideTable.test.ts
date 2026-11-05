import { describe, expect, it } from 'vitest';

import {
  shiftRanges,
  shiftTable,
  shiftThrough,
  slideAtLine,
  type SlideSource,
} from './slideTable.ts';

function slide(line: number, id?: string): SlideSource {
  return { id, start: { line, column: 1 } };
}

describe('slideAtLine', () => {
  const table = [slide(1), {}, slide(5), slide(9), slide(9), slide(12)];

  it('finds the last slide starting at the line or above', () => {
    expect(slideAtLine(table, 0)).toBe(0);
    expect(slideAtLine(table, 3)).toBe(0);
    expect(slideAtLine(table, 4)).toBe(2);
    expect(slideAtLine(table, 100)).toBe(5);
  });

  it('finds nothing before the first slide', () => {
    expect(slideAtLine([slide(3)], 0)).toBeUndefined();
  });

  it('keeps the current slide of those starting at the same place', () => {
    expect(slideAtLine(table, 9)).toBe(3);
    expect(slideAtLine(table, 9, 4)).toBe(4);
    expect(slideAtLine(table, 9, 0)).toBe(3);
  });
});

describe('shiftTable', () => {
  const lines = (table: readonly SlideSource[]) =>
    table.map(({ start }) => start?.line);
  const table = [slide(1), slide(5), slide(9)];
  const at = (line: number, text: string, column = 0) => ({
    startLine: line,
    startColumn: column,
    endLine: line,
    endColumn: column,
    text,
  });

  it('moves the slides after added lines', () => {
    expect(lines(shiftTable(table, [at(2, 'a\nb\n')]))).toEqual([1, 7, 11]);
  });

  it('moves a slide when adding lines right before it', () => {
    expect(lines(shiftTable(table, [at(4, '\n')]))).toEqual([1, 6, 10]);
  });

  it('keeps it when typing in its heading', () => {
    expect(lines(shiftTable(table, [at(4, 'a', 3)]))).toEqual([1, 5, 9]);
  });

  it('moves the slides after removed lines', () => {
    expect(
      lines(
        shiftTable(table, [
          { startLine: 1, startColumn: 0, endLine: 3, endColumn: 0, text: '' },
        ]),
      ),
    ).toEqual([1, 3, 7]);
  });

  it('moves a slide to the replacement of its start', () => {
    expect(
      lines(
        shiftTable(table, [
          { startLine: 2, startColumn: 0, endLine: 6, endColumn: 0, text: '' },
        ]),
      ),
    ).toEqual([1, 3, 5]);
  });

  it('applies changes in order', () => {
    expect(lines(shiftTable(table, [at(6, '\n'), at(2, '\n')]))).toEqual([
      1, 6, 11,
    ]);
  });

  it('leaves slides without a place', () => {
    expect(shiftTable([{ id: 'a' }], [at(0, '\n')])).toEqual([{ id: 'a' }]);
  });
});

describe('shiftThrough', () => {
  /** A replacement on a single line, with lines and columns from 0. */
  const on = (line: number, start: number, end: number, text: string) => ({
    startLine: line,
    startColumn: start,
    endLine: line,
    endColumn: end,
    text,
  });
  const second = { line: 5, column: 12 };

  it('moves a position along its line', () => {
    expect(shiftThrough(second, [on(4, 0, 0, 'ab')])).toEqual({
      line: 5,
      column: 14,
    });
    expect(shiftThrough(second, [on(4, 2, 5, '')])).toEqual({
      line: 5,
      column: 9,
    });
  });

  it('keeps positions before the change', () => {
    expect(shiftThrough(second, [on(4, 20, 20, 'a\nb')])).toEqual(second);
    expect(shiftThrough(second, [on(5, 0, 0, '\n')])).toEqual(second);
  });

  it('moves a position onto a new line', () => {
    expect(shiftThrough(second, [on(4, 10, 10, 'x\nyz')])).toEqual({
      line: 6,
      column: 4,
    });
  });

  it('keeps the column on later lines', () => {
    expect(shiftThrough(second, [on(1, 0, 0, 'a\nb\n')])).toEqual({
      line: 7,
      column: 12,
    });
  });

  it('joins lines', () => {
    expect(
      shiftThrough(second, [
        {
          startLine: 3,
          startColumn: 4,
          endLine: 4,
          endColumn: 0,
          text: '',
        },
      ]),
    ).toEqual({ line: 4, column: 16 });
  });

  it('moves positions inside of the change to its start', () => {
    expect(shiftThrough(second, [on(4, 5, 20, 'x')])).toEqual({
      line: 5,
      column: 6,
    });
  });

  it('moves with text added at a position, unless it sticks to the start', () => {
    expect(shiftThrough(second, [on(4, 11, 11, 'ab')])).toEqual({
      line: 5,
      column: 14,
    });
    expect(shiftThrough(second, [on(4, 11, 11, 'ab')], true)).toEqual(second);
    expect(shiftThrough(second, [on(4, 11, 13, 'a')], true)).toEqual(second);
  });

  it('applies changes in order', () => {
    expect(shiftThrough(second, [on(4, 8, 8, 'a'), on(4, 0, 0, 'b')])).toEqual({
      line: 5,
      column: 14,
    });
  });
});

describe('shiftRanges', () => {
  it('moves both ends, and keeps the rest', () => {
    const ranges = [
      {
        start: { line: 5, column: 1 },
        end: { line: 5, column: 9 },
        file: '/deck',
      },
    ];
    expect(
      shiftRanges(ranges, [
        {
          startLine: 4,
          startColumn: 3,
          endLine: 4,
          endColumn: 3,
          text: 'ab',
        },
      ]),
    ).toEqual([
      {
        start: { line: 5, column: 1 },
        end: { line: 5, column: 11 },
        file: '/deck',
      },
    ]);
  });
});
