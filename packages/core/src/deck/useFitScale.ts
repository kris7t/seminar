import { useCallback, useState } from 'react';

/** Size of an element in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}

/**
 * Computes the scale factor that fits a `width` by `height` box into the
 * element the returned ref is attached to, and returns the size of the
 * element.
 */
export function useFitScale(
  width: number,
  height: number,
): [
  ref: (element: HTMLElement | null) => () => void,
  scale: number,
  size: Size,
] {
  const [fit, setFit] = useState({ scale: 1, size: { width, height } });
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (element === null) {
        return () => undefined;
      }
      const observer = new ResizeObserver(([entry]) => {
        if (entry !== undefined) {
          const { width: availableWidth, height: availableHeight } =
            entry.contentRect;
          setFit({
            scale: Math.min(availableWidth / width, availableHeight / height),
            size: { width: availableWidth, height: availableHeight },
          });
        }
      });
      observer.observe(element);
      return () => {
        observer.disconnect();
      };
    },
    [width, height],
  );
  return [ref, fit.scale, fit.size];
}
