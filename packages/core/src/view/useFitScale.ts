import { useCallback, useState } from 'react';

import { fitArea, type AreaFit } from './slideFrame.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';

/** Size of an element in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}

const INITIAL_FIT = fitArea({
  left: 0,
  top: 0,
  width: SLIDE_WIDTH,
  height: SLIDE_HEIGHT,
});

/**
 * Computes the scale factor that fits a `width` by `height` box into the
 * element the returned ref is attached to, and returns the size of the
 * element, and where a slide fits into it on whole device pixels.
 */
export function useFitScale(
  width: number,
  height: number,
): [
  ref: (element: HTMLElement | null) => () => void,
  scale: number,
  size: Size,
  areaFit: AreaFit,
] {
  const [fit, setFit] = useState({
    scale: 1,
    size: { width, height },
    areaFit: INITIAL_FIT,
  });
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (element === null) {
        return () => undefined;
      }
      const view = element.ownerDocument.defaultView;
      let last: Size | undefined;
      const measure = (size: Size | undefined = last) => {
        const box = element.getBoundingClientRect();
        last = size;
        const { width: availableWidth, height: availableHeight } = size ?? box;
        setFit({
          scale: Math.min(availableWidth / width, availableHeight / height),
          size: { width: availableWidth, height: availableHeight },
          areaFit: fitArea(
            {
              left: box.left,
              top: box.top,
              width: availableWidth,
              height: availableHeight,
            },
            view?.devicePixelRatio ?? 1,
          ),
        });
      };
      // Observes elements in other windows, too, like the audience window.
      const Observer = view?.ResizeObserver ?? ResizeObserver;
      const observer = new Observer(([entry]) => {
        measure(entry?.contentRect);
      });
      observer.observe(element);
      const onResize = () => {
        measure();
      };
      // Moving the window to another screen may only change the ratio of
      // device pixels.
      view?.addEventListener('resize', onResize);
      return () => {
        observer.disconnect();
        view?.removeEventListener('resize', onResize);
      };
    },
    [width, height],
  );
  return [ref, fit.scale, fit.size, fit.areaFit];
}
