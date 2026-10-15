import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type MouseEventHandler,
  type PointerEvent,
  type PointerEventHandler,
} from 'react';

import { getInteraction, TOUCH_SLOP } from './interaction.ts';

/** Position of a context menu in client coordinates. */
export interface MenuPosition {
  top: number;
  left: number;
  /**
   * Which side of the menu is at the position. Defaults to `'left'`, like
   * context menus.
   */
  align?: 'left' | 'right';
}

/** Event handlers that open the context menu, for the element that has it. */
export interface ContextMenuHandlers {
  onContextMenu: MouseEventHandler<HTMLElement>;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
  /** Keeps the click that ends a long press from navigating. */
  onClickCapture: MouseEventHandler<HTMLElement>;
}

/** How long a touch has to be held to open the menu, in milliseconds. */
export const LONG_PRESS_DELAY = 500;

interface Press {
  pointerId: number;
  x: number;
  y: number;
  timeout: ReturnType<typeof setTimeout>;
}

function opensMenu(target: EventTarget) {
  const interaction = getInteraction(target);
  return interaction !== 'text' && interaction !== 'custom';
}

/**
 * Keeps track of a context menu opened by right-clicking, by a long press on
 * touch screens, or by other means, like a menu button.
 *
 * The browser's own context menu is kept on Shift+right-click, and when
 * right-clicking text fields and elements that handle all input themselves
 * (see {@link getInteraction}). Long presses on them are ignored, too.
 *
 * A tap still clicks as usual, but the click at the end of a long press is
 * stopped, so that it doesn't navigate.
 *
 * @returns The position of the open menu (or `undefined` if it's closed), the
 *   event handlers that open the menu, and functions to open the menu at a
 *   position and to close it.
 */
export function useContextMenu(): [
  position: MenuPosition | undefined,
  handlers: ContextMenuHandlers,
  open: (position: MenuPosition) => void,
  close: () => void,
] {
  const [position, setPosition] = useState<MenuPosition>();
  const pressRef = useRef<Press>(undefined);
  const suppressClickRef = useRef(false);
  /**
   * Whether a long press has opened the menu, and the finger hasn't touched
   * the screen since.
   */
  const longPressedRef = useRef(false);

  const cancelPress = useCallback(() => {
    if (pressRef.current !== undefined) {
      clearTimeout(pressRef.current.timeout);
      pressRef.current = undefined;
    }
  }, []);

  useEffect(() => cancelPress, [cancelPress]);

  // Some browsers open their own context menu on a long press, too, at the
  // element under the finger. Once our menu is open, that's its backdrop, which
  // our handlers don't see, so we stop the event for the whole window.
  useEffect(() => {
    const onContextMenu = (event: Event) => {
      if (longPressedRef.current) {
        event.preventDefault();
      }
    };
    const onPointerDown = () => {
      longPressedRef.current = false;
    };
    const options = { capture: true };
    window.addEventListener('contextmenu', onContextMenu, options);
    window.addEventListener('pointerdown', onPointerDown, options);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu, options);
      window.removeEventListener('pointerdown', onPointerDown, options);
    };
  }, []);

  const handlers = useMemo<ContextMenuHandlers>(
    () => ({
      onContextMenu: (event: MouseEvent<HTMLElement>) => {
        // Some browsers also fire this event on a long press, maybe before
        // our timer runs out. If it already ran out, the event was stopped
        // above.
        if (pressRef.current !== undefined) {
          cancelPress();
          suppressClickRef.current = true;
          longPressedRef.current = true;
        }
        if (
          event.defaultPrevented ||
          event.shiftKey ||
          !opensMenu(event.target)
        ) {
          return;
        }
        event.preventDefault();
        setPosition({ top: event.clientY, left: event.clientX });
      },
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        cancelPress();
        suppressClickRef.current = false;
        if (
          event.pointerType === 'mouse' ||
          !event.isPrimary ||
          !opensMenu(event.target)
        ) {
          return;
        }
        const { pointerId, clientX: x, clientY: y } = event;
        pressRef.current = {
          pointerId,
          x,
          y,
          timeout: setTimeout(() => {
            pressRef.current = undefined;
            suppressClickRef.current = true;
            longPressedRef.current = true;
            setPosition({ top: y, left: x });
          }, LONG_PRESS_DELAY),
        };
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const current = pressRef.current;
        if (
          current?.pointerId === event.pointerId &&
          Math.hypot(event.clientX - current.x, event.clientY - current.y) >
            TOUCH_SLOP
        ) {
          cancelPress();
        }
      },
      onPointerUp: cancelPress,
      onPointerCancel: cancelPress,
      onClickCapture: (event: MouseEvent<HTMLElement>) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      },
    }),
    [cancelPress],
  );

  const close = useCallback(() => {
    setPosition(undefined);
  }, []);
  return [position, handlers, setPosition, close];
}
