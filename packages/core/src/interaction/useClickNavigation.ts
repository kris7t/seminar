import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type MouseEventHandler,
} from 'react';

import type { SlideTransitions } from '../transitions/SlideTransitions.ts';
import { getInteraction, isSelectable } from './interaction.ts';

/** How far the mouse may move between press and release of a click. */
const CLICK_SLOP = 5;

/**
 * Fraction of the width of the slide from its left edge where taps go to the
 * previous step.
 */
const BACK_ZONE = 0.25;

/** Whether `x` is in the {@link BACK_ZONE} of `slide`, or left of it. */
function inBackZone(slide: Element, x: number): boolean {
  const { left, width } = slide.getBoundingClientRect();
  return x < left + width * BACK_ZONE;
}

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
  /**
   * Whether the slide was fading, which hides the element under the press
   * from the browser.
   */
  duringTransition: boolean;
}

/**
 * Returns a click handler that goes to the next step on click, and to the
 * previous step on Shift+click. On touch screens, taps on the left edge of
 * `slide` (see {@link BACK_ZONE}), or left of it, go to the previous step
 * instead.
 *
 * If an element on the slide was focused or some text was selected, a click
 * dismisses them instead.
 *
 * Clicks on interactive elements, such as links, buttons, form controls, and
 * elements with the `data-seminar-interactive` attribute, are ignored (see
 * {@link getInteraction}), and so are clicks on selectable text (see
 * {@link isSelectable}), and so are clicks that started on them, or that
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
  transitions?: SlideTransitions,
  slide: Element | null = null,
): MouseEventHandler<HTMLElement> {
  const pressRef = useRef<Press>(undefined);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const duringTransition = transitions?.running === true;
      // Show the slide as it is now, so that the click reaches it.
      if (duringTransition) {
        transitions.skip();
      }
      if (event.button === 0) {
        pressRef.current = {
          x: event.clientX,
          y: event.clientY,
          interactive:
            getInteraction(event.target) !== undefined ||
            isSelectable(event.target) ||
            isSelectable(event.target),
          touch: event.pointerType === 'touch',
          focused:
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
              ? document.activeElement
              : undefined,
          selected: hasSelection(),
          duringTransition,
        };
      }
    };
    // A press during a transition went to the transition rather than to the
    // element under it, and so does the click, which is sent again to that
    // element instead.
    const onClick = (event: globalThis.MouseEvent) => {
      const press = pressRef.current;
      const { target } = event;
      if (
        press?.duringTransition !== true ||
        !event.isTrusted ||
        !(target instanceof Node)
      ) {
        return;
      }
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (element === null || element === target || !target.contains(element)) {
        return;
      }
      event.stopPropagation();
      pressRef.current = {
        ...press,
        interactive:
          getInteraction(element) !== undefined || isSelectable(element),
        duringTransition: false,
      };
      element.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: event.detail,
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY,
          button: event.button,
          buttons: event.buttons,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        }),
      );
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('click', onClick, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, {
        capture: true,
      });
      window.removeEventListener('click', onClick, { capture: true });
    };
  }, [transitions]);
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
      if (
        event.shiftKey ||
        (press?.touch === true &&
          slide !== null &&
          inBackZone(slide, event.clientX))
      ) {
        previous();
      } else {
        next();
      }
    },
    [next, previous, slide],
  );
}
