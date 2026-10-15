import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type MouseEventHandler,
} from 'react';

import { getInteraction } from './interaction.ts';

/** How far the mouse may move between press and release of a click. */
const CLICK_SLOP = 5;

function hasSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
}

/** Where the last press of the primary button started. */
interface Press {
  x: number;
  y: number;
  /** Whether it started on an interactive element. */
  interactive: boolean;
  /** The element that was focused before the press, if any. */
  focused: HTMLElement | undefined;
  /** Whether some text was selected before the press. */
  selected: boolean;
  /**
   * Whether it was a touch, for which the browser already only sends clicks
   * for taps.
   */
  touch: boolean;
}

/**
 * Returns a click handler that goes to the next step on click, and to the
 * previous step on Shift+click.
 *
 * If an element on the slide was focused or some text was selected, a click
 * dismisses them instead.
 *
 * Clicks on interactive elements, such as links, buttons, form controls, and
 * elements with the `data-slider-interactive` attribute, are ignored (see
 * {@link getInteraction}), and so are clicks that started on them, or that
 * moved too much between press and release to be clicks, e.g., when
 * selecting text in a field by dragging out of it, since the browser sends
 * these to an element that contains both ends. Click handlers can also opt
 * out by calling
 * `event.preventDefault()` or `event.stopPropagation()`, since they run
 * before this one.
 */
export function useClickNavigation(
  next: () => void,
  previous: () => void,
): MouseEventHandler<HTMLElement> {
  const pressRef = useRef<Press>(undefined);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        pressRef.current = {
          x: event.clientX,
          y: event.clientY,
          interactive: getInteraction(event.target) !== undefined,
          touch: event.pointerType === 'touch',
          focused:
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
              ? document.activeElement
              : undefined,
          selected: hasSelection(),
        };
      }
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, {
        capture: true,
      });
    };
  }, []);
  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const press = pressRef.current;
      pressRef.current = undefined;
      if (
        press !== undefined &&
        (press.interactive ||
          (!press.touch &&
            Math.hypot(event.clientX - press.x, event.clientY - press.y) >
              CLICK_SLOP))
      ) {
        return;
      }
      // The first click dismisses what the user was interacting with on the
      // slide, like a focused text field or selected text, as clicking outside
      // of them does elsewhere.
      const focused =
        press?.focused !== undefined &&
        press.focused !== event.currentTarget &&
        event.currentTarget.contains(press.focused)
          ? press.focused
          : undefined;
      if (focused !== undefined || press?.selected === true) {
        focused?.blur();
        window.getSelection()?.removeAllRanges();
        return;
      }
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        getInteraction(event.target) !== undefined ||
        // Don't advance when the user has just selected some text.
        hasSelection()
      ) {
        return;
      }
      if (event.shiftKey) {
        previous();
      } else {
        next();
      }
    },
    [next, previous],
  );
}
