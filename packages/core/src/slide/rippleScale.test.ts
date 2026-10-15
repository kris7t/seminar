import { describe, expect, it, vi } from 'vitest';

import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';
import { correctRipples } from './rippleScale.ts';

describe('correctRipples', () => {
  it('divides the geometry of new ripples by the scale', async () => {
    const frame = document.createElement('div');
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, SLIDE_WIDTH * 2, SLIDE_HEIGHT * 2),
    );
    const stop = correctRipples(frame);
    const ripple = document.createElement('span');
    ripple.className = 'MuiTouchRipple-ripple';
    Object.assign(ripple.style, {
      left: '100px',
      top: '40px',
      width: '60px',
      height: '60px',
    });
    frame.append(ripple);
    // Mutation observers run after the current task.
    await new Promise((resolve) => setTimeout(resolve));
    expect(ripple.style.left).toBe('50px');
    expect(ripple.style.top).toBe('20px');
    expect(ripple.style.width).toBe('30px');
    expect(ripple.style.height).toBe('30px');
    stop();
  });
});
