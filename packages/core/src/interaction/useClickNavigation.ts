import { useCallback, type MouseEvent, type MouseEventHandler } from 'react';

import { getInteraction } from './interaction.ts';

function hasSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
}

/**
 * Returns a click handler that goes to the next step on click, and to the
 * previous step on Shift+click.
 *
 * Clicks on interactive elements, such as links, buttons, form controls, and
 * elements with the `data-slider-interactive` attribute, are ignored (see
 * {@link getInteraction}). Click handlers can also opt out by calling
 * `event.preventDefault()` or `event.stopPropagation()`, since they run
 * before this one.
 */
export function useClickNavigation(
  next: () => void,
  previous: () => void,
): MouseEventHandler<HTMLElement> {
  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
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
