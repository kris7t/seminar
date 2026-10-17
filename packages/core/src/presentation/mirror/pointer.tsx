import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type JSX,
  type PointerEvent,
  type PointerEventHandler,
} from 'react';

import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';

import type { SlideTransitions } from '../../transitions/SlideTransitions.ts';
import type { ComponentTheme } from '../../theme/ComponentTheme.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../../theme/createSlideTheme.ts';
import { isTextField } from './interactionState.ts';

/**
 * Shapes of the mouse cursor that the mirrored pointer can show. Others are
 * shown as the usual arrow.
 */
export type CursorShape =
  | 'default'
  | 'pointer'
  | 'text'
  | 'crosshair'
  | 'grab'
  | 'not-allowed'
  | 'none';

const CURSOR_SHAPES: Readonly<Record<string, CursorShape>> = {
  default: 'default',
  pointer: 'pointer',
  text: 'text',
  'vertical-text': 'text',
  crosshair: 'crosshair',
  grab: 'grab',
  grabbing: 'grab',
  'not-allowed': 'not-allowed',
  'no-drop': 'not-allowed',
  none: 'none',
};

/**
 * Whether the text in `element` can be selected. `auto` takes the value of
 * the parent, but browsers report it as `auto`.
 */
function isSelectable(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  for (
    let current: Element | null = element;
    current !== null && view !== null;
    current = current.parentElement
  ) {
    const value = view.getComputedStyle(current).userSelect;
    if (value === 'none') {
      return false;
    }
    if (value !== '' && value !== 'auto') {
      return true;
    }
  }
  return true;
}

