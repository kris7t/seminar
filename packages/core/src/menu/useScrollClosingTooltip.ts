import { useEffect, useState, type RefObject } from 'react';

/**
 * Options of the poppers of tooltips in scrolling containers. They stay in
 * place rather than following their anchor as the container scrolls, while
 * they fade out after it closed them, and are fixed, so that they don't
 * overflow the window while they are below it.
 */
export const SCROLL_CLOSING_POPPER_OPTIONS = {
  strategy: 'fixed',
  modifiers: [{ name: 'eventListeners', options: { scroll: false } }],
} as const;

/**
 * Whether a tooltip is open, which closes when anything in the document of
 * `ref` scrolls, rather than following its anchor away from the pointer.
 *
 * The tooltip should also have the {@link SCROLL_CLOSING_POPPER_OPTIONS}.
 */
export function useScrollClosingTooltip(
  ref: RefObject<Element | null>,
): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!open || doc === undefined) {
      return undefined;
    }
    const close = () => {
      setOpen(false);
    };
    // Scrolling elements doesn't bubble, but can be captured.
    doc.addEventListener('scroll', close, { capture: true, passive: true });
    return () => {
      doc.removeEventListener('scroll', close, { capture: true });
    };
  }, [ref, open]);
  return [open, setOpen];
}
