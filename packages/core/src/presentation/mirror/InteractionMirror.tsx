import { Box, keyframes } from '@mui/material';
import { useEffect, useState, type JSX } from 'react';

import { SLIDE_WIDTH } from '../../theme/createSlideTheme.ts';
import { textFieldOverlay, type TextRect } from './caret.ts';
import {
  isTextField,
  resolvePath,
  type InteractionState,
  type InteractionStore,
} from './interactionState.ts';
import { MIRROR_ATTRIBUTES } from './mirrorStylisPlugin.ts';

const blink = keyframes`
  50% {
    opacity: 0;
  }
`;

/** Where to draw the caret and the selection of a text field. */
interface Overlay {
  /** The padding box of the field, in the coordinates of the slide. */
  box: TextRect;
  caret: TextRect | undefined;
  selection: TextRect[];
  caretColor: string;
}

/**
 * Places a {@link TextRect} with absolute positioning, as inline styles, since
 * `sx` would treat sizes of at most 1 as fractions.
 */
function place({ left, top, width, height }: TextRect) {
  return { position: 'absolute', left, top, width, height } as const;
}

function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
}

/** Elements that have a class only because of the mirrored state. */
type AddedClasses = Map<Element, Set<string>>;

/** The element that got a synthetic focus event, if any. */
interface MirroredFocus {
  element: Element | undefined;
}

/** The last press that was mirrored with synthetic mouse events. */
interface MirroredPress {
  id: number | undefined;
  element: Element | undefined;
  released: boolean;
}

/**
 * Presses or releases the mouse button on `element` with a synthetic event,
 * without clicking it, so that components start or stop their effects, like
 * the ripple of Material UI buttons.
 */
function dispatchMouse(
  element: Element,
  type: 'mousedown' | 'mouseup',
  x: number,
  y: number,
) {
  const view = element.ownerDocument.defaultView;
  if (view === null) {
    return;
  }
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(
    new view.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === 'mousedown' ? 1 : 0,
      clientX: rect.left + x * rect.width,
      clientY: rect.top + y * rect.height,
    }),
  );
}

function applyPress(
  frame: HTMLElement,
  press: InteractionState['press'],
  mirrored: MirroredPress,
) {
  if (press === undefined) {
    return;
  }
  if (press.id !== mirrored.id) {
    if (mirrored.element !== undefined && !mirrored.released) {
      dispatchMouse(mirrored.element, 'mouseup', 0.5, 0.5);
    }
    const element = resolvePath(frame, press.path);
    mirrored.id = press.id;
    mirrored.element = element;
    mirrored.released = false;
    if (element !== undefined) {
      dispatchMouse(element, 'mousedown', press.x, press.y);
    }
  }
  if (press.released && !mirrored.released) {
    mirrored.released = true;
    if (mirrored.element !== undefined) {
      dispatchMouse(mirrored.element, 'mouseup', press.x, press.y);
    }
  }
}

/**
 * Tells `element` that it got or lost the focus, without focusing it, which
 * would take the focus away from the presenter, so that components that keep
 * their focus in their state, like the label of a Material UI text field,
 * render as focused.
 */
function dispatchFocus(
  element: Element | undefined,
  type: 'focusin' | 'focusout',
  relatedTarget: Element | undefined,
) {
  const view = element?.ownerDocument.defaultView;
  if (element === undefined || view === null || view === undefined) {
    return;
  }
  element.dispatchEvent(
    new view.FocusEvent(type, {
      bubbles: true,
      relatedTarget: relatedTarget ?? null,
    }),
  );
}

function markAncestors(frame: Element, element: Element, attribute: string) {
  for (
    let current: Element | null = element;
    current !== null && current !== frame;
    current = current.parentElement
  ) {
    current.setAttribute(attribute, '');
  }
}

/**
 * Applies the interaction of the presenter from `store` to the copy of the
 * slide in `frame`, and returns where to draw the caret and the selection.
 */
