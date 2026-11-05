import { styled } from '@mui/material/styles';
import {
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent,
  type ReactNode,
  type ReactPortal,
} from 'react';
import { createPortal } from 'react-dom';

import { findPropsOf } from '../host/sourceRanges.ts';
import { INTERACTIVE_ATTRIBUTE } from '../interaction/interaction.ts';
import type { SlideBox } from '../slide/slideBoxes.ts';
import { EditingContext, type Editing } from './EditingContext.ts';
import { editableKeyOf, type Editable } from './useEditable.ts';

/**
 * Renders `children` in the layer above the slide while it's edited, e.g.,
 * the handles of an editable directive, positioned in the logical pixels of
 * the slide. They take no room on the slide, and get none of the styles of
 * the steps around them. Renders nothing while the slide isn't edited.
 */
export function EditLayer({
  children,
}: {
  children?: ReactNode;
}): ReactPortal | null {
  const layer = use(EditingContext)?.layer;
  return layer === null || layer === undefined
    ? null
    : createPortal(children, layer);
}

/** The screen pixels of a logical pixel of the slide being edited. */
export function useSlideScale(): number {
  return use(EditingContext)?.scale ?? 1;
}

/** How far a handle is dragged, in the logical pixels of the slide. */
export interface Drag {
  dx: number;
  dy: number;
  /** Whether Shift is held, e.g., to edit more finely. */
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Props of a {@link DragHandle}. */
export interface DragHandleProps {
  /** The directive whose handle it is. */
  editable: Editable<object>;
  /** Where the handle takes the pointer, in the logical pixels of the slide. */
  box: SlideBox;
  /**
   * How the handle is drawn: a line across a `vertical` or `horizontal`
   * box, along which it's dragged, or a `point` in its middle.
   */
  shape: 'vertical' | 'horizontal' | 'point';
  /** What the handle does, for assistive technologies. */
  label: string;
  /** Defaults to a cursor that moves in the direction of the `shape`. */
  cursor?: string | undefined;
  /** Called when the handle starts to be dragged. */
  onDragStart?: (() => void) | undefined;
  /** Called while the handle is dragged. */
  onDrag: (drag: Drag) => void;
  /** Called when the handle is released. */
  onRelease: (drag: Drag) => void;
  /** Called when dragging is cancelled, e.g., with Escape. */
  onCancel?: (() => void) | undefined;
  /** Called when the handle is double-clicked, e.g., to reset what it sets. */
  onReset?: (() => void) | undefined;
}

/** Screen pixels of the smallest side of the box that takes the pointer. */
const MIN_HIT_SIZE = 12;

/** Screen pixels of the line or the point of a handle. */
const LINE_WIDTH = 2;
const POINT_SIZE = 10;

const DEFAULT_CURSORS = {
  vertical: 'col-resize',
  horizontal: 'row-resize',
  point: 'move',
};

const HandleRoot = styled('div', {
  name: 'SeminarDragHandle',
  slot: 'Root',
})({
  position: 'absolute',
  pointerEvents: 'auto',
  touchAction: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const HandleMark = styled('div', {
  name: 'SeminarDragHandle',
  slot: 'Mark',
})(({ theme }) => ({
  background: theme.palette.primary.main,
  boxShadow: `0 0 0 1px ${theme.palette.background.paper}`,
  transition: theme.transitions.create('opacity', {
    duration: theme.transitions.duration.shorter,
  }),
}));

/**
 * A handle of an editable directive in the {@link EditLayer}, which the
 * directive shows while it's {@link Editable.active}, and which tells how far
 * it's dragged. It looks the same, and is as large on the screen, whatever
 * the scale of the slide.
 */
export function DragHandle({
  editable,
  box,
  shape,
  label,
  cursor = DEFAULT_CURSORS[shape],
  onDragStart,
  onDrag,
  onRelease,
  onCancel,
  onReset,
}: DragHandleProps): JSX.Element | null {
  const editing = use(EditingContext);
  // Slides that aren't laid out yet have no scale.
  const scale = editing !== undefined && editing.scale > 0 ? editing.scale : 1;
  const startRef = useRef<{ x: number; y: number; pointer: number }>(undefined);
  const [dragging, setDragging] = useState(false);
  // Escape cancels dragging, rather than anything else it would do.
  useEffect(() => {
    if (!dragging) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        startRef.current = undefined;
        setDragging(false);
        editing?.setDragging(undefined);
        onCancel?.();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [dragging, editing, onCancel]);
  if (editing === undefined) {
    return null;
  }
  const dragOf = (event: PointerEvent): Drag => ({
    dx: (event.clientX - (startRef.current?.x ?? event.clientX)) / scale,
    dy: (event.clientY - (startRef.current?.y ?? event.clientY)) / scale,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  });
  const minSize = MIN_HIT_SIZE / scale;
  const width = Math.max(box.width, minSize);
  const height = Math.max(box.height, minSize);
  const thickness = (shape === 'point' ? POINT_SIZE : LINE_WIDTH) / scale;
  return (
    <EditLayer>
      <HandleRoot
        role="separator"
        aria-label={label}
        aria-orientation={shape === 'horizontal' ? 'horizontal' : 'vertical'}
        {...{ [INTERACTIVE_ATTRIBUTE]: '' }}
        style={{
          left: box.x + (box.width - width) / 2,
          top: box.y + (box.height - height) / 2,
          width,
          height,
          cursor,
        }}
        onPointerEnter={() => {
          editing.setHovered(editable.key);
        }}
        onPointerLeave={() => {
          if (startRef.current === undefined) {
            editing.setHovered(undefined);
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          startRef.current = {
            x: event.clientX,
            y: event.clientY,
            pointer: event.pointerId,
          };
          setDragging(true);
          editing.setDragging(editable.key);
          onDragStart?.();
        }}
        onPointerMove={(event) => {
          if (startRef.current?.pointer === event.pointerId) {
            onDrag(dragOf(event));
          }
        }}
        onPointerUp={(event) => {
          if (startRef.current?.pointer === event.pointerId) {
            const drag = dragOf(event);
            startRef.current = undefined;
            setDragging(false);
            editing.setDragging(undefined);
            onRelease(drag);
          }
        }}
        onLostPointerCapture={() => {
          if (startRef.current !== undefined) {
            startRef.current = undefined;
            setDragging(false);
            editing.setDragging(undefined);
            onCancel?.();
          }
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onReset?.();
        }}
      >
        <HandleMark
          style={{
            width: shape === 'horizontal' ? '100%' : thickness,
            height: shape === 'vertical' ? '100%' : thickness,
            borderRadius: shape === 'point' ? '50%' : thickness / 2,
            opacity: editable.active || dragging ? 1 : 0,
          }}
        />
      </HandleRoot>
    </EditLayer>
  );
}

/** Returns the key of the innermost editable directive around `target`. */
function editableAt(target: EventTarget | null): string | undefined {
  return target instanceof Element
    ? findPropsOf(target, editableKeyOf)
    : undefined;
}

/**
 * Returns how a slide is edited in the view of `frame`, if `enabled`, with
 * its handles drawn in `layer`, and follows which editable directive is
 * under the pointer.
 */
export function useEditing(
  enabled: boolean,
  frame: HTMLElement | null,
  layer: HTMLElement | null,
  scale: number,
): Editing | undefined {
  const [hovered, setHovered] = useState<string>();
  const [dragging, setDragging] = useState<string>();
  useEffect(() => {
    if (!enabled || frame === null) {
      return undefined;
    }
    const onOver = (event: globalThis.PointerEvent) => {
      setHovered(editableAt(event.target));
    };
    const onLeave = (event: globalThis.PointerEvent) => {
      // Onto a handle, which tells itself.
      if (
        !(event.relatedTarget instanceof Node) ||
        layer?.contains(event.relatedTarget) !== true
      ) {
        setHovered(undefined);
      }
    };
    frame.addEventListener('pointerover', onOver);
    frame.addEventListener('pointerleave', onLeave);
    return () => {
      frame.removeEventListener('pointerover', onOver);
      frame.removeEventListener('pointerleave', onLeave);
    };
  }, [enabled, frame, layer]);
  const editing = useMemo(
    () => ({ layer, scale, hovered, dragging, setHovered, setDragging }),
    [layer, scale, hovered, dragging],
  );
  return enabled ? editing : undefined;
}
