import { use, useEffect, useEffectEvent } from 'react';

import { getInteraction } from '../interaction/interaction.ts';
import { EditingContext } from './EditingContext.ts';
import { scaleOf, useLegible, type Drag } from './EditLayer.tsx';
import type { Editable } from './useEditable.ts';

/** What a {@link useDragArea} calls while it's dragged. */
export interface DragAreaHandlers {
  /** Called when the area starts to be dragged. */
  onDragStart?: (() => void) | undefined;
  /** Called while the area is dragged. */
  onDrag: (drag: Drag) => void;
  /** Called when the area is released. */
  onRelease: (drag: Drag) => void;
  /** Called when dragging is cancelled, e.g., with Escape. */
  onCancel?: (() => void) | undefined;
}

/** Screen pixels the pointer moves before a press becomes a drag. */
const DRAG_SLOP = 4;

/**
 * Lets `element` on the slide, e.g., the body of a callout, be dragged to
 * edit `editable`, while the slide is edited and can be read. Unlike a
 * `DragHandle`, it covers nothing, so what is in it still works: presses on
 * interactive elements, like buttons, aren't drags, unless Alt is held, and
 * other presses only become drags once the pointer moves, so that clicks
 * still select the directive. It takes the place of selecting text.
 */
export function useDragArea(
  editable: Editable<object> | undefined,
  element: HTMLElement | null,
  handlers: DragAreaHandlers,
): void {
  const editing = use(EditingContext);
  const legible = useLegible();
  const key = editable?.key;
  const enabled =
    editing !== undefined && key !== undefined && element !== null && legible;
  const onDragStart = useEffectEvent(() => {
    editing?.setDragging(key);
    editing?.select(key);
    handlers.onDragStart?.();
  });
  const onDrag = useEffectEvent((drag: Drag) => {
    handlers.onDrag(drag);
  });
  const onEnd = useEffectEvent((drag: Drag | undefined) => {
    editing?.setDragging(undefined);
    if (drag === undefined) {
      handlers.onCancel?.();
    } else {
      handlers.onRelease(drag);
    }
  });
  const scaleNow = useEffectEvent(() => scaleOf(editing));
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let press:
      { x: number; y: number; pointer: number; dragging: boolean } | undefined;
    let swallowTimer: ReturnType<typeof setTimeout> | undefined;
    const swallow = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      window.removeEventListener('click', swallow, true);
    };
    const dragOf = (event: PointerEvent): Drag => ({
      dx: (event.clientX - (press?.x ?? event.clientX)) / scaleNow(),
      dy: (event.clientY - (press?.y ?? event.clientY)) / scaleNow(),
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
    const end = (drag: Drag | undefined) => {
      const wasDragging = press?.dragging === true;
      press = undefined;
      if (!wasDragging) {
        return;
      }
      onEnd(drag);
      // The click after a drag selects nothing, and goes to no step.
      window.addEventListener('click', swallow, true);
      clearTimeout(swallowTimer);
      swallowTimer = setTimeout(() => {
        window.removeEventListener('click', swallow, true);
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        (!event.altKey && getInteraction(event.target) !== undefined)
      ) {
        return;
      }
      // Rather than selecting text.
      event.preventDefault();
      press = {
        x: event.clientX,
        y: event.clientY,
        pointer: event.pointerId,
        dragging: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (press?.pointer !== event.pointerId) {
        return;
      }
      if (!press.dragging) {
        if (
          Math.hypot(event.clientX - press.x, event.clientY - press.y) <
          DRAG_SLOP
        ) {
          return;
        }
        press.dragging = true;
        element.setPointerCapture(event.pointerId);
        onDragStart();
      }
      onDrag(dragOf(event));
    };
    const onPointerUp = (event: PointerEvent) => {
      if (press?.pointer === event.pointerId) {
        end(dragOf(event));
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (press?.pointer === event.pointerId) {
        end(undefined);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && press?.dragging === true) {
        event.preventDefault();
        event.stopPropagation();
        end(undefined);
      }
    };
    const cursor = element.style.getPropertyValue('cursor');
    element.style.setProperty('cursor', 'move');
    element.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      element.style.setProperty('cursor', cursor);
      clearTimeout(swallowTimer);
      window.removeEventListener('click', swallow, true);
      element.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled, element]);
}
