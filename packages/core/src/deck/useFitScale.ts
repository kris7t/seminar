import { useCallback, useState } from 'react';

/**
 * Computes the scale factor that fits a `width` by `height` box into the
 * element the returned ref is attached to.
 */
export function useFitScale(
  width: number,
  height: number,
): [ref: (element: HTMLElement | null) => () => void, scale: number] {
  const [scale, setScale] = useState(1);
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (element === null) {
        return () => undefined;
      }
      const observer = new ResizeObserver(([entry]) => {
        if (entry !== undefined) {
          const { width: availableWidth, height: availableHeight } =
            entry.contentRect;
          setScale(Math.min(availableWidth / width, availableHeight / height));
        }
      });
      observer.observe(element);
      return () => {
        observer.disconnect();
      };
    },
    [width, height],
  );
  return [ref, scale];
}
