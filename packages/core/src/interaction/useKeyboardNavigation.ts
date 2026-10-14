import { useEffect } from 'react';

import type { DeckState } from '../deck/DeckContext.ts';
import { getInteraction, usesKey } from './interaction.ts';

export interface KeyboardNavigationOptions {
  /** Opens the dialog for going to a slide by number. */
  onGoToSlide: () => void;
}

/**
 * Navigates between slides and steps with the keyboard:
 *
 * - Arrow keys and Space (Shift+Space backwards) go to the next or previous
 *   step, moving to another slide after the last or before the first step.
 * - Page Up and Page Down go to the beginning of the previous or next slide.
 * - Home and End go to the beginning of the first or last slide.
 * - Shift+Home and Shift+End go to the first or last step of the slide.
 * - `:` (as in Vim) asks for a slide number to go to.
 * - `o` shows or hides the overview of the slides, and Escape or Enter hide
 *   it, staying on the selected slide.
 * - Escape moves the focus away from the focused element, so that the keys
 *   it uses navigate again.
 *
 * Keys used by the focused element are left to it (see {@link usesKey}).
 *
 * See also {@link useClickNavigation} for navigating with the mouse.
 */
export function useKeyboardNavigation(
  {
    slideCount,
    goTo,
    next,
    previous,
    nextSlide,
    previousSlide,
    firstStep,
    lastStep,
    showOverview,
    setShowOverview,
  }: DeckState,
  { onGoToSlide }: KeyboardNavigationOptions,
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      // Widgets that use Escape themselves, e.g., to close a menu, should
      // cancel the event.
      if (event.key === 'Escape') {
        if (showOverview) {
          setShowOverview(false);
          event.preventDefault();
          return;
        }
        if (
          document.activeElement instanceof HTMLElement &&
          document.activeElement !== document.body
        ) {
          document.activeElement.blur();
        }
        return;
      }
      if (usesKey(getInteraction(event.target), event.key)) {
        return;
      }
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next();
          break;
        case ' ':
          if (event.shiftKey) {
            previous();
          } else {
            next();
          }
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          previous();
          break;
        case 'PageDown':
          nextSlide();
          break;
        case 'PageUp':
          previousSlide();
          break;
        case 'Home':
          if (event.shiftKey) {
            firstStep();
          } else {
            goTo(0);
          }
          break;
        case 'End':
          if (event.shiftKey) {
            lastStep();
          } else {
            goTo(slideCount - 1);
          }
          break;
        case ':':
          onGoToSlide();
          break;
        case 'o':
        case 'O':
          setShowOverview(!showOverview);
          break;
        case 'Enter':
          if (!showOverview) {
            return;
          }
          setShowOverview(false);
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
  }, [
    slideCount,
    goTo,
    next,
    previous,
    nextSlide,
    previousSlide,
    firstStep,
    lastStep,
    showOverview,
    setShowOverview,
    onGoToSlide,
  ]);
}
