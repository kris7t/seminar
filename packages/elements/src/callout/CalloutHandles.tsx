import {
  DragHandle,
  EditBridge,
  EditMark,
  useDragArea,
  useSlideScale,
  parseSlidePoint,
  resolveSlidePoint,
  SLIDE_WIDTH,
  type AttributeChanges,
  type Drag,
  type Editable,
  type SlideBox,
  type SlidePoint,
} from '@seminar/core';
import { useRef, useState, type JSX } from 'react';

import {
  CALLOUT_SLIDE_MARGIN,
  calloutPlacementAt,
  calloutStemOffsetAt,
} from './calloutGeometry.ts';
import { useCalloutLayout, type CalloutLayout } from './calloutLayout.ts';

/** The attributes of a callout that its handles edit. */
interface CalloutAttributes {
  at?: SlidePoint | undefined;
  shift?: SlidePoint | undefined;
}

/** A callout when dragging its handle began. */
interface DragStart extends CalloutLayout, CalloutAttributes {}

/** A side of the body of a callout, which resizes it. */
type Side = 'left' | 'right';

/**
 * Screen pixels around the body and the tip of a callout that keep it hovered
 * on the way between them.
 */
const BRIDGE_MARGIN = 16;

/** Returns the convex hull of `points`, counterclockwise. */
function convexHull(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  const cross = (
    [ox, oy]: [number, number],
    [ax, ay]: [number, number],
    [bx, by]: [number, number],
  ) => (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
  const half = (from: [number, number][]) =>
    from.reduce<[number, number][]>((hull, point) => {
      for (;;) {
        const [before, last] = hull.slice(-2);
        if (
          before === undefined ||
          last === undefined ||
          cross(before, last, point) > 0
        ) {
          break;
        }
        hull.pop();
      }
      hull.push(point);
      return hull;
    }, []);
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Narrowest a callout gets while resizing, in logical slide pixels. */
const MIN_WIDTH = 40;

const ZERO_BOX: SlideBox = { x: 0, y: 0, width: 0, height: 0 };

/** Returns the point `x`, `y` in `box` as `at`, in the units of `previous`. */
function pointIn(
  box: SlideBox,
  x: number,
  y: number,
  previous: SlidePoint | undefined,
  relative: boolean,
  fine: boolean,
): string {
  const parsed = parseSlidePoint(previous);
  const coordinate = (
    value: number,
    start: number,
    size: number,
    index: 0 | 1,
  ) => {
    if ((parsed?.[index].relative ?? relative) && size > 0) {
      const step = fine ? 10 : 1;
      return `${String(Math.round(((value - start) / size) * 100 * step) / step)}%`;
    }
    return String(Math.round(value - start));
  };
  return `${coordinate(x, box.x, box.width, 0)},${coordinate(y, box.y, box.height, 1)}`;
}

/** Returns the top left corner of the body of a callout on the slide. */
function bodyOf({ options, geometry }: CalloutLayout) {
  return {
    x: options.anchorX + geometry.x,
    y: options.anchorY + geometry.y,
  };
}

/** Props of {@link CalloutHandles}. */
export interface CalloutHandlesProps {
  editable: Editable<CalloutAttributes>;
  /**
   * What dragging the tip edits: the `shift` of callouts in the text, or the
   * point `at` on the `slide`, or in the box of the `anchor` they point at,
   * in percentages unless `at` is in pixels.
   */
  tip: 'shift' | 'slide' | 'anchor';
}

/**
 * The handles of the callout around it, while it's edited: its body, which
 * turns and stretches its stem when dragged anywhere but on interactive
 * elements, or with Alt, the base of its stem, which moves along the
 * edge of the body, also turning the stem, its tip, which moves what it
 * points at, and the sides of the body, which resize it. Double-clicking a
 * handle removes what it sets. The corners of a side light up while it
 * resizes the body. The area around the body and the tip keeps the callout
 * hovered on the way between them.
 */
export function CalloutHandles({
  editable,
  tip,
}: CalloutHandlesProps): JSX.Element | null {
  const layout = useCalloutLayout();
  // The callout when dragging began, which the drags are relative to.
  const startRef = useRef<DragStart>(undefined);
  const start = () => {
    if (layout !== undefined) {
      startRef.current = {
        ...layout,
        at: editable.props.at,
        shift: editable.props.shift,
      };
    }
  };
  const preview = (
    changesOf: (start: DragStart, drag: Drag) => AttributeChanges,
    drag: Drag,
  ) => {
    if (startRef.current !== undefined) {
      editable.preview(changesOf(startRef.current, drag));
    }
  };
  const cancel = () => {
    startRef.current = undefined;
    editable.cancel();
  };
  // Dragging the body turns and stretches the stem.
  const move = (from: DragStart, { dx, dy, shiftKey }: Drag) => {
    const body = bodyOf(from);
    return calloutPlacementAt(
      from.options,
      body.x + dx,
      body.y + dy,
      shiftKey ? 15 : 1,
    );
  };
  // The side whose handle is under the pointer or dragged.
  const [side, setSide] = useState<Side>();
  const scale = useSlideScale();
  useDragArea(editable, layout?.body ?? null, {
    onDragStart: start,
    onDrag: (drag) => {
      preview(move, drag);
    },
    onRelease: (drag) => {
      preview(move, drag);
      startRef.current = undefined;
      editable.commit();
    },
    onCancel: cancel,
  });
  if (layout === undefined) {
    return null;
  }
  const { options, geometry } = layout;
  const bodyX = options.anchorX + geometry.x;
  const bodyY = options.anchorY + geometry.y;
  const horizontalEdge = geometry.edge === 'top' || geometry.edge === 'bottom';

  const handle = (
    label: string,
    box: SlideBox,
    shape: 'circle' | 'diamond' | 'area',
    changesOf: (start: DragStart, drag: Drag) => AttributeChanges,
    reset: AttributeChanges,
    cursor?: string,
    key: string = label,
    onHighlightedChange?: (highlighted: boolean) => void,
  ) => (
    <DragHandle
      key={key}
      editable={editable}
      box={box}
      shape={shape}
      label={label}
      cursor={cursor}
      onHighlightedChange={onHighlightedChange}
      onDragStart={start}
      onDrag={(drag) => {
        preview(changesOf, drag);
      }}
      onRelease={(drag) => {
        preview(changesOf, drag);
        startRef.current = undefined;
        editable.commit();
      }}
      onCancel={cancel}
      onReset={() => {
        editable.preview(reset);
        editable.commit();
      }}
    />
  );

  const tipOf = (start: CalloutLayout) => {
    const body = bodyOf(start);
    return {
      x: body.x + start.geometry.tipX,
      y: body.y + start.geometry.tipY,
    };
  };
  const tipAt = tipOf(layout);
  const baseX = bodyX + geometry.baseX;
  const baseY = bodyY + geometry.baseY;
  // Around the body and the tip, but for the bubble, which takes the pointer
  // itself, relative to the body.
  const margin = BRIDGE_MARGIN / scale;
  const around = convexHull(
    [
      [0, 0],
      [geometry.width, 0],
      [0, geometry.height],
      [geometry.width, geometry.height],
      [geometry.tipX, geometry.tipY],
    ].flatMap(([x = 0, y = 0]) =>
      [-margin, margin].flatMap((dx) =>
        [-margin, margin].map((dy): [number, number] => [x + dx, y + dy]),
      ),
    ),
  );
  const bridge = `M ${around.map(([x, y]) => `${String(x)} ${String(y)}`).join(' L ')} Z ${geometry.path}`;

  return (
    <>
      <EditBridge
        editable={editable}
        path={bridge}
        at={{ x: bodyX, y: bodyY }}
      />
      {(
        [
          ['top-left', bodyX, bodyY],
          ['top-right', bodyX + geometry.width, bodyY],
          ['bottom-left', bodyX, bodyY + geometry.height],
          ['bottom-right', bodyX + geometry.width, bodyY + geometry.height],
        ] as const
      ).map(([corner, x, y]) => (
        <EditMark
          key={corner}
          editable={editable}
          at={{ x, y }}
          shape="square"
          highlighted={side !== undefined && corner.endsWith(side)}
        />
      ))}
      {(['left', 'right'] as const).map((edge) =>
        handle(
          `Resize the callout from the ${edge}`,
          {
            x: edge === 'left' ? bodyX : bodyX + geometry.width,
            y: bodyY,
            width: 0,
            height: geometry.height,
          },
          'area',
          (start, { dx }) => {
            const width = Math.round(
              Math.min(
                Math.max(
                  start.geometry.width + (edge === 'left' ? -dx : dx),
                  MIN_WIDTH,
                ),
                SLIDE_WIDTH - CALLOUT_SLIDE_MARGIN * 2,
              ),
            );
            // The other side stays where it is, and so does the tip.
            const body = bodyOf(start);
            return {
              width,
              ...calloutPlacementAt(
                { ...start.options, width },
                edge === 'left'
                  ? body.x + start.geometry.width - width
                  : body.x,
                body.y,
              ),
            };
          },
          { width: null },
          'ew-resize',
          edge,
          (highlighted) => {
            setSide((previous) =>
              highlighted ? edge : previous === edge ? undefined : previous,
            );
          },
        ),
      )}
      {handle(
        'Move the stem of the callout along its edge',
        { x: baseX, y: baseY, width: 0, height: 0 },
        'diamond',
        (start, { dx, dy, shiftKey }) => {
          const stemOffset = calloutStemOffsetAt(
            start.options,
            start.geometry,
            start.geometry.edge === 'top' || start.geometry.edge === 'bottom'
              ? dx
              : dy,
            shiftKey ? 0.01 : 0.05,
          );
          // The body and the tip stay where they are.
          const body = bodyOf(start);
          return {
            stemOffset,
            ...calloutPlacementAt(
              { ...start.options, stemOffset },
              body.x,
              body.y,
            ),
          };
        },
        { stemOffset: null },
        horizontalEdge ? 'ew-resize' : 'ns-resize',
      )}
      {handle(
        'Move what the callout points at',
        { x: tipAt.x, y: tipAt.y, width: 0, height: 0 },
        'circle',
        (start, { dx, dy, shiftKey }) => {
          const parsed = parseSlidePoint(start.shift);
          const [shiftX, shiftY] =
            parsed === undefined ? [0, 0] : resolveSlidePoint(parsed, ZERO_BOX);
          if (tip === 'shift') {
            const x = Math.round(shiftX + dx);
            const y = Math.round(shiftY + dy);
            return {
              shift: x === 0 && y === 0 ? null : `${String(x)},${String(y)}`,
            };
          }
          // From where the tip is, which may be an edge of what it points at.
          const from = tipOf(start);
          return {
            at: pointIn(
              start.box,
              from.x + dx - shiftX,
              from.y + dy - shiftY,
              start.at,
              tip === 'anchor',
              shiftKey,
            ),
          };
        },
        tip === 'shift' ? { shift: null } : { at: null },
        'crosshair',
      )}
    </>
  );
}
