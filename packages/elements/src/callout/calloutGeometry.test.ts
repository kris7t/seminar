import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@seminar/core';
import { describe, expect, it } from 'vitest';

import {
  CALLOUT_SLIDE_MARGIN,
  calloutBounds,
  calloutGeometry,
  calloutPlacementAt,
  calloutStemOffsetAt,
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

  it.each([
    [200, 200],
    [900, 500],
    [SLIDE_WIDTH / 2 - 0.01, SLIDE_HEIGHT / 2 - 0.01],
    [SLIDE_WIDTH / 2 + 0.01, SLIDE_HEIGHT / 2 + 0.01],
  ])(
    'keeps the default direction and attachment at (%f, %f)',
    (anchorX, anchorY) => {
      const geometry = calloutGeometry({ ...BASE, anchorX, anchorY });
      const preferred = calloutGeometry(BASE);
      expect(geometry.angle).toBe(110);
      expect(geometry.x).toBeCloseTo(preferred.x);
      expect(geometry.y).toBeCloseTo(preferred.y);
      expect(geometry.path).toContain('H 110 L');
    },
  );

  it.each([
    [1050, 360, 70, 'H 230 L'],
    [640, 150, -110, 'H 70 L'],
    [1050, 150, -70, 'H 190 L'],
  ])(
    'flips only the overflowing axes at (%i, %i)',
    (anchorX, anchorY, angle, attachment) => {
      const geometry = calloutGeometry({ ...BASE, anchorX, anchorY });
      expect(geometry.angle).toBe(angle);
      expect(geometry.path).toContain(attachment);
      expect(anchorX + geometry.x).toBeGreaterThanOrEqual(CALLOUT_SLIDE_MARGIN);
      expect(anchorY + geometry.y).toBeGreaterThanOrEqual(CALLOUT_SLIDE_MARGIN);
      expect(anchorX + geometry.x + geometry.width).toBeLessThanOrEqual(
        SLIDE_WIDTH - CALLOUT_SLIDE_MARGIN,
      );
      expect(anchorY + geometry.y + geometry.height).toBeLessThanOrEqual(
        SLIDE_HEIGHT - CALLOUT_SLIDE_MARGIN,
      );
    },
  );

  it('flips horizontally only when the body crosses the right slide margin', () => {
    const preferred = calloutGeometry(BASE);
    const anchorX =
      SLIDE_WIDTH - CALLOUT_SLIDE_MARGIN - preferred.width - preferred.x;
    expect(calloutGeometry({ ...BASE, anchorX: anchorX - 0.01 }).angle).toBe(
      110,
    );
    expect(calloutGeometry({ ...BASE, anchorX: anchorX + 0.01 }).angle).toBe(
      70,
    );
  });

  it('flips vertically only when the body crosses the top slide margin', () => {
    const preferred = calloutGeometry(BASE);
    const anchorY = CALLOUT_SLIDE_MARGIN - preferred.y;
    expect(calloutGeometry({ ...BASE, anchorY: anchorY + 0.01 }).angle).toBe(
      110,
    );
    expect(calloutGeometry({ ...BASE, anchorY: anchorY - 0.01 }).angle).toBe(
      -110,
    );
  });

  it('includes the anchor height when deciding whether to flip', () => {
    expect(calloutGeometry({ ...BASE, anchorY: 170 }).angle).toBe(110);
    expect(
      calloutGeometry({ ...BASE, anchorY: 170, anchorHeight: 20 }).angle,
    ).toBe(-110);
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

describe('the tip of the stem', () => {
  const box = { ...BASE, anchorWidth: 200, anchorHeight: 100 };
  const tipOf = (angle: number) => {
    const { x, y, tipX, tipY } = calloutGeometry({ ...box, angle });
    return [x + tipX, y + tipY].map((value) => Math.round(value));
  };

  it('ends where a ray from the anchor towards the body leaves its box', () => {
    // The body is above and to the right, so the stem ends on the top edge.
    expect(tipOf(135)).toEqual([50, -50]);
    // Lower, it ends on the right edge.
    expect(tipOf(170)).toEqual([100, -18]);
    expect(tipOf(-90)).toEqual([0, 50]);
    expect(tipOf(0)).toEqual([-100, 0]);
  });

  it('ends at the top or bottom of a box without a width', () => {
    const character = { ...BASE, anchorHeight: 20 };
    for (const [angle, y] of [
      [30, -10],
      [-150, 10],
    ] as const) {
      const geometry = calloutGeometry({ ...character, angle });
      expect(geometry.x + geometry.tipX).toBeCloseTo(0);
      expect(geometry.y + geometry.tipY).toBeCloseTo(y);
    }
  });
});

describe('calloutPlacementAt', () => {
  /** Where the top left corner of the body is on the slide. */
  const bodyOf = (options: Parameters<typeof calloutGeometry>[0]) => {
    const { x, y } = calloutGeometry(options);
    return [options.anchorX + x, options.anchorY + y] as const;
  };

  it.each([
    [30, 50],
    [110, 36],
    [-120, 80],
    [180, 0],
    [-45 + 1, 20],
  ])(
    'finds angle %i and offset %i where they place the body',
    (angle, offset) => {
      const options = { ...BASE, anchorWidth: 80, anchorHeight: 30 };
      const [x, y] = bodyOf({ ...options, angle, offset });
      expect(calloutPlacementAt(options, x, y)).toEqual({
        angle,
        offset,
      });
    },
  );

  it('keeps the stem offset that is set', () => {
    const options = { ...BASE, angle: 70, offset: 60, stemOffset: 0.9 };
    const [x, y] = bodyOf(options);
    expect(calloutPlacementAt(options, x, y)).toEqual({
      angle: 70,
      offset: 60,
    });
  });

  it('rounds the angle to steps', () => {
    const [x, y] = bodyOf({ ...BASE, angle: 97, offset: 80 });
    expect(calloutPlacementAt(BASE, x, y, 15).angle).toBe(90);
  });
});

describe('calloutStemOffsetAt', () => {
  it('moves the base of the stem along its edge', () => {
    const options = { ...BASE, angle: 90, offset: 200, stemOffset: 0.5 };
    const geometry = calloutGeometry(options);
    expect(calloutStemOffsetAt(options, geometry, 60)).toBe(0.7);
    expect(calloutStemOffsetAt(options, geometry, -31, 0.01)).toBe(0.4);
  });

  it('keeps the stem where it can be attached', () => {
    const options = { ...BASE, angle: 90, offset: 200, stemOffset: 0.5 };
    const geometry = calloutGeometry(options);
    // The inset is the radius and half the stem, 40 of 300.
    expect(calloutStemOffsetAt(options, geometry, 1000)).toBe(0.85);
    expect(calloutStemOffsetAt(options, geometry, -1000)).toBe(0.15);
  });

  it.each([
    [1000, 0.6],
    [-1000, 0.4],
  ])(
    'stops the stem where the body would move, by %i',
    (distance, stemOffset) => {
      // The stem turns from the bottom edge to a side 40 away from the tip.
      const options = { ...BASE, angle: 90, offset: 40, stemOffset: 0.5 };
      const geometry = calloutGeometry(options);
      expect(calloutStemOffsetAt(options, geometry, distance)).toBe(stemOffset);
    },
  );

  it('stops the stem where the body would move, pointing at a box', () => {
    const options = {
      ...BASE,
      anchorWidth: 80,
      anchorHeight: 30,
      angle: 90,
      offset: 40,
      stemOffset: 0.5,
    };
    const geometry = calloutGeometry(options);
    const stemOffset = calloutStemOffsetAt(options, geometry, 1000, 0.01);
    expect(stemOffset).toBeGreaterThan(0.5);
    expect(stemOffset).toBeLessThan(0.85);
    const turned = { ...options, stemOffset };
    const placed = calloutGeometry({
      ...turned,
      ...calloutPlacementAt(
        turned,
        options.anchorX + geometry.x,
        options.anchorY + geometry.y,
      ),
    });
    expect(placed.edge).toBe('bottom');
    // As close as whole degrees and pixels place it.
    expect(
      Math.hypot(placed.x - geometry.x, placed.y - geometry.y),
    ).toBeLessThanOrEqual(1.5);
  });
});
