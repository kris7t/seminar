import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLIDE_VIEW_ATTRIBUTE } from './SlideViewContext.ts';
import { parseSlidePoint, useSlideBox, useSlidePoint } from './slideBoxes.ts';

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return DOMRect.fromRect({ x, y, width, height });
}

function Measured() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const box = useSlideBox(target ?? undefined);
  const point = useSlidePoint(target ?? undefined, {
    at: '50%,0',
    shift: '0,-8',
  });
  const slide = useSlidePoint(undefined, { at: '25%,50%' });
  return (
    <div {...{ [SLIDE_VIEW_ATTRIBUTE]: 'audience' }} data-testid="frame">
      <span ref={setTarget} data-testid="target" />
      <output data-testid="box">{JSON.stringify(box)}</output>
      <output data-testid="point">{JSON.stringify(point?.point)}</output>
      <output data-testid="slide">{JSON.stringify(slide?.point)}</output>
    </div>
  );
}

describe('slide boxes', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('measures elements and points in the pixels of the slide', () => {
    // The slide is shown at half its size.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return this.dataset['testid'] === 'frame'
          ? rect(10, 20, 640, 360)
          : rect(110, 70, 200, 100);
      },
    );
    act(() => {
      render(<Measured />);
    });
    expect(JSON.parse(screen.getByTestId('box').textContent)).toEqual({
      x: 200,
      y: 100,
      width: 400,
      height: 200,
    });
    expect(JSON.parse(screen.getByTestId('point').textContent)).toEqual([
      400, 92,
    ]);
    expect(JSON.parse(screen.getByTestId('slide').textContent)).toEqual([
      320, 360,
    ]);
  });

  it('parses points in pixels and percentages', () => {
    expect(parseSlidePoint('120, 40%')).toEqual([
      { value: 120, relative: false },
      { value: 0.4, relative: true },
    ]);
    expect(parseSlidePoint([1, '2'])).toEqual([
      { value: 1, relative: false },
      { value: 2, relative: false },
    ]);
    expect(parseSlidePoint('1,x')).toBeUndefined();
    expect(parseSlidePoint('1')).toBeUndefined();
  });
});
