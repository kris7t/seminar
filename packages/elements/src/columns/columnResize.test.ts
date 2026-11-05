import { describe, expect, it } from 'vitest';

import { resizeColumns, type ResizedColumn } from './columnResize.ts';

const growing = (width: number, grow?: number): ResizedColumn => ({
  width,
  fixed: undefined,
  grow,
});

const fixed = (width: number, value: number | string): ResizedColumn => ({
  width,
  fixed: value,
  grow: undefined,
});

describe('resizeColumns', () => {
  it('shares the growth of growing columns in the new ratio', () => {
    expect(resizeColumns(growing(400), growing(400), 120, 1000)).toEqual([
      { grow: 1.3 },
      { grow: 0.7 },
    ]);
    expect(resizeColumns(growing(200, 1), growing(400, 2), 100, 1000)).toEqual([
      { grow: 1.5 },
      { grow: 1.5 },
    ]);
  });

  it('removes a growth of 1', () => {
    expect(resizeColumns(growing(400, 2), growing(400, 2), -200, 1000)).toEqual(
      [{ grow: null }, { grow: 3 }],
    );
  });

  it('changes by smaller steps finely', () => {
    expect(resizeColumns(growing(400), growing(400), 13, 1000, true)).toEqual([
      { grow: 1.03 },
      { grow: 0.97 },
    ]);
  });

  it('keeps columns from getting too narrow', () => {
    expect(resizeColumns(growing(400), growing(400), -1000, 1000)).toEqual([
      { grow: 0.1 },
      { grow: 1.9 },
    ]);
  });

  it('changes only the widths of columns with one, in their units', () => {
    expect(resizeColumns(fixed(300, 300), growing(500), 50, 1000)).toEqual([
      { width: 350 },
      {},
    ]);
    expect(resizeColumns(growing(500), fixed(300, '30%'), 50, 1000)).toEqual([
      {},
      { width: '25%' },
    ]);
    expect(
      resizeColumns(fixed(300, '300px'), fixed(300, 300), -50.4, 1000),
    ).toEqual([{ width: 250 }, { width: 350 }]);
  });

  it('changes nothing of columns that are not laid out', () => {
    expect(resizeColumns(growing(0), growing(0), 50, 0)).toEqual([{}, {}]);
  });
});
