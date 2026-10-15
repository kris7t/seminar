import { describe, expect, it } from 'vitest';

import {
  arrangePreviews,
  choosePresenterLayout,
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

  it('limits the width below the slide', () => {
    expect(previewSize('stacked', { width: 1000, height: 800 })).toEqual({
      width: 480,
      height: 270,
    });
  });

  it('fills the height below the slide, except for the heading', () => {
    expect(previewSize('stacked', { width: 1000, height: 257 })).toEqual({
      width: 400,
      height: 225,
    });
  });
});

describe('arrangePreviews', () => {
  it('needs space for the notes', () => {
    expect(arrangePreviews('side', { width: 400, height: 900 }, 2).count).toBe(
      2,
    );
    expect(arrangePreviews('side', { width: 400, height: 600 }, 2).count).toBe(
      1,
    );
    expect(arrangePreviews('stacked', { width: 1200, height: 257 }, 2)).toEqual(
      {
        size: { width: 400, height: 225 },
        count: 2,
        direction: 'row',
        notes: 'beside',
      },
    );
    expect(
      arrangePreviews('stacked', { width: 1000, height: 257 }, 2).count,
    ).toBe(1);
  });

  it('puts previews on top of each other below the slide if tall enough', () => {
    expect(arrangePreviews('stacked', { width: 1000, height: 700 }, 2)).toEqual(
      {
        size: { width: 480, height: 270 },
        count: 2,
        direction: 'column',
        notes: 'beside',
      },
    );
  });

  it('puts the preview above the notes below the slide in narrow areas', () => {
    expect(arrangePreviews('stacked', { width: 368, height: 543 }, 2)).toEqual({
      size: { width: 368, height: 207 },
      count: 1,
      direction: 'column',
      notes: 'below',
    });
  });

  it('puts previews side by side above the notes if nearly as large', () => {
    expect(arrangePreviews('stacked', { width: 768, height: 470 }, 2)).toEqual({
      size: { width: 376, height: 211.5 },
      count: 2,
      direction: 'row',
      notes: 'below',
    });
    // Two previews would be less than half as wide.
    expect(
      arrangePreviews('stacked', { width: 368, height: 543 }, 2).count,
    ).toBe(1);
  });

  it('shrinks the preview next to the notes to leave them enough width', () => {
    expect(arrangePreviews('stacked', { width: 600, height: 300 }, 1)).toEqual({
      size: { width: 264, height: 148.5 },
      count: 1,
      direction: 'column',
      notes: 'beside',
    });
  });

  it('shows no previews if they would be too small', () => {
    expect(
      arrangePreviews('stacked', { width: 400, height: 250 }, 2).count,
    ).toBe(0);
  });

  it('shows no more previews than wanted', () => {
    expect(
      arrangePreviews('stacked', { width: 1200, height: 257 }, 0).count,
    ).toBe(0);
  });
});
