import { describe, expect, it } from 'vitest';

import { alignSlides } from './slideAlignment.ts';

describe('alignSlides', () => {
  it('follows slides by their ids', () => {
    expect(alignSlides(['a', 'b', 'c'], ['x', 'a', 'c', 'b'])).toEqual([
      1, 3, 2,
    ]);
  });

  it('removes slides whose ids are gone without room for them', () => {
    expect(alignSlides(['a', 'b', 'c'], ['a', 'c'])).toEqual([0, undefined, 1]);
  });

  it('finds slides whose ids changed by the slides around them', () => {
    expect(alignSlides(['a', 'b', 'c'], ['x', 'a', 'b2', 'c'])).toEqual([
      1, 2, 3,
    ]);
    expect(alignSlides(['a', 'b'], ['x', 'a', 'b2'])).toEqual([1, 2]);
    expect(alignSlides(['a', 'b'], ['a2', 'b'])).toEqual([0, 1]);
  });

  it('finds slides without ids by their position', () => {
    expect(
      alignSlides(
        [undefined, 'a', undefined],
        [undefined, 'x', 'a', undefined],
      ),
    ).toEqual([0, 2, 3]);
    expect(alignSlides([undefined, undefined], [undefined])).toEqual([
      0,
      undefined,
    ]);
  });

  it('does not take slides with known ids for others', () => {
    expect(alignSlides(['a', 'b', 'c'], ['a', 'c', 'b'])).toEqual([0, 2, 1]);
    expect(alignSlides(['a', 'b', 'c'], ['a', 'c'])).toEqual([0, undefined, 1]);
  });
});
