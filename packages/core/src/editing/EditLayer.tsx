import { styled, useTheme, type Theme } from '@mui/material/styles';
import {
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent,
  type ReactNode,
  type ReactPortal,
} from 'react';
import { createPortal } from 'react-dom';

import { findPropsOf } from '../host/sourceRanges.ts';
import {
  getInteraction,
  INTERACTIVE_ATTRIBUTE,
} from '../interaction/interaction.ts';
import type { SlideBox } from '../slide/slideBoxes.ts';
import { rankOf, useStepAppearance } from '../steps/stepAppearance.ts';
import {
  clampElevation,
  ShadowFilter,
  shadowFilterUrl,
} from '../svg/shadow.tsx';
import { useSvgId } from '../svg/useSvgId.ts';
import { EditingContext, type Editing } from './EditingContext.ts';
import { editableKeyOf, type Editable } from './useEditable.ts';

/**
 * Renders `children` in the layer above the slide while it's edited, e.g.,
 * the handles of an editable directive. The layer isn't scaled with the
 * slide, so that what is in it is drawn in whole screen pixels: a logical
 * pixel of the slide is {@link useSlideScale} pixels of the layer. What is in
 * it takes no room on the slide, and gets none of the styles of the steps
 * around it. Renders nothing while the slide isn't edited.
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

/** Screen pixels of the lines and the points of marks. */
const LINE_WIDTH = 4;
const SQUARE_SIZE = 8;
const CIRCLE_DIAMETER = 9;
/** The diagonal of diamonds, whose tips are then on whole pixels. */
const DIAMOND_DIAGONAL = 10;

/** Screen pixels of the outline around marks. */
const OUTLINE_WIDTH = 1;

/**
 * Colors of marks, and of those that are lit, which stand out whatever the
 * palette of the theme.
 */
const FILL_COLOR = '#fff';
const OUTLINE_COLOR = '#2a2b2a';
const HIGHLIGHTED_FILL_COLOR = '#fff700';
const HIGHLIGHTED_OUTLINE_COLOR = '#5a5b5a';

/** Depth of the shadow of marks, one of the `shadows` of the theme. */
const MARK_ELEVATION = 4;

/** Custom property of the color of the outline of a mark. */
const OUTLINE_PROPERTY = '--SeminarEditMark-outline';

