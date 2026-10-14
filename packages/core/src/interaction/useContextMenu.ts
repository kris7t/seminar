import {
  useCallback,
  useState,
  type MouseEvent,
  type MouseEventHandler,
} from 'react';

import { getInteraction } from './interaction.ts';

/** Position of a context menu in client coordinates. */
export interface MenuPosition {
  top: number;
  left: number;
}

/**
 * Keeps track of a context menu opened by right-clicking.
 *
 * The browser's own context menu is kept on Shift+right-click, and when
 * right-clicking text fields and elements that handle all input themselves
 * (see {@link getInteraction}).
 *
 * @returns The position of the open menu (or `undefined` if it's closed), the
 *   handler for the `contextmenu` event, and a function to close the menu.
 */
export function useContextMenu(): [
  position: MenuPosition | undefined,
  onContextMenu: MouseEventHandler<HTMLElement>,
  close: () => void,
] {
  const [position, setPosition] = useState<MenuPosition>();
  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    const interaction = getInteraction(event.target);
    if (
      event.defaultPrevented ||
      event.shiftKey ||
      interaction === 'text' ||
      interaction === 'custom'
    ) {
      return;
    }
    event.preventDefault();
    setPosition({ top: event.clientY, left: event.clientX });
  }, []);
  const close = useCallback(() => {
    setPosition(undefined);
  }, []);
  return [position, onContextMenu, close];
}
