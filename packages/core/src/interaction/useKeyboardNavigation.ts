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
 * - Page Up and Page Down go to the previous or next slide, showing the steps
 *   last shown on it.
 * - Home goes to the beginning of the first slide, and End to the last step
 *   of the last slide.
 * - Shift+Home and Shift+End go to the first or last step of the slide.
 * - `g` (or `:`, as in Vim) asks for a slide number to go to.
 * - `t` shows or hides the table of contents.
 * - `o` shows or hides the overview of the slides, and Escape or Enter hide
 *   it, staying on the selected slide. In the overview, the keys above move
 *   between slides without changing their steps.
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
    toc,
    showToc,
    setShowToc,
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
      // The overview shows the steps of each slide, which we keep.
      const forward = showOverview ? nextSlide : next;
      const backward = showOverview ? previousSlide : previous;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          forward();
          break;
        case ' ':
          if (event.shiftKey) {
            backward();
          } else {
            forward();
          }
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          backward();
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
            goTo(0, showOverview ? 'restore' : 'start');
          }
          break;
        case 'End':
          if (event.shiftKey) {
            lastStep();
          } else {
            goTo(slideCount - 1, showOverview ? 'restore' : 'end');
          }
          break;
        case 'g':
        case 'G':
        case ':': // As in Vim.
          onGoToSlide();
          break;
        case 't':
        case 'T':
          if (toc.length === 0) {
            return;
          }
          setShowToc(!showToc);
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
    toc,
    showToc,
    setShowToc,
    onGoToSlide,
  ]);
}
