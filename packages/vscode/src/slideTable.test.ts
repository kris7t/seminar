import { describe, expect, it } from 'vitest';

import { shiftTable, slideAtLine, type SlideSource } from './slideTable.ts';

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
          { startLine: 1, endLine: 3, endColumn: 0, text: '' },
        ]),
      ),
    ).toEqual([1, 3, 7]);
  });

  it('moves a slide to the replacement of its start', () => {
    expect(
      lines(
        shiftTable(table, [
          { startLine: 2, endLine: 6, endColumn: 0, text: '' },
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
