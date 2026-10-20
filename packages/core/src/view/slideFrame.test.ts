import { afterEach, describe, expect, it, vi } from 'vitest';

import { fitArea, slideScaleStyles } from './slideFrame.ts';

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

  it('separates slides side by side by the margin of one side', () => {
    const { slide, spacing } = fitArea({
      left: 0,
      top: 0,
      width: 1000,
      height: 360,
    });
    expect(slide).toMatchObject({ left: 180, width: 640 });
    expect(spacing).toBe(820);
  });

  it('keeps the next slide out of the area if the margins differ', () => {
    const { area, slide, spacing } = fitArea({
      left: 0,
      top: 0,
      width: 1001,
      height: 360,
    });
    expect(slide).toMatchObject({ left: 180, width: 640 });
    expect(spacing + slide.left).toBe(area.width);
  });

  it('keeps the area and the slide on whole device pixels', () => {
    const { area, slide, spacing } = fitArea(
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
      spacing,
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

describe('slideScaleStyles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const withUserAgent = (userAgent: string) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  };

  it('scales with a transform', () => {
    withUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    );
    expect(slideScaleStyles(1.5)).toEqual({ transform: 'scale(1.5)' });
    withUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
    );
    expect(slideScaleStyles(1.5)).toEqual({ transform: 'scale(1.5)' });
  });

  it('scales with zoom in WebKit', () => {
    withUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15 Epiphany/605.1.15',
    );
    expect(slideScaleStyles(1.5)).toEqual({
      zoom: 1.5,
      '--seminar-zoom': 1.5,
    });
  });
});
