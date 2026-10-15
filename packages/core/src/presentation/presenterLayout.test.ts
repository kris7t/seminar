import { describe, expect, it } from 'vitest';

import {
  choosePresenterLayout,
  fitsTwoPreviews,
  previewSize,
} from './presenterLayout.ts';

describe('choosePresenterLayout', () => {
  it('puts the panel next to the slide in wide areas', () => {
    expect(choosePresenterLayout({ width: 1280, height: 720 })).toBe('side');
  });

  it('stacks the slide above the panel in tall areas', () => {
    expect(choosePresenterLayout({ width: 1000, height: 900 })).toBe('stacked');
  });

  it('prefers a larger preview next to the slide to a stacked one', () => {
    // A stacked panel would only be 180px tall.
    expect(choosePresenterLayout({ width: 1280, height: 900 })).toBe('side');
  });
});

describe('previewSize', () => {
  it('fills the width next to the slide', () => {
    expect(previewSize('side', { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 225,
    });
  });

  it('fills the height below the slide, except for the heading', () => {
    expect(previewSize('stacked', { width: 1000, height: 257 })).toEqual({
      width: 400,
      height: 225,
    });
  });
});

describe('fitsTwoPreviews', () => {
  it('needs space for the notes', () => {
    expect(fitsTwoPreviews('side', { width: 400, height: 900 })).toBe(true);
    expect(fitsTwoPreviews('side', { width: 400, height: 600 })).toBe(false);
    expect(fitsTwoPreviews('stacked', { width: 1200, height: 257 })).toBe(true);
    expect(fitsTwoPreviews('stacked', { width: 1000, height: 257 })).toBe(
      false,
    );
  });
});