function apply(
  frame: HTMLElement,
  store: InteractionStore,
  added: AddedClasses,
  mirroredFocus: MirroredFocus,
  mirroredPress: MirroredPress,
): Overlay | undefined {
  const state = store.get();
  applyPress(frame, state.press, mirroredPress);
  for (const attribute of Object.values(MIRROR_ATTRIBUTES)) {
    for (const element of frame.querySelectorAll(`[${attribute}]`)) {
      element.removeAttribute(attribute);
    }
  }
  const hovered =
    state.hover === undefined ? undefined : resolvePath(frame, state.hover);
  if (hovered !== undefined) {
    // Ancestors of the hovered element are hovered, too.
    markAncestors(frame, hovered, MIRROR_ATTRIBUTES.hover);
  }
  const focused =
    state.focus === undefined ? undefined : resolvePath(frame, state.focus);
  if (focused !== mirroredFocus.element) {
    const previous = mirroredFocus.element;
    mirroredFocus.element = focused;
    dispatchFocus(previous, 'focusout', focused);
    dispatchFocus(focused, 'focusin', previous);
  }
  if (focused !== undefined) {
    focused.setAttribute(MIRROR_ATTRIBUTES.focus, '');
    if (state.focusVisible) {
      focused.setAttribute(MIRROR_ATTRIBUTES.focusVisible, '');
    }
    markAncestors(frame, focused, MIRROR_ATTRIBUTES.focusWithin);
  }

  const wanted: AddedClasses = new Map();
  for (const { path, className } of state.classes) {
    const element = resolvePath(frame, path);
    if (element !== undefined) {
      const classes = wanted.get(element) ?? new Set();
      classes.add(className);
      wanted.set(element, classes);
    }
  }
  for (const [element, classes] of added) {
    for (const className of classes) {
      if (wanted.get(element)?.has(className) !== true) {
        element.classList.remove(className);
      }
    }
  }
  added.clear();
  for (const [element, classes] of wanted) {
    const missing = [...classes].filter(
      (className) => !element.classList.contains(className),
    );
    element.classList.add(...missing);
    added.set(element, new Set(missing));
  }

  const { input } = state;
  const field =
    input === undefined ? undefined : resolvePath(frame, input.path);
  if (input === undefined || !isTextField(field)) {
    return undefined;
  }
  // Uncontrolled fields only have the text in the view of the presenter.
  if (field.value !== input.value) {
    field.value = input.value;
  }
  field.scrollLeft = input.scrollLeft;
  field.scrollTop = input.scrollTop;
  const style = field.ownerDocument.defaultView?.getComputedStyle(field);
  const frameRect = frame.getBoundingClientRect();
  const rect = field.getBoundingClientRect();
  if (style === undefined || frameRect.width === 0) {
    return undefined;
  }
  // The frame is scaled to fit the window.
  const scale = frameRect.width / SLIDE_WIDTH;
  const { caret, selection } = textFieldOverlay(
    field,
    input.selectionStart,
    input.selectionEnd,
    input.backward,
  );
  return {
    box: {
      left: (rect.left - frameRect.left) / scale + px(style.borderLeftWidth),
      top: (rect.top - frameRect.top) / scale + px(style.borderTopWidth),
      width: field.clientWidth,
      height: field.clientHeight,
    },
    caret,
    selection,
    caretColor: style.caretColor === 'auto' ? style.color : style.caretColor,
  };
}

export interface InteractionMirrorProps {
  store: InteractionStore;
  /** The frame of the slide to show the interaction in. */
  frame: HTMLElement | null;
}

/**
 * Shows how the presenter interacts with the slide in its copy for the
 * audience: marks the hovered and focused elements, so that their styles
 * apply (see {@link mirrorStylisPlugin}), and draws the caret and the
 * selection of the focused text field, which browsers only draw in the
 * focused window.
 *
 * Components that keep their focus in their state, like Material UI text
 * fields, get synthetic `focusin` and `focusout` events, and presses of the
 * mouse button are mirrored with synthetic `mousedown` and `mouseup` events,
 * which start and stop the ripple of Material UI buttons. Clicks aren't
 * mirrored, but the `onFocus`, `onBlur`, `onMouseDown`, and `onMouseUp`
 * handlers of the slide also run in its copy for the audience.
 * Classes that Material UI only sets on real focus, like `Mui-focusVisible`,
 * are copied.
 *
 * Should be rendered in `frame`, after the slide.
 */
export function InteractionMirror({
  store,
  frame,
}: InteractionMirrorProps): JSX.Element | null {
  const [overlay, setOverlay] = useState<Overlay>();
  useEffect(() => {
    if (frame === null) {
      return undefined;
    }
    const added: AddedClasses = new Map();
    const mirroredFocus: MirroredFocus = { element: undefined };
    const mirroredPress: MirroredPress = {
      id: undefined,
      element: undefined,
      released: true,
    };
    let serialized = '';
    let request: number | undefined;
    const observer = new MutationObserver(() => {
      schedule();
    });
    const observe = () => {
      // React may replace the classes when it renders the slide again.
      observer.observe(frame, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    };
    const update = () => {
      request = undefined;
      // Don't react to our own changes.
      observer.disconnect();
      const newOverlay = apply(
        frame,
        store,
        added,
        mirroredFocus,
        mirroredPress,
      );
      observe();
      const newSerialized = JSON.stringify(newOverlay ?? null);
      if (newSerialized !== serialized) {
        serialized = newSerialized;
        setOverlay(newOverlay);
      }
    };
    function schedule() {
      request ??= requestAnimationFrame(update);
    }
    observe();
    schedule();
    const unsubscribe = store.subscribe(schedule);
    return () => {
      unsubscribe();
      observer.disconnect();
      dispatchFocus(mirroredFocus.element, 'focusout', undefined);
      if (mirroredPress.element !== undefined && !mirroredPress.released) {
        dispatchMouse(mirroredPress.element, 'mouseup', 0.5, 0.5);
      }
      if (request !== undefined) {
        cancelAnimationFrame(request);
      }
    };
  }, [frame, store]);

  if (overlay === undefined) {
    return null;
  }
  const { box, caret, selection, caretColor } = overlay;
  return (
    <Box
      aria-hidden
      data-mirror-overlay=""
      sx={{ overflow: 'hidden', pointerEvents: 'none' }}
      style={place(box)}
    >
      {selection.map((rect) => (
        <Box
          key={`${String(rect.left)},${String(rect.top)}`}
          data-mirror-selection=""
          sx={{ bgcolor: 'primary.main', opacity: 0.3 }}
          style={place(rect)}
        />
      ))}
      {caret !== undefined && (
        <Box
          // Restart blinking when the caret moves, like browsers do.
          key={`${String(caret.left)},${String(caret.top)}`}
          data-mirror-caret=""
          style={place(caret)}
          sx={{
            bgcolor: caretColor,
            animation: `${blink} 1s step-end infinite`,
          }}
        />
      )}
    </Box>
  );
}
