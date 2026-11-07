import { styled, useTheme } from '@mui/material/styles';
import {
  use,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
  type PointerEvent,
} from 'react';

import { INTERACTIVE_ATTRIBUTE } from '../interaction/interaction.ts';
import type { SlideBox } from '../slide/slideBoxes.ts';
import { EditingContext } from './EditingContext.ts';
import {
  editableAt,
  EditLayer,
  scaleOf,
  useLegible,
  type Drag,
} from './EditLayer.tsx';
import type { EditMarkShape } from './EditMark.tsx';
import {
  anchorStyle,
  boxStyle,
  DiamondMark,
  BoxMark,
  isDark,
  LINE_WIDTH,
  MARK_ELEVATION,
  MarkAnchor,
  outlineStyle,
  snapToPixels,
} from './marks.tsx';
import type { Editable } from './useEditable.ts';

/** Props of a {@link DragHandle}. */
export interface DragHandleProps {
  /** The directive whose handle it is. */
  editable: Editable<object>;
  /** Where the handle takes the pointer, in the logical pixels of the slide. */
  box: SlideBox;
  /**
   * Where the handle takes the pointer instead of `box`, as an SVG path in
   * the logical pixels of the slide, e.g., for an `area` that isn't a box,
   * like the stem of a callout.
   */
  path?: string | undefined;
  /**
   * How the handle is drawn: a line across a `vertical` or `horizontal`
   * box, along which it's dragged, a `square`, a `circle`, or a `diamond` in
   * its middle, or not at all for an `area`, e.g., what is moved by dragging
   * it, or a side of it that resizes it.
   */
  shape: 'vertical' | 'horizontal' | EditMarkShape | 'area';
  /** What the handle does, for assistive technologies. */
  label: string;
  /** Defaults to a cursor that moves in the direction of the `shape`. */
  cursor?: string | undefined;
  /**
   * Whether the mark of the handle lights up. Defaults to while the handle is
   * under the pointer or dragged.
   */
  highlighted?: boolean | undefined;
  /**
   * Called when the handle comes under the pointer or starts to be dragged,
   * and when it no longer is either, e.g., to light up other marks with it.
   */
  onHighlightedChange?: ((highlighted: boolean) => void) | undefined;
  /**
   * The color that the mark of the handle is drawn over, if it's known, e.g.,
   * the background of the directive, so that it's outlined to stand out from
   * it. Defaults to the background of the slide.
   */
  background?: string | undefined;
  /**
   * Depth of the shadow of the mark, one of the `shadows` of the theme, e.g.,
   * 0 for a mark on what it moves, which is as high. Defaults to 4. Marks over
   * dark backgrounds cast none.
   */
  elevation?: number | undefined;
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
const MIN_HIT_SIZE = 20;

const DEFAULT_CURSORS = {
  vertical: 'col-resize',
  horizontal: 'row-resize',
  square: 'move',
  circle: 'move',
  diamond: 'move',
  area: 'move',
};

/** Covers the layer for handles that take the pointer in a path. */
const PathRoot = styled('svg', {
  name: 'SeminarDragHandle',
  slot: 'Path',
})({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'visible',
  pointerEvents: 'none',
  fill: 'transparent',
  touchAction: 'none',
});

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

/**
 * A handle of an editable directive in the {@link EditLayer}, which the
 * directive shows while it's {@link Editable.active}, and which tells how far
 * it's dragged. It takes no pointer while it isn't shown, and it's left out
 * while the step around it can't be read, as the `legibleStepAppearance` of
 * the theme tells. It looks the same, and is as large on the screen, whatever
 * the scale of the slide.
 */
export function DragHandle({
  editable,
  box,
  path,
  shape,
  label,
  cursor = DEFAULT_CURSORS[shape],
  highlighted: requestedHighlighted,
  background,
  elevation = MARK_ELEVATION,
  onHighlightedChange,
  onDragStart,
  onDrag,
  onRelease,
  onCancel,
  onReset,
}: DragHandleProps): JSX.Element | null {
  const editing = use(EditingContext);
  const theme = useTheme();
  const legible = useLegible();
  const scale = scaleOf(editing);
  const startRef = useRef<{ x: number; y: number; pointer: number }>(undefined);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const visible = editable.active || dragging;
  // Hidden handles take no pointer, so they aren't told when it leaves.
  if (!visible && hovered) {
    setHovered(false);
  }
  const engaged = dragging || hovered;
  const onEngagedChange = useEffectEvent((value: boolean) => {
    onHighlightedChange?.(value);
  });
  useEffect(() => {
    onEngagedChange(engaged);
  }, [engaged]);
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
  if (editing === undefined || (!legible && !dragging)) {
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
  // In the screen pixels of the layer.
  const width = Math.max(box.width * scale, MIN_HIT_SIZE);
  const height = Math.max(box.height * scale, MIN_HIT_SIZE);
  const left = (box.x + box.width / 2) * scale - width / 2;
  const top = (box.y + box.height / 2) * scale - height / 2;
  const highlighted = requestedHighlighted ?? engaged;
  const onDark = isDark(background ?? editing.background);
  // Marks on whole pixels: in the middle of points, and across lines, from
  // one end to the other.
  const mark = () => {
    if (shape === 'square' || shape === 'circle' || shape === 'diamond') {
      return {
        anchor: anchorStyle(
          editing,
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
        style:
          shape === 'diamond' ? {} : boxStyle(shape, theme, onDark, elevation),
      };
    }
    const [startX, startY] = snapToPixels(editing, box.x, box.y);
    const [endX, endY] = snapToPixels(
      editing,
      box.x + box.width,
      box.y + box.height,
    );
    const [middleX, middleY] = snapToPixels(
      editing,
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    const vertical = shape === 'vertical';
    const length = vertical ? endY - startY : endX - startX;
    // In whole pixels, half a pixel off the middle for odd widths.
    const across = -Math.floor(LINE_WIDTH / 2);
    return {
      anchor: {
        left: vertical ? middleX : startX,
        top: vertical ? startY : middleY,
      },
      style: {
        left: vertical ? across : 0,
        top: vertical ? 0 : across,
        width: vertical ? LINE_WIDTH : length,
        height: vertical ? length : LINE_WIDTH,
        ...outlineStyle(theme, onDark, elevation),
      },
    };
  };
  // Where the handle takes the pointer, a box or a path.
  const handleProps = {
    ...(shape === 'vertical' || shape === 'horizontal'
      ? { role: 'separator', 'aria-orientation': shape }
      : { role: 'button' }),
    'aria-label': label,
    'aria-hidden': visible ? undefined : true,
    [INTERACTIVE_ATTRIBUTE]: '',
    onPointerEnter: () => {
      setHovered(true);
      editing.hover(editable.key);
    },
    onPointerLeave: (event: PointerEvent) => {
      setHovered(false);
      // Onto the slide, or another handle, which tells itself.
      if (startRef.current === undefined) {
        editing.hover(editableAt(event.relatedTarget));
      }
    },
    onPointerDown: (event: PointerEvent) => {
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
      editing.select(editable.key);
      onDragStart?.();
    },
    onPointerMove: (event: PointerEvent) => {
      if (startRef.current?.pointer === event.pointerId) {
        onDrag(dragOf(event));
      }
    },
    onPointerUp: (event: PointerEvent) => {
      if (startRef.current?.pointer === event.pointerId) {
        const drag = dragOf(event);
        startRef.current = undefined;
        setDragging(false);
        editing.setDragging(undefined);
        onRelease(drag);
      }
    },
    onLostPointerCapture: () => {
      if (startRef.current !== undefined) {
        startRef.current = undefined;
        setDragging(false);
        editing.setDragging(undefined);
        onCancel?.();
      }
    },
    onDoubleClick: (event: MouseEvent) => {
      event.stopPropagation();
      onReset?.();
    },
  };
  return (
    <EditLayer>
      {path === undefined ? (
        <HandleRoot
          {...handleProps}
          style={{
            left,
            top,
            width,
            height,
            cursor,
            pointerEvents: visible ? undefined : 'none',
          }}
        />
      ) : (
        <PathRoot>
          <path
            d={path}
            transform={`scale(${String(scale)})`}
            {...handleProps}
            style={{ cursor, pointerEvents: visible ? 'fill' : 'none' }}
          />
        </PathRoot>
      )}
      {shape !== 'area' && (
        <MarkAnchor style={mark().anchor}>
          {shape === 'diamond' ? (
            <DiamondMark
              highlighted={highlighted}
              swapped={editable.swapped}
              onDark={onDark}
              elevation={elevation}
              opacity={visible ? 1 : 0}
            />
          ) : (
            <BoxMark
              shape={shape}
              highlighted={highlighted}
              swapped={editable.swapped}
              onDark={onDark}
              style={{ ...mark().style, opacity: visible ? 1 : 0 }}
            />
          )}
        </MarkAnchor>
      )}
    </EditLayer>
  );
}
