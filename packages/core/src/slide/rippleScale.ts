import { SLIDE_WIDTH } from '../theme/createSlideTheme.ts';

/** Class of the ripples of Material UI buttons. */
const RIPPLE_CLASS = 'MuiTouchRipple-ripple';

const GEOMETRY = ['left', 'top', 'width', 'height'] as const;

function unscale(ripple: HTMLElement, scale: number) {
  for (const property of GEOMETRY) {
    const value = Number.parseFloat(ripple.style[property]);
    if (!Number.isNaN(value)) {
      ripple.style[property] = `${String(value / scale)}px`;
    }
  }
}

/**
 * Corrects the ripples of Material UI buttons in a slide `frame` scaled by a
 * `transform`.
 *
 * Ripples are placed and sized by the scaled size of the button on screen,
 * but drawn in the slide, where they are scaled again, so a ripple would
 * start away from where the button was pressed. This divides the geometry of
 * each new ripple by the scale of the frame.
 *
 * @returns A function that stops correcting the ripples.
 */
export function correctRipples(frame: HTMLElement): () => void {
  const observer = new MutationObserver((records) => {
    const scale = frame.getBoundingClientRect().width / SLIDE_WIDTH;
    if (scale === 0 || Math.abs(scale - 1) < 1e-3) {
      return;
    }
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node as Element).classList.contains(RIPPLE_CLASS)
        ) {
          unscale(node as HTMLElement, scale);
        }
      }
    }
  });
  observer.observe(frame, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
  };
}
