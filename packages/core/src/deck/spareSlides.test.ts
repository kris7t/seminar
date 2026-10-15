import { describe, expect, it } from 'vitest';

import {
  findFirstSlide,
  findLastSlide,
  findNextSlide,
  findPreviousSlide,
} from './spareSlides.ts';

// Slides 0 and 3 are spare, and so are 5 and 6 at the end.
const SPARES = [true, false, false, true, false, true, true];

describe('spare slides', () => {
  it('skips spare slides from slides that are not spare', () => {
    expect(findNextSlide(SPARES, 2)).toBe(4);
    expect(findPreviousSlide(SPARES, 4)).toBe(2);
    expect(findNextSlide(SPARES, 4)).toBeUndefined();
    expect(findPreviousSlide(SPARES, 1)).toBeUndefined();
  });

  it('goes to adjacent slides from spare slides', () => {
    expect(findNextSlide(SPARES, 3)).toBe(4);
    expect(findPreviousSlide(SPARES, 3)).toBe(2);
    expect(findNextSlide(SPARES, 5)).toBe(6);
    expect(findPreviousSlide(SPARES, 6)).toBe(5);
    expect(findNextSlide(SPARES, 6)).toBeUndefined();
  });

  it('finds the first and last slides that are not spare', () => {
    expect(findFirstSlide(SPARES)).toBe(1);
    expect(findLastSlide(SPARES)).toBe(4);
    expect(findFirstSlide([true, true])).toBe(0);
    expect(findLastSlide([true, true])).toBe(1);
    expect(findLastSlide([])).toBe(0);
  });
});