/** Whether the point at `x` and `y` is on the text right in `element`. */
function isOverText(element: Element, x: number, y: number): boolean {
  const range = element.ownerDocument.createRange();
  for (const node of element.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || node.textContent?.trim() === '') {
      continue;
    }
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns the shape of the mouse cursor over `element`, at the point at `x`
 * and `y`, if known, in client coordinates.
 */
export function cursorShape(
  element: Element,
  point?: { x: number; y: number },
): CursorShape {
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  const cursor = style?.cursor ?? 'auto';
  // Custom images come first, followed by a keyword as a fallback.
  const keyword = cursor.split(',').at(-1)?.trim() ?? 'auto';
  if (keyword === 'auto') {
    // Browsers show a caret over text that can be edited or selected, which
    // most text can't be with mouse navigation.
    return isTextField(element) ||
      (element as Partial<HTMLElement>).isContentEditable === true ||
      (point !== undefined &&
        isOverText(element, point.x, point.y) &&
        isSelectable(element))
      ? 'text'
      : 'default';
  }
  return CURSOR_SHAPES[keyword] ?? 'default';
}

/** Position of the pointer on the slide, in the coordinates of the slide. */
export interface PointerPosition {
  x: number;
  y: number;
  /** The shape of the mouse cursor. */
  cursor: CursorShape;
  /** Whether the pointer hasn't moved for {@link POINTER_IDLE_TIMEOUT}. */
  idle: boolean;
}

/** Keeps the position of the pointer of the presenter on the slide. */
export interface PointerStore {
  /** The position, or `undefined` if the pointer isn't on the slide. */
  get: () => PointerPosition | undefined;
  set: (position: PointerPosition | undefined) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPointerStore(): PointerStore {
  let position: PointerPosition | undefined;
  const listeners = new Set<() => void>();
  return {
    get: () => position,
    set: (newPosition) => {
      position = newPosition;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * How the pointer of the presenter is shown to the audience:
 *
 * - `'off'`: not at all.
 * - `'mirror'`: as a mouse cursor, which hides when it doesn't move.
 * - `'laser'`: as a laser pointer, also shown in the presenter view.
 */
export type PointerMode = 'off' | 'mirror' | 'laser';

/**
 * How long the mirrored pointer stays shown without moving, in milliseconds.
 */
export const POINTER_IDLE_TIMEOUT = 3000;

export interface PointerTrackingHandlers {
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerLeave: PointerEventHandler<HTMLElement>;
}

/**
 * Tracks the mouse or pen of the presenter over a scaled slide, whose element
 * gets the returned handlers, in `store`.
 *
 * The pointer is hidden when it leaves the slide. It's marked as idle when it
 * doesn't move for {@link POINTER_IDLE_TIMEOUT}, which hides it in `'mirror'`
 * mode, like the mouse cursor in video players, and changing the mode wakes it
 * up again. Touch is ignored, since it doesn't hover.
 */
export function usePointerTracking(
  store: PointerStore,
  mode: PointerMode,
  transitions?: SlideTransitions,
): PointerTrackingHandlers {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The slide the pointer was last over. */
  const frameRef = useRef<HTMLElement>(undefined);
  /** Starts counting the time until the pointer becomes idle again. */
  const wake = useCallback(() => {
    clearTimeout(timeoutRef.current);
    const position = store.get();
    if (position === undefined) {
      return;
    }
    if (position.idle) {
      store.set({ ...position, idle: false });
    }
    timeoutRef.current = setTimeout(() => {
      const current = store.get();
      if (current !== undefined) {
        store.set({ ...current, idle: true });
      }
    }, POINTER_IDLE_TIMEOUT);
  }, [store]);
  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    store.set(undefined);
  }, [store]);
  useEffect(() => hide, [hide]);
  // The position is tracked in every mode, so that the pointer shows up right
  // away when the mode changes, as if it had just moved.
  useEffect(() => {
    wake();
  }, [wake, mode]);
  /**
   * Moves the pointer to `event` over `frame`, with the cursor over `target`,
   * or with the previous cursor if it isn't known.
   */
  const move = useCallback(
    (
      event: globalThis.PointerEvent | PointerEvent<HTMLElement>,
      frame: HTMLElement,
      target: Element | undefined,
    ) => {
      const rect = frame.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      store.set({
        x: ((event.clientX - rect.left) * SLIDE_WIDTH) / rect.width,
        y: ((event.clientY - rect.top) * SLIDE_HEIGHT) / rect.height,
        cursor:
          target === undefined
            ? (store.get()?.cursor ?? 'default')
            : cursorShape(target, { x: event.clientX, y: event.clientY }),
        idle: false,
      });
      wake();
    },
    [store, wake],
  );
  // While the slide fades, the browser doesn't know what's under the
  // pointer, so the pointer keeps its cursor and follows the mouse by the
  // box of the slide, rather than leaving it.
  const running = useSyncExternalStore(
    transitions?.subscribe ?? noSubscription,
    () => transitions?.running ?? false,
  );
  useEffect(() => {
    const frame = frameRef.current;
    if (!running || frame === undefined) {
      return undefined;
    }
    const doc = frame.ownerDocument;
    const onPointerMove = (event: globalThis.PointerEvent) => {
      if (
        event.pointerType === 'touch' ||
        (event.target instanceof Node && frame.contains(event.target))
      ) {
        return;
      }
      const rect = frame.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX >= rect.right ||
        event.clientY < rect.top ||
        event.clientY >= rect.bottom
      ) {
        hide();
      } else {
        move(event, frame, undefined);
      }
    };
    doc.addEventListener('pointermove', onPointerMove);
    return () => {
      doc.removeEventListener('pointermove', onPointerMove);
    };
  }, [running, move, hide]);
  return {
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch') {
        return;
      }
      const frame = event.currentTarget;
      frameRef.current = frame;
      const { target } = event;
      move(
        event,
        frame,
        // Transitions of the slide alone send events to the slide itself.
        !(target instanceof Element) ||
          (target === frame && transitions?.running === true)
          ? undefined
          : target,
      );
    },
    onPointerLeave: () => {
      // The pointer seems to leave when the browser shows the transition
      // over the document instead.
      if (transitions?.running !== true) {
        hide();
      }
    },
  };
}

function noSubscription(): () => void {
  return () => undefined;
}

/** Height of the mirrored pointer, in the coordinates of the slide. */
const POINTER_SIZE = 32;