const DEFAULT_CURSORS = {
  vertical: 'col-resize',
  horizontal: 'row-resize',
  square: 'move',
  circle: 'move',
  diamond: 'move',
  area: 'move',
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

/**
 * Fades marks in and out, unless their directive swapped with another, and
 * lights them up at once.
 */
const markStyles = (theme: Theme) =>
  ({
    pointerEvents: 'none',
    transition: theme.transitions.create('opacity', {
      duration: theme.transitions.duration.shortest,
      easing: theme.transitions.easing.easeInOut,
    }),
    '&[data-swapped]': { transition: 'none' },
  }) as const;

const HandleMark = styled('div', {
  name: 'SeminarDragHandle',
  slot: 'Mark',
})(({ theme }) => ({
  ...markStyles(theme),
  position: 'absolute',
  background: FILL_COLOR,
  [OUTLINE_PROPERTY]: OUTLINE_COLOR,
  '&[data-highlighted]': {
    background: HIGHLIGHTED_FILL_COLOR,
    [OUTLINE_PROPERTY]: HIGHLIGHTED_OUTLINE_COLOR,
  },
}));

/** Where marks are drawn from, in the screen pixels of the layer. */
const MarkAnchor = styled('div', {
  name: 'SeminarEditMark',
  slot: 'Root',
})({
  position: 'absolute',
  width: 0,
  height: 0,
  pointerEvents: 'none',
});

/** Marks drawn as SVG shapes, an outline with a filled shape in it. */
const SvgMark = styled('svg', {
  name: 'SeminarEditMark',
  slot: 'Svg',
})(({ theme }) => ({
  ...markStyles(theme),
  position: 'absolute',
  overflow: 'visible',
  fill: 'none',
  '& [data-part="outline"]': { stroke: OUTLINE_COLOR },
  '& [data-part="fill"]': { fill: FILL_COLOR },
  '&[data-highlighted] [data-part="outline"]': {
    stroke: HIGHLIGHTED_OUTLINE_COLOR,
  },
  '&[data-highlighted] [data-part="fill"]': { fill: HIGHLIGHTED_FILL_COLOR },
}));

/** Props of a {@link DiamondMark}. */
interface DiamondMarkProps {
  highlighted: boolean;
  swapped: boolean;
  opacity: number;
}

/**
 * A diamond around its anchor, in screen pixels, with its tips on whole
 * pixels, casting the shadow of marks like squares do.
 */
function DiamondMark({
  highlighted,
  swapped,
  opacity,
}: DiamondMarkProps): JSX.Element {
  const theme = useTheme();
  const shadowId = useSvgId('SeminarEditMark-shadow');
  const shadow = markShadow(theme);
  const half = DIAMOND_DIAGONAL / 2;
  // With the outline, which reaches beyond the tips.
  const extent = half + OUTLINE_WIDTH * 2;
  const points = `0 ${String(-half)} ${String(half)} 0 0 ${String(half)} ${String(-half)} 0`;
  return (
    <SvgMark
      {...markAttributes(highlighted, swapped)}
      data-shape="diamond"
      viewBox={`${String(-extent)} ${String(-extent)} ${String(extent * 2)} ${String(extent * 2)}`}
      style={{
        left: -extent,
        top: -extent,
        width: extent * 2,
        height: extent * 2,
        opacity,
      }}
    >
      <defs>
        <ShadowFilter
          id={shadowId}
          shadow={shadow}
          bounds={{
            x: -extent,
            y: -extent,
            width: extent * 2,
            height: extent * 2,
          }}
        />
      </defs>
      <g filter={shadowFilterUrl(shadowId, shadow)}>
        <polygon
          data-part="outline"
          points={points}
          strokeWidth={OUTLINE_WIDTH * 2}
        />
        <polygon data-part="fill" points={points} />
      </g>
    </SvgMark>
  );
}

/** The data attributes of a mark that tell how it's drawn. */
function markAttributes(highlighted: boolean, swapped: boolean) {
  return {
    'data-highlighted': highlighted ? '' : undefined,
    'data-swapped': swapped ? '' : undefined,
  };
}

/**
 * Returns the place, the size, and the outline of a square or a circle around
 * its anchor, in screen pixels.
 */
function boxStyle(shape: 'square' | 'circle', theme: Theme): CSSProperties {
  const size = shape === 'square' ? SQUARE_SIZE : CIRCLE_DIAMETER;
  return {
    left: -size / 2,
    top: -size / 2,
    width: size,
    height: size,
    borderRadius: shape === 'circle' ? '50%' : undefined,
    ...outlineStyle(theme),
  };
}

/** Returns the shadow that marks cast, from the theme. */
function markShadow(theme: Theme): string {
  return theme.shadows[clampElevation(theme, MARK_ELEVATION)] ?? 'none';
}

/**
 * Returns the outline that marks are seen with on any background, and their
 * shadow.
 */
function outlineStyle(theme: Theme): CSSProperties {
  const shadow = markShadow(theme);
  return {
    boxShadow: `0 0 0 ${String(OUTLINE_WIDTH)}px var(${OUTLINE_PROPERTY})${shadow === 'none' ? '' : `, ${shadow}`}`,
  };
}

/**
 * Returns the style of a {@link MarkAnchor} at `x`, `y` in the logical pixels
 * of the slide, moved onto the nearest device pixel.
 */
function anchorStyle(editing: Editing, x: number, y: number): CSSProperties {
  const [left, top] = snapToPixels(editing, x, y);
  return { left, top };
}

/**
 * Returns where `x`, `y` in the logical pixels of the slide being edited is
 * in the screen pixels of the {@link EditLayer}, moved onto the nearest edges
 * of device pixels, so that marks drawn from it in whole screen pixels are
 * crisp, rather than blurred differently on each side.
 */
function snapToPixels(
  editing: Editing,
  x: number,
  y: number,
): [number, number] {
  const origin = editing.layer?.getBoundingClientRect();
  const scale = scaleOf(editing);
  const ratio = window.devicePixelRatio || 1;
  const snap = (value: number, start: number) =>
    Math.round((start + value * scale) * ratio) / ratio - start;
  return [snap(x, origin?.left ?? 0), snap(y, origin?.top ?? 0)];
}

/** The shape of a mark around a point. */
export type EditMarkShape = 'square' | 'circle' | 'diamond';

/** Props of an {@link EditMark}. */
export interface EditMarkProps {
  /** The directive whose mark it is. */
  editable: Editable<object>;
  /** The middle of the mark, in the logical pixels of the slide. */
  at: { x: number; y: number };
  shape: EditMarkShape;
  /** Whether the mark lights up, e.g., while what it marks is hovered. */
  highlighted?: boolean | undefined;
}

/**
 * A mark of an editable directive in the {@link EditLayer}, which takes no
 * pointer, e.g., the corners of what dragging the directive moves. Like the
 * marks of a {@link DragHandle}, it shows while the directive is
 * {@link Editable.active}, and looks the same whatever the scale of the slide.
 */
export function EditMark({
  editable,
  at,
  shape,
  highlighted = false,
}: EditMarkProps): JSX.Element | null {
  const editing = use(EditingContext);
  const theme = useTheme();
  const legible = useLegible();
  if (editing === undefined || !legible) {
    return null;
  }
  const opacity = editable.active ? 1 : 0;
  return (
    <EditLayer>
      <MarkAnchor aria-hidden style={anchorStyle(editing, at.x, at.y)}>
        {shape === 'diamond' ? (
          <DiamondMark
            highlighted={highlighted}
            swapped={editable.swapped}
            opacity={opacity}
          />
        ) : (
          <HandleMark
            {...markAttributes(highlighted, editable.swapped)}
            data-shape={shape}
            style={{ ...boxStyle(shape, theme), opacity }}
          />
        )}
      </MarkAnchor>
    </EditLayer>
  );
}

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
  shape,
  label,
  cursor = DEFAULT_CURSORS[shape],
  highlighted: requestedHighlighted,
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
        style: shape === 'diamond' ? {} : boxStyle(shape, theme),
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
        ...outlineStyle(theme),
      },
    };
  };
  return (
    <EditLayer>
      <HandleRoot
        {...(shape === 'vertical' || shape === 'horizontal'
          ? { role: 'separator', 'aria-orientation': shape }
          : { role: 'button' })}
        aria-label={label}
        aria-hidden={visible ? undefined : true}
        {...{ [INTERACTIVE_ATTRIBUTE]: '' }}
        style={{
          left,
          top,
          width,
          height,
          cursor,
          pointerEvents: visible ? undefined : 'none',
        }}
        onPointerEnter={() => {
          setHovered(true);
          editing.hover(editable.key);
        }}
        onPointerLeave={(event) => {
          setHovered(false);
          // Onto the slide, or another handle, which tells itself.
          if (startRef.current === undefined) {
            editing.hover(editableAt(event.relatedTarget));
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
          editing.select(editable.key);
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
      />
      {shape !== 'area' && (
        <MarkAnchor aria-hidden style={mark().anchor}>
          {shape === 'diamond' ? (
            <DiamondMark
              highlighted={highlighted}
              swapped={editable.swapped}
              opacity={visible ? 1 : 0}
            />
          ) : (
            <HandleMark
              {...markAttributes(highlighted, editable.swapped)}
              data-shape={shape}
              style={{ ...mark().style, opacity: visible ? 1 : 0 }}
            />
          )}
        </MarkAnchor>
      )}
    </EditLayer>
  );
}

/** Props of an {@link EditBridge}. */
export interface EditBridgeProps {
  /** The directive whose handles it leads to. */
  editable: Editable<object>;
  /**
   * The area of the bridge, as an SVG path in the logical pixels of the
   * slide, with holes where its subpaths overlap, e.g., where the directive
   * itself takes the pointer.
   */
  path: string;
  /** Where the origin of `path` is on the slide. Defaults to its origin. */
  at?: { x: number; y: number } | undefined;
}

const BridgeRoot = styled('svg', {
  name: 'SeminarEditBridge',
  slot: 'Root',
})({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'visible',
  pointerEvents: 'none',
  fill: 'transparent',
  fillRule: 'evenodd',
});

/**
 * An invisible area of an editable directive in the {@link EditLayer}, which
 * keeps it hovered while the pointer crosses it, e.g., along the stem of a
 * callout to the handle at its tip, away from its body. Like a
 * {@link DragHandle}, it takes the pointer only while the directive shows its
 * handles.
 */
export function EditBridge({
  editable,
  path,
  at = { x: 0, y: 0 },
}: EditBridgeProps): JSX.Element | null {
  const editing = use(EditingContext);
  const legible = useLegible();
  if (editing === undefined || !legible) {
    return null;
  }
  return (
    <EditLayer>
      <BridgeRoot aria-hidden>
        <path
          d={path}
          transform={`scale(${String(scaleOf(editing))}) translate(${String(at.x)} ${String(at.y)})`}
          {...{ [INTERACTIVE_ATTRIBUTE]: '' }}
          style={{ pointerEvents: editable.active ? 'fill' : 'none' }}
          onPointerEnter={() => {
            editing.hover(editable.key);
          }}
          onPointerLeave={(event) => {
            editing.hover(editableAt(event.relatedTarget));
          }}
        />
      </BridgeRoot>
    </EditLayer>
  );
}

/**
 * Whether what is around the component being rendered can be read, as the
 * `legibleStepAppearance` of the theme tells, which is all that is edited.
 */
export function useLegible(): boolean {
  const theme = useTheme();
  return (
    useStepAppearance().rank <=
    rankOf(theme, theme.legibleStepAppearance ?? 'dimmed')
  );
}

/** Returns the scale of the slide, which isn't known before it's laid out. */
export function scaleOf(editing: Editing | undefined): number {
  return editing !== undefined && editing.scale > 0 ? editing.scale : 1;
}

/** Returns the key of the innermost editable directive around `target`. */
function editableAt(target: EventTarget | null): string | undefined {
  return target instanceof Element
    ? findPropsOf(target, editableKeyOf)
    : undefined;
}

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
  const editing = useMemo(
    () => ({
      layer,
      scale,
      hovered,
      selected,
      dragging,
      swapped,
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
      hover,
      setSelected,
      setDragging,
    ],
  );
  return enabled ? editing : undefined;
}
