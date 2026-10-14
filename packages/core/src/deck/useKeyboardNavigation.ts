import { useEffect } from 'react';

import type { DeckState } from './DeckContext.ts';

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  );
}

/** Navigates between slides with the keyboard and presentation remotes. */
export function useKeyboardNavigation({
  slideCount,
  goTo,
  next,
  previous,
}: DeckState): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditable(event.target)
      ) {
        return;
      }
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          if (event.shiftKey && event.key === ' ') {
            previous();
          } else {
            next();
          }
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          previous();
          break;
        case 'Home':
          goTo(0);
          break;
        case 'End':
          goTo(slideCount - 1);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [slideCount, goTo, next, previous]);
}
