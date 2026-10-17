import { describe, expect, it } from 'vitest';

import { fitArea } from './slideFrame.ts';

describe('fitArea', () => {
  it('fits the slide into the middle of the area', () => {
    const { area, slide } = fitArea({
      left: 0,
      top: 0,
      width: 1280,
      height: 800,
    });
    // Rounding may leave -0.
    expect(Math.abs(area.left)).toBe(0);
    expect(Math.abs(area.top)).toBe(0);
    expect(area).toMatchObject({ width: 1280, height: 800 });
    expect(slide).toEqual({
      left: 0,
      top: 40,
      width: 1280,
      height: 720,
      scale: 1,
    });
  });

  it('keeps the area and the slide on whole device pixels', () => {
    const { area, slide } = fitArea(
      { left: 10.3, top: 0, width: 731.5, height: 457.25 },
      1.25,
    );
    for (const value of [
      area.left + 10.3,
      area.width,
      area.height,
      slide.left,
      slide.top,
      slide.width,
      slide.height,
    ]) {
      expect(Math.abs(value * 1.25 - Math.round(value * 1.25))).toBeLessThan(
        1e-9,
      );
    }
    // Inside of the area.
    expect(area.left).toBeGreaterThanOrEqual(0);
    expect(area.left + area.width).toBeLessThanOrEqual(731.5);
    expect(area.height).toBeLessThanOrEqual(457.25);
    expect(slide.left * 2 + slide.width).toBeLessThanOrEqual(area.width);
    expect(slide.top * 2 + slide.height).toBeLessThanOrEqual(area.height);
    // The slide covers its box, cutting off less than a device pixel.
    expect(1280 * slide.scale).toBeGreaterThanOrEqual(slide.width - 1e-9);
    expect(720 * slide.scale).toBeGreaterThanOrEqual(slide.height - 1e-9);
    expect(1280 * slide.scale - slide.width).toBeLessThan(1 / 1.25);
    expect(720 * slide.scale - slide.height).toBeLessThan(1 / 1.25);
  });
});
