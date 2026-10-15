import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type JSX,
  type PointerEvent,
  type PointerEventHandler,
} from 'react';

import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';

/** Position of the pointer on the slide, in the coordinates of the slide. */
export interface PointerPosition {
  x: number;
  y: number;
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
): PointerTrackingHandlers {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
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
  return {
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch') {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      store.set({
        x: ((event.clientX - rect.left) * SLIDE_WIDTH) / rect.width,
        y: ((event.clientY - rect.top) * SLIDE_HEIGHT) / rect.height,
        idle: false,
      });
      wake();
    },
    onPointerLeave: hide,
  };
}

/** Size of the mirrored pointer, in the coordinates of the slide. */
const POINTER_SIZE = 32;

/** Diameter of the dot of the laser pointer, in the coordinates of the slide. */
const LASER_SIZE = 16;

/**
 * Shows the pointer of the presenter on the slide, e.g., to the audience, as
 * a mouse cursor or as a laser pointer. Should be placed in the frame of a
 * slide.
 */
export function MirroredPointer({
  store,
  mode,
}: {
  store: PointerStore;
  mode: PointerMode;
}): JSX.Element | null {
  const position = useSyncExternalStore(store.subscribe, store.get);
  // Only the laser pointer stays when it doesn't move.
  if (
    position === undefined ||
    mode === 'off' ||
    (mode === 'mirror' && position.idle)
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
      <div
        aria-hidden
        data-slider-pointer="laser"
        style={{
          ...style,
          width: LASER_SIZE,
          height: LASER_SIZE,
          marginLeft: -LASER_SIZE / 2,
          marginTop: -LASER_SIZE / 2,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, #fff 0%, #ff4d4d 35%, #e00000 70%)',
          boxShadow: '0 0 8px 4px rgb(255 0 0 / 60%)',
        }}
      />
    );
  }
  return (
    <svg
      aria-hidden
      data-slider-pointer="mirror"
      viewBox="0 0 12 19"
      width={(POINTER_SIZE * 12) / 19}
      height={POINTER_SIZE}
      style={{ ...style, overflow: 'visible' }}
    >
      {/* An arrow like the usual mouse cursor, with its tip at the position. */}
      <path
        d="M0 0 L0 16 L4 12.5 L6.8 18.5 L9 17.5 L6.3 11.6 L11.5 11.6 Z"
        fill="white"
        stroke="black"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
