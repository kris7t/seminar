import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react';

import { getInteraction } from '../interaction/interaction.ts';
import { useMeasure } from '../transitions/settling.ts';
import { slideBackground } from '../view/slideBackground.ts';
import type { Editing } from './EditingContext.ts';
import { editableAt } from './EditLayer.tsx';

/** Which editable directives are hovered, selected, and dragged. */
interface EditingState {
  hovered?: string | undefined;
  selected?: string | undefined;
  dragging?: string | undefined;
  swapped: readonly string[];
}

/**
 * Returns the editable directives that the pointer, the selection, or
 * dragging moved between directly from `previous` to `next`, whose handles
 * appear and disappear at once, rather than fading in from none or out to
 * none.
 */
function swappedBetween(previous: EditingState, next: EditingState): string[] {
  return (['hovered', 'selected', 'dragging'] as const).flatMap((key) => {
    const from = previous[key];
    const to = next[key];
    return from !== undefined && to !== undefined && from !== to
      ? [from, to]
      : [];
  });
}

/**
 * Returns how a slide is edited in the view of `frame`, if `enabled`, with
 * its handles drawn in `layer`. Follows which editable directive is under the
 * pointer, and which is selected by clicking it, until clicking elsewhere,
 * which the click does instead of what it would do, like going to the next
 * step, or pressing Escape.
 */
export function useEditing(
  enabled: boolean,
  frame: HTMLElement | null,
  layer: HTMLElement | null,
  scale: number,
): Editing | undefined {
  const [state, setState] = useState<EditingState>({ swapped: [] });
  const { hovered, selected, dragging, swapped } = state;
  const change = useCallback((changes: Partial<EditingState>) => {
    setState((previous) => {
      const next = { ...previous, ...changes };
      if (
        next.hovered === previous.hovered &&
        next.selected === previous.selected &&
        next.dragging === previous.dragging
      ) {
        return previous;
      }
      return { ...next, swapped: swappedBetween(previous, next) };
    });
  }, []);
  const setHovered = useCallback(
    (key: string | undefined) => {
      change({ hovered: key });
    },
    [change],
  );
  const setSelected = useCallback(
    (key: string | undefined) => {
      change({ selected: key });
    },
    [change],
  );
  const setDragging = useCallback(
    (key: string | undefined) => {
      change({ dragging: key });
    },
    [change],
  );
  const hover = setHovered;
  const onSelectedEvent = useEffectEvent(() => selected);
  useEffect(() => {
    if (!enabled || frame === null) {
      return undefined;
    }
    const onOver = (event: globalThis.PointerEvent) => {
      hover(editableAt(event.target));
    };
    const onLeave = (event: globalThis.PointerEvent) => {
      // Onto a handle, which tells itself.
      if (
        !(event.relatedTarget instanceof Node) ||
        layer?.contains(event.relatedTarget) !== true
      ) {
        hover(undefined);
      }
    };
    const onClick = (event: MouseEvent) => {
      // Ctrl+click goes to the source instead.
      if (event.ctrlKey || event.metaKey || event.button !== 0) {
        return;
      }
      const key = editableAt(event.target);
      // Other than what interactive elements do with it.
      if (
        (key !== undefined || onSelectedEvent() !== undefined) &&
        getInteraction(event.target) === undefined
      ) {
        event.preventDefault();
      }
      setSelected(key);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onSelectedEvent() !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        setSelected(undefined);
      }
    };
    frame.addEventListener('pointerover', onOver);
    frame.addEventListener('pointerleave', onLeave);
    frame.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      frame.removeEventListener('pointerover', onOver);
      frame.removeEventListener('pointerleave', onLeave);
      frame.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled, frame, layer, hover, setSelected]);
  // Like the backgrounds of thumbnails, once the slide is rendered.
  const [background, setBackground] = useState<string>();
  useMeasure(enabled ? frame : null, () => {
    const measured =
      enabled && frame !== null ? slideBackground(frame) : undefined;
    setBackground((previous) => (previous === measured ? previous : measured));
  });
  const editing = useMemo(
    () => ({
      layer,
      scale,
      hovered,
      selected,
      dragging,
      swapped,
      background,
      hover,
      select: setSelected,
      setDragging,
    }),
    [
      layer,
      scale,
      hovered,
      selected,
      dragging,
      swapped,
      background,
      hover,
      setSelected,
      setDragging,
    ],
  );
  return enabled ? editing : undefined;
}
