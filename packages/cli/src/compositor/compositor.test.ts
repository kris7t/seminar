import { describe, expect, it } from 'vitest';

import { outputAt } from './compositor.ts';

describe('outputAt', () => {
  it('finds the output with the middle of the area', () => {
    const outputs = [
      { name: 'eDP-1', x: 0, y: 0, width: 1920, height: 1200 },
      { name: 'HDMI-A-1', x: 1920, y: 0, width: 1280, height: 720 },
    ];
    expect(
      outputAt(outputs, { left: 1800, top: 0, width: 400, height: 100 })?.name,
    ).toBe('HDMI-A-1');
    expect(
      outputAt(outputs, { left: 0, top: 2000, width: 100, height: 100 }),
    ).toBeUndefined();
  });
});
