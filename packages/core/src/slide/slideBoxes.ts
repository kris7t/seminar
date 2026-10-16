import { useLayoutEffect, useState } from 'react';

import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';
import { useSlideElement } from './SlideElements.tsx';
import { SLIDE_VIEW_ATTRIBUTE } from './SlideViewContext.ts';

/** A box in the logical pixels of a slide, from its top left corner. */
export interface SlideBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box of the whole slide. */
export const SLIDE_BOX: SlideBox = {
  x: 0,
  y: 0,
  width: SLIDE_WIDTH,
  height: SLIDE_HEIGHT,
};

/**
 * A point as `x,y` in a box, as an MDX-friendly string, e.g., `120,80` or
 * `62%,40%`, or as a tuple, e.g., `[120, '40%']`. Numbers are logical slide
 * pixels from the top left corner of the box, and percentages are fractions
 * of its size.
 */
export type SlidePoint = string | readonly [number | string, number | string];

/** A coordinate of a {@link SlidePoint}. */
export interface SlideCoordinate {
  value: number;
  /** Whether `value` is a fraction of the size of the box. */
  relative: boolean;
}

function parseCoordinate(
  value: number | string | undefined,
): SlideCoordinate | undefined {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  const relative = text.endsWith('%');
  const number = Number(relative ? text.slice(0, -1) : text);
  if (text === '' || !Number.isFinite(number)) return undefined;
  return { value: relative ? number / 100 : number, relative };
}

/** Parses `value`, or returns `undefined` if it isn't a valid point. */
export function parseSlidePoint(
  value: SlidePoint | undefined,
): [SlideCoordinate, SlideCoordinate] | undefined {
  const parts =
    typeof value === 'string' ? value.trim().split(/[\s,]+/) : value;
  if (parts?.length !== 2) return undefined;
  const x = parseCoordinate(parts[0]);
  const y = parseCoordinate(parts[1]);
  return x === undefined || y === undefined ? undefined : [x, y];
}

/** Returns a parsed point in the logical pixels of the slide. */
export function resolveSlidePoint(
  [x, y]: readonly [SlideCoordinate, SlideCoordinate],
  box: SlideBox,
): [number, number] {
  return [
    box.x + (x.relative ? x.value * box.width : x.value),
    box.y + (y.relative ? y.value * box.height : y.value),
  ];
}

/**
 * Measures `element` in the logical pixels of the slide view it's in, which
 * may be scaled, e.g., in the overview, or `undefined` if it isn't in one.
 */
function measureInSlide(element: Element): SlideBox | undefined {
  const frame = element.closest(`[${SLIDE_VIEW_ATTRIBUTE}]`);
  if (frame === null) return undefined;
  const frameRect = frame.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const scale = frameRect.width / SLIDE_WIDTH || 1;
  return {
    x: (rect.left - frameRect.left) / scale,
    y: (rect.top - frameRect.top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

function sameBox(a: SlideBox, b: SlideBox): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

/**
 * Returns the box of `target` on the slide, in the logical pixels of the
 * slide, whatever the scale of the view the slide is shown in. `target` is an
 * element or the name of an element on the slide (see `useSlideElement`).
 * Measures again when the element or the window is resized.
 *
 * @returns The box, or `undefined` without a target, before it's measured,
 *   or outside of a slide view.
 */
export function useSlideBox(
  target: Element | string | undefined,
): SlideBox | undefined {
  const element = useSlideElement(target);
  const [box, setBox] = useState<SlideBox | undefined>();
  useLayoutEffect(() => {
    const measure = () => {
      const next = element === undefined ? undefined : measureInSlide(element);
      // Measuring the layout before painting is what layout effects are for.
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setBox((previous) =>
        previous !== undefined && next !== undefined && sameBox(previous, next)
          ? previous
          : next,
      );
    };
    measure();
    if (element === undefined) return undefined;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [element]);
  return box;
}

export interface SlidePointOptions {
  /** Point in the box. Defaults to the middle of the box. */
  at?: SlidePoint | undefined;
  /** Offset of the point in logical pixels, e.g., `0,-8`. */
  shift?: SlidePoint | undefined;
}

/** A point on the slide, see {@link useSlidePoint}. */
export interface SlidePointPosition {
  /** The point, i.e., `at` in the box, moved by `shift`. */
  point: [number, number];
  /** The box the point is in. */
  box: SlideBox;
}

const ZERO_BOX: SlideBox = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Returns a point in the box of `target` on the slide (see
 * {@link useSlideBox}), or in the box of the slide without a target, e.g., to
 * point at a part of an image.
 *
 * @returns The point, or `undefined` before the target is measured.
 */
export function useSlidePoint(
  target: Element | string | undefined,
  { at, shift }: SlidePointOptions = {},
): SlidePointPosition | undefined {
  const measured = useSlideBox(target);
  const box = target === undefined ? SLIDE_BOX : measured;
  if (box === undefined) return undefined;
  const point = parseSlidePoint(at);
  const [x, y] =
    point === undefined
      ? [box.x + box.width / 2, box.y + box.height / 2]
      : resolveSlidePoint(point, box);
  const offset = parseSlidePoint(shift);
  const [dx, dy] =
    offset === undefined ? [0, 0] : resolveSlidePoint(offset, ZERO_BOX);
  return { point: [x + dx, y + dy], box };
}
