import { useEffect } from 'react';

import type { DeckState } from '../deck/DeckContext.ts';
import { findAdjacentGroup, groupSlides } from '../overview/groupSlides.ts';
import { getInteraction, usesKey } from './interaction.ts';

export interface KeyboardNavigationOptions {
  /** Opens the dialog for going to a slide by number. */
  onGoToSlide: () => void;
  /** Starts or stops the presentation. */
  onPresent: () => void;
  /** Opens or closes the presenter view. */
  onPresenterView: () => void;
  /**
   * Shows only the notes in the presenter view, or the previews, too.
   *
   * @returns Whether the key was handled, i.e., the presenter view is open.
   */
  onFocusNotes: () => boolean;
  /**
   * Shows or hides the pointer of the presenter to the audience.
   *
   * @returns Whether the key was handled, i.e., the presenter view is open.
   */
  onMirrorPointer: () => boolean;
  /**
   * Turns the pointer of the presenter into a laser pointer, or back.
   *
   * @returns Whether the key was handled, i.e., the presenter view is open.
   */
  onLaserPointer: () => boolean;
  /**
   * Handles Escape if nothing is focused or selected, e.g., to leave the
   * presenter view.
   *
   * @returns Whether Escape was handled.
   */
  onEscape: () => boolean;
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
 * - `p` starts the presentation in full screen, or stops it.
 * - Shift+`p` opens or closes the presenter view.
 * - `n` shows only the notes in the presenter view, or the previews, too.
 * - `m` shows or hides the pointer of the presenter to the audience, and `l`
 *   turns it into a laser pointer, or back.
 * - `o` shows or hides the overview of the slides. In the overview, the keys
 *   above select a slide instead, where Up and Down jump between the
 *   divisions of the deck, like sections. Enter goes to the selected slide,
 *   and Escape closes the overview without going anywhere.
 * - Escape leaves the presenter view, or moves the focus away from the focused
 *   element, so that the keys it uses navigate again.
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
    overviewIndex,
    setOverviewIndex,
    toc,
    showToc,
    setShowToc,
    mouseNavigation,
    setMouseNavigation,
  }: DeckState,
  {
    onGoToSlide,
    onPresent,
    onPresenterView,
    onFocusNotes,
    onMirrorPointer,
    onLaserPointer,
    onEscape,
  }: KeyboardNavigationOptions,
): void {
  useEffect(() => {
    /**
     * Moves the selection of the overview, which only changes the current
     * slide when the overview is closed with Enter.
     *
     * @returns Whether the key was handled.
     */
    const onOverviewKey = (event: KeyboardEvent): boolean => {
      const select = (index: number) => {
        setOverviewIndex(Math.max(0, Math.min(index, slideCount - 1)));
      };
      // Up and Down jump between the divisions of the deck, if it has any.
      const jump = (direction: 1 | -1) => {
        const groups = groupSlides(toc, slideCount);
        if (groups.length <= 1) {
          select(overviewIndex + direction);
        } else {
          const target = findAdjacentGroup(groups, overviewIndex, direction);
          if (target !== undefined) {
            select(target);
          }
        }
      };
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          select(overviewIndex + 1);
          return true;
        case 'ArrowLeft':
        case 'PageUp':
          select(overviewIndex - 1);
          return true;
        case ' ':
          select(overviewIndex + (event.shiftKey ? -1 : 1));
          return true;
        case 'ArrowDown':
          jump(1);
          return true;
        case 'ArrowUp':
          jump(-1);
          return true;
        // There are no steps to go through in the overview.
        case 'Home':
          if (!event.shiftKey) {
            select(0);
          }
          return true;
        case 'End':
          if (!event.shiftKey) {
            select(slideCount - 1);
          }
          return true;
        case 'Enter':
          // Keep the steps shown in the thumbnail.
          goTo(overviewIndex, 'restore');
          setShowOverview(false);
          return true;
        default:
          return false;
      }
    };
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
        // Dismiss the focus and the selected text first, so that leaving a
        // text field doesn't also leave the presenter view.
        const focused =
          document.activeElement instanceof HTMLElement &&
          document.activeElement !== document.body
            ? document.activeElement
            : undefined;
        const selection = window.getSelection();
        if (
          focused !== undefined ||
          (selection !== null && !selection.isCollapsed)
        ) {
          focused?.blur();
          selection?.removeAllRanges();
          event.preventDefault();
          return;
        }
        if (onEscape()) {
          event.preventDefault();
        }
        return;
      }
      if (usesKey(getInteraction(event.target), event.key)) {
        return;
      }
      if (showOverview && onOverviewKey(event)) {
        event.preventDefault();
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
            goTo(slideCount - 1, 'end');
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
        case 'p':
        case 'P':
          if (event.shiftKey) {
            onPresenterView();
          } else {
            onPresent();
          }
          break;
        case 'n':
        case 'N':
          if (!onFocusNotes()) {
            return;
          }
          break;
        case 'm':
        case 'M':
          if (!onMirrorPointer()) {
            return;
          }
          break;
        case 'l':
        case 'L':
          if (!onLaserPointer()) {
            return;
          }
          break;
        case 'o':
        case 'O':
          setShowOverview(!showOverview);
          break;
        case 's':
        case 'S':
          setMouseNavigation(!mouseNavigation);
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
    overviewIndex,
    setOverviewIndex,
    toc,
    showToc,
    setShowToc,
    mouseNavigation,
    setMouseNavigation,
    onGoToSlide,
    onPresent,
    onPresenterView,
    onFocusNotes,
    onMirrorPointer,
    onLaserPointer,
    onEscape,
  ]);
}