/** Path of the `PanToolAlt` icon of MUI, a hand pointing up. */
const POINTING_HAND_PATH =
  'm19.98 14.82-.63 4.46c-.14.99-.99 1.72-1.98 1.72h-6.16c-.53 0-1.29-.21-1.66-.59L5 15.62l.83-.84c.24-.24.58-.35.92-.28l3.25.74V4.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v6h.91c.31 0 .62.07.89.21l4.09 2.04c.77.39 1.21 1.22 1.09 2.07';

/** Path of the `PanTool` icon of MUI, an open hand. */
const OPEN_HAND_PATH =
  'M23 5.5V20c0 2.2-1.8 4-4 4h-7.3c-1.08 0-2.1-.43-2.85-1.19L1 14.83s1.26-1.23 1.3-1.25c.22-.19.49-.29.79-.29.22 0 .42.06.6.16.04.01 4.31 2.46 4.31 2.46V4c0-.83.67-1.5 1.5-1.5S11 3.17 11 4v7h1V1.5c0-.83.67-1.5 1.5-1.5S15 .67 15 1.5V11h1V2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V11h1V5.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5';

/** The colors of the mirrored mouse cursor, as CSS custom properties. */
const FILL_PROPERTY = '--SliderPointer-fill';
const OUTLINE_PROPERTY = '--SliderPointer-outline';

const FILLED_STYLE = {
  fill: `var(${FILL_PROPERTY})`,
  stroke: `var(${OUTLINE_PROPERTY})`,
  strokeWidth: 1,
  strokeLinejoin: 'round',
} as const;

/**
 * Draws lines in the outline color with a halo in the fill color, so that they
 * look like the outline of a filled shape, like the I-beam of mouse cursors.
 * Square caps make the halo go around the ends of the lines, too.
 */
function OutlinedLines({ d }: { d: string }): JSX.Element {
  return (
    <>
      <path
        d={d}
        style={{
          fill: 'none',
          stroke: `var(${FILL_PROPERTY})`,
          strokeWidth: 3,
          strokeLinecap: 'square',
        }}
      />
      <path
        d={d}
        style={{
          fill: 'none',
          stroke: `var(${OUTLINE_PROPERTY})`,
          strokeWidth: 1,
          strokeLinecap: 'square',
        }}
      />
    </>
  );
}

/** How to draw a {@link CursorShape}. */
interface CursorGlyph {
  /** The view box of the drawing, as `[x, y, width, height]`. */
  viewBox: readonly [number, number, number, number];
  /** Height of the cursor, in the coordinates of the slide. */
  height: number;
  /** The point of the drawing at the position of the pointer. */
  hotspot: readonly [number, number];
  drawing: JSX.Element;
}

const CURSOR_GLYPHS: Readonly<
  Record<Exclude<CursorShape, 'none'>, CursorGlyph>
> = {
  default: {
    viewBox: [0, 0, 12, 19],
    height: POINTER_SIZE,
    hotspot: [0, 0],
    // An arrow like the usual mouse cursor, with its tip at the position.
    drawing: (
      <path
        d="M0 0 L0 16 L4 12.5 L6.8 18.5 L9 17.5 L6.3 11.6 L11.5 11.6 Z"
        style={FILLED_STYLE}
      />
    ),
  },
  pointer: {
    viewBox: [4, 2, 17, 20],
    height: POINTER_SIZE,
    // The tip of the index finger.
    hotspot: [11.5, 3],
    drawing: <path d={POINTING_HAND_PATH} style={FILLED_STYLE} />,
  },
  grab: {
    viewBox: [0, -1, 24, 26],
    height: POINTER_SIZE,
    hotspot: [12, 12],
    drawing: <path d={OPEN_HAND_PATH} style={FILLED_STYLE} />,
  },
  text: {
    viewBox: [-1, -1, 10, 20],
    height: POINTER_SIZE,
    hotspot: [4, 9],
    // An I-beam.
    drawing: (
      <OutlinedLines d="M1 1 H3 L4 2 L5 1 H7 M4 2 V16 M1 17 H3 L4 16 L5 17 H7" />
    ),
  },
  crosshair: {
    viewBox: [-1, -1, 20, 20],
    height: POINTER_SIZE,
    hotspot: [9, 9],
    drawing: <OutlinedLines d="M9 1 V17 M1 9 H17" />,
  },
  'not-allowed': {
    viewBox: [-1, -1, 20, 20],
    height: (POINTER_SIZE * 3) / 4,
    hotspot: [9, 9],
    drawing: (
      <OutlinedLines d="M9 2 A7 7 0 1 0 9 16 A7 7 0 1 0 9 2 M4 4 L14 14" />
    ),
  },
};

