import type { CSSProperties } from 'react';
import type { SxProps, Theme } from '@mui/material';

import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';

/**
 * Styles of a slide in the middle of the area of the slides, which should be
 * scaled with a `transform` to fit.
 */
export const SLIDE_FRAME_STYLES: SxProps<Theme> = {
  position: 'absolute',
  left: `calc(50% - ${String(SLIDE_WIDTH / 2)}px)`,
  top: `calc(50% - ${String(SLIDE_HEIGHT / 2)}px)`,
  width: SLIDE_WIDTH,
  height: SLIDE_HEIGHT,
  overflow: 'hidden',
  bgcolor: 'background.default',
  color: 'text.primary',
};

/** A box in CSS pixels. */
export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A box of a slide in CSS pixels, and the scale of the slide that covers it. */
export interface SlideFit extends PixelBox {
  scale: number;
}

/** Where slides are shown in an area, see {@link fitArea}. */
export interface AreaFit {
  /**
   * The whole device pixels inside of the area, from its top left corner,
   * which should contain the slides and be the scope of their transitions.
   */
  area: PixelBox;
  /** Box of the slide in the middle of `area`, from its top left corner. */
  slide: SlideFit;
}

// Tolerates rounding errors in the sizes of the area.
const EPSILON = 1e-3;

/**
 * Fits a slide into the middle of an area, given by its box in the viewport,
 * so that the slide and the scope of its transitions are on whole device
 * pixels. Otherwise, browsers blend their edges with the background, but
 * draw the snapshots of view transitions on whole pixels, and stretch them
 * back, so that the slide moves by a fraction of a pixel, or shows a thin
 * line at its edges, while it fades.
 */
export function fitArea(box: PixelBox, pixelRatio = 1): AreaFit {
  const left = Math.ceil(box.left * pixelRatio - EPSILON);
  const top = Math.ceil(box.top * pixelRatio - EPSILON);
  const areaWidth = Math.max(
    Math.floor((box.left + box.width) * pixelRatio + EPSILON) - left,
    0,
  );
  const areaHeight = Math.max(
    Math.floor((box.top + box.height) * pixelRatio + EPSILON) - top,
    0,
  );
  const fitScale = Math.min(areaWidth / SLIDE_WIDTH, areaHeight / SLIDE_HEIGHT);
  const width = Math.min(
    Math.floor(SLIDE_WIDTH * fitScale + EPSILON),
    areaWidth,
  );
  const height = Math.min(
    Math.floor(SLIDE_HEIGHT * fitScale + EPSILON),
    areaHeight,
  );
  return {
    area: {
      left: left / pixelRatio - box.left,
      top: top / pixelRatio - box.top,
      width: areaWidth / pixelRatio,
      height: areaHeight / pixelRatio,
    },
    slide: {
      left: Math.floor((areaWidth - width) / 2) / pixelRatio,
      top: Math.floor((areaHeight - height) / 2) / pixelRatio,
      width: width / pixelRatio,
      height: height / pixelRatio,
      // Covers the box, which cuts off less than a device pixel of the slide.
      scale: Math.max(width / SLIDE_WIDTH, height / SLIDE_HEIGHT) / pixelRatio,
    },
  };
}

/**
 * Styles that place an element at a box, from the top left corner of its
 * parent, e.g., the area or the slide of an {@link AreaFit}. The box of a
 * slide contains the frame of the slide with
 * {@link FITTED_SLIDE_FRAME_STYLES}.
 */
export function pixelBoxStyles({
  left,
  top,
  width,
  height,
}: PixelBox): CSSProperties {
  return { position: 'absolute', left, top, width, height, overflow: 'hidden' };
}

/**
 * Whether slides are scaled with `zoom` rather than a `transform`, see
 * {@link slideScaleStyles}.
 */
function scalesWithZoom(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const { userAgent } = navigator;
  // Other browsers mention WebKit in their user agents, too.
  return (
    userAgent.includes('AppleWebKit/') &&
    !/(?:Chrome|Chromium|Edg)\//u.test(userAgent)
  );
}

/**
 * Styles that scale a slide frame with {@link FITTED_SLIDE_FRAME_STYLES} to
 * `scale`.
 *
 * Slides are scaled with a `transform`, which lays them out at their size in
 * logical pixels at any scale. WebKit, however, draws a transformed slide
 * from a texture of its unscaled size whenever it's composited, e.g., while
 * an element in it is focused, so that the slide blurs. There, slides are
 * scaled with `zoom` instead, which keeps them sharp, but lays out text at
 * the scaled size of its font, so that lines may break a little differently
 * at different scales. Both keep the boxes of elements on screen, e.g., from
 * `getBoundingClientRect`, scaled, and their sizes in CSS, e.g., from
 * `offsetWidth`, in logical pixels.
 */
export function slideScaleStyles(scale: number): CSSProperties {
  return scalesWithZoom()
    ? { zoom: scale }
    : { transform: `scale(${String(scale)})` };
}

/**
 * Styles of a slide in its box of an {@link AreaFit}, which should be scaled
 * to the scale of the fit with {@link slideScaleStyles}.
 */
export const FITTED_SLIDE_FRAME_STYLES: SxProps<Theme> = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: SLIDE_WIDTH,
  height: SLIDE_HEIGHT,
  overflow: 'hidden',
  transformOrigin: '0 0',
  bgcolor: 'background.default',
  color: 'text.primary',
};
