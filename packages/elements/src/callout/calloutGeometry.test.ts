import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@slider/core';
import { describe, expect, it } from 'vitest';

import {
  CALLOUT_SLIDE_MARGIN,
  calloutBounds,
  calloutGeometry,
} from './calloutGeometry.ts';

const BASE = {
  anchorX: SLIDE_WIDTH / 2,
  anchorY: SLIDE_HEIGHT / 2,
  width: 300,
  height: 100,
  radius: 20,
  stemSize: 40,
};

describe('calloutGeometry', () => {
  it('places a callout above its anchor with an off-center stem by default', () => {
    const geometry = calloutGeometry(BASE);
    expect(geometry).toMatchObject({ width: 300, height: 100 });
    expect(geometry.angle).toBe(110);
    expect(geometry.x).toBeCloseTo(-76.32);
    expect(geometry.y).toBeCloseTo(-137.59);
    expect(geometry.path).toContain('M 20 0');
    expect(geometry.path).toContain('H 110 L');
    expect(geometry.path).toContain('L 70 100 H 20');
    expect(geometry.path.match(/\bM /g)).toHaveLength(1);
  });

  it('mirrors the automatic stem attachment across the slide', () => {
    expect(calloutGeometry({ ...BASE, anchorX: 200 }).path).toContain(
      'H 110 L',
    );
    expect(
      calloutGeometry({ ...BASE, anchorX: SLIDE_WIDTH - 200 }).path,
    ).toContain('H 230 L');
  });

  it('uses the angle to select an edge and honors both offsets', () => {
    const geometry = calloutGeometry({
      ...BASE,
      angle: 0,
      offset: 20,
      stemOffset: 0.4,
    });
    expect(geometry).toMatchObject({
      x: -320,
      y: -40,
      angle: 0,
    });
    expect(geometry.path).toContain('V 20 L 320 40 L 300 60 V 80');
  });

  it('anchors above and below callouts to the corresponding character edge', () => {
    const above = calloutGeometry({
      ...BASE,
      anchorHeight: 20,
      angle: 110,
    });
    const below = calloutGeometry({
      ...BASE,
      anchorHeight: 20,
      angle: -110,
    });
    expect(above.y).toBeCloseTo(-147.59);
    expect(below.y).toBeCloseTo(47.59);
  });

  it('chooses another edge to keep automatic geometry within the slide', () => {
    const geometry = calloutGeometry({
      ...BASE,
      anchorX: SLIDE_WIDTH / 2,
      anchorY: 20,
    });
    const left = BASE.anchorX + geometry.x;
    const top = 20 + geometry.y;
    expect(geometry.angle).toBe(-110);
    expect(left).toBeGreaterThanOrEqual(CALLOUT_SLIDE_MARGIN);
    expect(top).toBeGreaterThanOrEqual(CALLOUT_SLIDE_MARGIN);
    expect(left + geometry.width).toBeLessThanOrEqual(
      SLIDE_WIDTH - CALLOUT_SLIDE_MARGIN,
    );
    expect(top + geometry.height).toBeLessThanOrEqual(
      SLIDE_HEIGHT - CALLOUT_SLIDE_MARGIN,
    );
  });

  it('does not change explicit geometry to keep the bubble on the slide', () => {
    const geometry = calloutGeometry({
      ...BASE,
      anchorX: 10,
      angle: 90,
      offset: 40,
      stemOffset: 0.5,
    });
    expect(10 + geometry.x).toBe(-140);
    expect(geometry.angle).toBe(90);
    expect(10 + geometry.x).toBeLessThan(CALLOUT_SLIDE_MARGIN);
  });
});

describe('calloutBounds', () => {
  it.each([0, 45, 90, 135, 180, 225, 270, 315])(
    'covers the body and the stem pointing at %i degrees',
    (angle) => {
      const geometry = calloutGeometry({ ...BASE, angle, offset: 50 });
      const bounds = calloutBounds(geometry);
      // The anchor is the tip of the stem.
      const tip = { x: -geometry.x, y: -geometry.y };
      expect([geometry.tipX, geometry.tipY]).toEqual([tip.x, tip.y]);
      expect(bounds.x).toBe(Math.min(0, tip.x));
      expect(bounds.y).toBe(Math.min(0, tip.y));
      expect(bounds.x + bounds.width).toBe(Math.max(BASE.width, tip.x));
      expect(bounds.y + bounds.height).toBe(Math.max(BASE.height, tip.y));
      // The stem sticks out of the body on the side it points to.
      const outside =
        tip.x < 0 || tip.y < 0 || tip.x > BASE.width || tip.y > BASE.height;
      expect(outside).toBe(true);
    },
  );
});
