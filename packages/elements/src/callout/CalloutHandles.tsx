import {
  DragHandle,
  parseSlidePoint,
  resolveSlidePoint,
  SLIDE_WIDTH,
  type AttributeChanges,
  type Drag,
  type Editable,
  type SlideBox,
  type SlidePoint,
} from '@seminar/core';
import { useRef, type JSX } from 'react';

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
 * turns and stretches its stem, the base of its stem, which moves along the
 * edge of the body, also turning the stem, its tip, which moves what it
 * points at, and the sides of the body, which resize it. Double-clicking a
 * handle removes what it sets.
 */
export function CalloutHandles({
  editable,
  tip,
}: CalloutHandlesProps): JSX.Element | null {
  const layout = useCalloutLayout();
  // The callout when dragging began, which the drags are relative to.
  const startRef = useRef<DragStart>(undefined);
  if (layout === undefined || !editable.active) {
    return null;
  }
  const { options, geometry } = layout;
  const bodyX = options.anchorX + geometry.x;
  const bodyY = options.anchorY + geometry.y;
  const horizontalEdge = geometry.edge === 'top' || geometry.edge === 'bottom';

  const handle = (
    label: string,
    box: SlideBox,
    shape: 'point' | 'area',
    changesOf: (start: DragStart, drag: Drag) => AttributeChanges,
    reset: AttributeChanges,
    cursor?: string,
    key: string = label,
  ) => (
    <DragHandle
      key={key}
      editable={editable}
      box={box}
      shape={shape}
      label={label}
      cursor={cursor}
      onDragStart={() => {
        startRef.current = {
          ...layout,
          at: editable.props.at,
          shift: editable.props.shift,
        };
      }}
      onDrag={(drag) => {
        if (startRef.current !== undefined) {
          editable.preview(changesOf(startRef.current, drag));
        }
      }}
      onRelease={(drag) => {
        if (startRef.current !== undefined) {
          editable.preview(changesOf(startRef.current, drag));
          startRef.current = undefined;
          editable.commit();
        }
      }}
      onCancel={() => {
        startRef.current = undefined;
        editable.cancel();
      }}
      onReset={() => {
        editable.preview(reset);
        editable.commit();
      }}
    />
  );

  const bodyOf = (start: CalloutLayout) => ({
    x: start.options.anchorX + start.geometry.x,
    y: start.options.anchorY + start.geometry.y,
  });
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

  return (
    <>
      {handle(
        'Move the callout',
        { x: bodyX, y: bodyY, width: geometry.width, height: geometry.height },
        'area',
        (start, { dx, dy, shiftKey }) => {
          const body = bodyOf(start);
          return calloutPlacementAt(
            start.options,
            body.x + dx,
            body.y + dy,
            shiftKey ? 15 : 1,
          );
        },
        { angle: null, offset: null },
      )}
      {(['left', 'right'] as const).map((side) =>
        handle(
          `Resize the callout from the ${side}`,
          {
            x: side === 'left' ? bodyX : bodyX + geometry.width,
            y: bodyY,
            width: 0,
            height: geometry.height,
          },
          'area',
          (start, { dx }) => {
            const width = Math.round(
              Math.min(
                Math.max(
                  start.geometry.width + (side === 'left' ? -dx : dx),
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
                side === 'left'
                  ? body.x + start.geometry.width - width
                  : body.x,
                body.y,
              ),
            };
          },
          { width: null },
          'ew-resize',
          side,
        ),
      )}
      {handle(
        'Move the stem of the callout along its edge',
        { x: baseX, y: baseY, width: 0, height: 0 },
        'point',
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
        'point',
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
