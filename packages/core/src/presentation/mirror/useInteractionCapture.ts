import { useEffect } from 'react';

import type { SlideTransitions } from '../../transitions/SlideTransitions.ts';
import {
  isTextField,
  MIRRORED_CLASSES,
  NO_INTERACTION,
  pathOf,
  positionOf,
  type InteractionState,
  type InteractionStore,
  type SelectionState,
} from './interactionState.ts';

/** Events after which the interaction may have changed. */
const EVENTS = [
  'pointerover',
  'pointerout',
  'pointerdown',
  'pointerup',
  'focusin',
  'focusout',
  'keydown',
  'keyup',
  'input',
  'select',
  'scroll',
] as const;

/** Captures the text selected on the slide in `frame`, if any. */
function captureSelection(frame: Element): SelectionState | undefined {
  const selection = frame.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return undefined;
  }
  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return undefined;
  }
  const start = positionOf(frame, range.startContainer, range.startOffset);
  const end = positionOf(frame, range.endContainer, range.endOffset);
  return start === undefined || end === undefined ? undefined : { start, end };
}

function capture(
  frame: Element,
  press: InteractionState['press'],
): InteractionState {
  const hovered = frame.querySelectorAll(':hover');
  const innermost = hovered[hovered.length - 1];
  const active = frame.ownerDocument.activeElement;
  const focused =
    active !== null && active !== frame && frame.contains(active)
      ? active
      : undefined;
  const focusPath = focused === undefined ? undefined : pathOf(frame, focused);
  const classes = [
    ...frame.querySelectorAll(
      MIRRORED_CLASSES.map((name) => `.${name}`).join(', '),
    ),
  ].flatMap((element) => {
    const path = pathOf(frame, element);
    return path === undefined
      ? []
      : MIRRORED_CLASSES.filter((name) => element.classList.contains(name)).map(
          (className) => ({ path, className }),
        );
  });
  return {
    hover: innermost === undefined ? undefined : pathOf(frame, innermost),
    focus: focusPath,
    focusVisible: focused?.matches(':focus-visible') ?? false,
    classes,
    input:
      focusPath !== undefined && isTextField(focused)
        ? {
            path: focusPath,
            value: focused.value,
            selectionStart: focused.selectionStart ?? 0,
            selectionEnd: focused.selectionEnd ?? 0,
            backward: focused.selectionDirection === 'backward',
            scrollLeft: focused.scrollLeft,
            scrollTop: focused.scrollTop,
          }
        : undefined,
    // Text fields have a selection of their own.
    selection: isTextField(focused) ? undefined : captureSelection(frame),
    press,
  };
}

/**
 * Captures how the presenter interacts with the slide in `frame`, like what is
 * hovered or focused, into `store`, to show it to the audience.
 *
 * Captures again at most once per frame after events that may change it, and
 * when Material UI changes the classes of the elements, e.g., after focus.
 * Presses of the mouse button are captured right away.
 */
export function useInteractionCapture(
  frame: HTMLElement | null,
  store: InteractionStore,
  transitions?: SlideTransitions,
): void {
  useEffect(() => {
    if (frame === null) {
      return undefined;
    }
    const doc = frame.ownerDocument;
    let request: number | undefined;
    const schedule = () => {
      request ??= requestAnimationFrame(() => {
        request = undefined;
        // While the slide fades, the browser doesn't know what's hovered, so
        // the audience keeps seeing what was, until the transition ends.
        if (transitions?.running !== true) {
          store.set(capture(frame, store.get().press));
        }
      });
    };
    const unsubscribe = transitions?.subscribe(schedule);
    for (const event of EVENTS) {
      frame.addEventListener(event, schedule, { capture: true });
    }
    frame.addEventListener('pointerleave', schedule);
    // Presses are events rather than state, so they are sent right away, in
    // case a click starts and ends between frames.
    let pressId = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        event.pointerType === 'touch' ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const path = pathOf(frame, event.target);
      if (path === undefined) {
        return;
      }
      const rect = event.target.getBoundingClientRect();
      // Press elements without a size in their middle.
      const fraction = (offset: number, size: number) =>
        size === 0 ? 0.5 : offset / size;
      pressId += 1;
      store.set({
        ...store.get(),
        press: {
          id: pressId,
          path,
          x: fraction(event.clientX - rect.left, rect.width),
          y: fraction(event.clientY - rect.top, rect.height),
          released: false,
        },
      });
    };
    const onPointerUp = () => {
      const { press } = store.get();
      if (press !== undefined && !press.released) {
        store.set({ ...store.get(), press: { ...press, released: true } });
      }
    };
    frame.addEventListener('pointerdown', onPointerDown, { capture: true });
    // The press may end outside of the slide.
    doc.addEventListener('pointerup', onPointerUp, { capture: true });
    doc.addEventListener('pointercancel', onPointerUp, { capture: true });
    doc.addEventListener('selectionchange', schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(frame, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    schedule();
    return () => {
      unsubscribe?.();
      for (const event of EVENTS) {
        frame.removeEventListener(event, schedule, { capture: true });
      }
      frame.removeEventListener('pointerleave', schedule);
      frame.removeEventListener('pointerdown', onPointerDown, {
        capture: true,
      });
      doc.removeEventListener('pointerup', onPointerUp, { capture: true });
      doc.removeEventListener('pointercancel', onPointerUp, {
        capture: true,
      });
      doc.removeEventListener('selectionchange', schedule);
      observer.disconnect();
      if (request !== undefined) {
        cancelAnimationFrame(request);
      }
      store.set(NO_INTERACTION);
    };
  }, [frame, store, transitions]);
}