export interface MirroredPointerProps {
  store: PointerStore;
  mode: PointerMode;
}

export type MirroredPointerClassKey = 'cursor' | 'laser';

export const mirroredPointerClasses: Record<MirroredPointerClassKey, string> =
  generateUtilityClasses('SliderPointer', ['cursor', 'laser']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderPointer: MirroredPointerClassKey;
  }

  interface ComponentsPropsList {
    SliderPointer: MirroredPointerProps;
  }

  interface Components<Theme = unknown> {
    SliderPointer?: ComponentTheme<'SliderPointer', Theme> | undefined;
  }
}

const PointerCursor = styled('svg', {
  name: 'SliderPointer',
  slot: 'Cursor',
})({
  [FILL_PROPERTY]: '#fff',
  [OUTLINE_PROPERTY]: '#000',
  overflow: 'visible',
  filter: 'drop-shadow(0 1px 1.5px rgb(0 0 0 / 40%))',
});

const PointerLaser = styled('div', {
  name: 'SliderPointer',
  slot: 'Laser',
})({
  width: 16,
  height: 16,
  // Centered on the position, whatever its size.
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  background: 'radial-gradient(circle, #fff 0%, #ff4d4d 35%, #e00000 70%)',
  boxShadow: '0 0 8px 4px rgb(255 0 0 / 60%)',
});

/**
 * Shows the pointer of the presenter on the slide, e.g., to the audience, as
 * a mouse cursor of the same shape, or as a laser pointer. Should be placed in
 * the frame of a slide.
 *
 * Can be themed as `SliderPointer` in the `components` of the MUI theme. The
 * `cursor` slot is an SVG element, whose colors are set by the
 * `--SliderPointer-fill` and `--SliderPointer-outline` custom properties, and
 * whose shape is in its `data-cursor` attribute. The `laser` slot is the dot
 * of the laser pointer, centered on the position, whatever its size.
 */
export function MirroredPointer(
  inProps: MirroredPointerProps,
): JSX.Element | null {
  const { store, mode } = useThemeProps({
    props: inProps,
    name: 'SliderPointer',
  });
  const position = useSyncExternalStore(store.subscribe, store.get);
  // Only the laser pointer stays when it doesn't move.
  if (
    position === undefined ||
    mode === 'off' ||
    (mode === 'mirror' && (position.idle || position.cursor === 'none'))
  ) {
    return null;
  }
  const style = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    zIndex: 1,
    pointerEvents: 'none',
  } as const;
  if (mode === 'laser') {
    return (
      <PointerLaser
        aria-hidden
        className={mirroredPointerClasses.laser}
        data-slider-pointer="laser"
        style={style}
      />
    );
  }
  const shape = position.cursor === 'none' ? 'default' : position.cursor;
  const { viewBox, height, hotspot, drawing } = CURSOR_GLYPHS[shape];
  const [left, top, viewWidth, viewHeight] = viewBox;
  const scale = height / viewHeight;
  return (
    <PointerCursor
      aria-hidden
      className={mirroredPointerClasses.cursor}
      data-slider-pointer="mirror"
      data-cursor={shape}
      viewBox={viewBox.join(' ')}
      width={viewWidth * scale}
      height={height}
      style={{
        ...style,
        marginLeft: (left - hotspot[0]) * scale,
        marginTop: (top - hotspot[1]) * scale,
      }}
    >
      {drawing}
    </PointerCursor>
  );
}
