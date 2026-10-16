import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@slider/core';

/** Empty space kept between an automatically placed callout and the slide. */
export const CALLOUT_SLIDE_MARGIN = 24;

const DEFAULT_STEM_OFFSET = 0.3;
const DEFAULT_MIRRORED_STEM_OFFSET = 0.7;
const DEFAULT_STEM_ANGLE = 20;

export interface CalloutGeometryOptions {
  /** Position of the directive anchor in logical slide pixels. */
  anchorX: number;
  anchorY: number;
  /** Height of the character box around the directive anchor. */
  anchorHeight?: number | undefined;
  /** Size of the rounded rectangular body in logical slide pixels. */
  width: number;
  height: number;
  radius: number;
  /** Width of the stem where it joins the body. */
  stemSize: number;
  /** Direction from the body to the anchor, in degrees. */
  angle?: number | undefined;
  /** Length of the stem. Defaults to `stemSize`. */
  offset?: number | undefined;
  /** Attachment position along the angle-selected edge, from 0 to 1. */
  stemOffset?: number | undefined;
}

export interface CalloutGeometry {
  /** Body position relative to the directive anchor. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Direction from the body attachment to the anchor. */
  angle: number;
  /** SVG path of the rounded body and triangular stem. */
  path: string;
}

interface Point {
  x: number;
  y: number;
}

type Edge = 'top' | 'right' | 'bottom' | 'left';

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

function direction(angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function edgeForAngle(angle: number): Edge {
  const vector = direction(angle);
  if (Math.abs(vector.x) > Math.abs(vector.y))
    return vector.x >= 0 ? 'right' : 'left';
  return vector.y >= 0 ? 'bottom' : 'top';
}

function automaticStemOffset(anchor: Point, edge: Edge): number {
  const towardEnd =
    edge === 'top' || edge === 'bottom'
      ? anchor.x > SLIDE_WIDTH / 2
      : anchor.y > SLIDE_HEIGHT / 2;
  return towardEnd ? DEFAULT_MIRRORED_STEM_OFFSET : DEFAULT_STEM_OFFSET;
}

function attachmentPoint(
  edge: Edge,
  width: number,
  height: number,
  radius: number,
  stemSize: number,
  stemOffset: number,
): Point {
  const halfBase = stemSize / 2;
  if (edge === 'top' || edge === 'bottom') {
    const inset = radius + Math.min(halfBase, Math.max(0, width / 2 - radius));
    return {
      x: clamp(width * stemOffset, inset, width - inset),
      y: edge === 'top' ? 0 : height,
    };
  }
  const inset = radius + Math.min(halfBase, Math.max(0, height / 2 - radius));
  return {
    x: edge === 'left' ? 0 : width,
    y: clamp(height * stemOffset, inset, height - inset),
  };
}

function positionFor(
  anchor: Point,
  base: Point,
  stemLength: number,
  angle: number,
): Point {
  const vector = direction(angle);
  return {
    x: anchor.x - base.x - vector.x * stemLength,
    y: anchor.y - base.y - vector.y * stemLength,
  };
}

function overflow(position: Point, width: number, height: number): number {
  return (
    Math.max(0, CALLOUT_SLIDE_MARGIN - position.x) +
    Math.max(0, position.x + width - (SLIDE_WIDTH - CALLOUT_SLIDE_MARGIN)) +
    Math.max(0, CALLOUT_SLIDE_MARGIN - position.y) +
    Math.max(0, position.y + height - (SLIDE_HEIGHT - CALLOUT_SLIDE_MARGIN))
  );
}

interface Placement {
  angle: number;
  edge: Edge;
  stemOffset: number;
  anchor: Point;
  base: Point;
  position: Point;
}

function anchorForEdge(anchor: Point, anchorHeight: number, edge: Edge): Point {
  if (edge === 'bottom') return { x: anchor.x, y: anchor.y - anchorHeight / 2 };
  if (edge === 'top') return { x: anchor.x, y: anchor.y + anchorHeight / 2 };
  return anchor;
}

function placementFor(
  anchor: Point,
  anchorHeight: number,
  width: number,
  height: number,
  radius: number,
  stemSize: number,
  stemLength: number,
  angle: number,
  requestedStemOffset: number | undefined,
): Placement {
  const edge = edgeForAngle(angle);
  const target = anchorForEdge(anchor, anchorHeight, edge);
  const stemOffset = clamp(
    requestedStemOffset ?? automaticStemOffset(anchor, edge),
    0,
    1,
  );
  const base = attachmentPoint(
    edge,
    width,
    height,
    radius,
    stemSize,
    stemOffset,
  );
  return {
    angle,
    edge,
    stemOffset,
    anchor: target,
    base,
    position: positionFor(target, base, stemLength, angle),
  };
}

function automaticPlacement(
  anchor: Point,
  anchorHeight: number,
  width: number,
  height: number,
  radius: number,
  stemSize: number,
  stemLength: number,
  requestedStemOffset: number | undefined,
): Placement {
  const towardRight = anchor.x <= SLIDE_WIDTH / 2;
  const towardBottom = anchor.y <= SLIDE_HEIGHT / 2;
  // Prefer above, then below, left, and right. Each direction is tilted away
  // from the edge normal toward the slide center, matching the off-center body.
  const candidates = [
    towardRight ? 90 + DEFAULT_STEM_ANGLE : 90 - DEFAULT_STEM_ANGLE,
    towardRight ? -90 - DEFAULT_STEM_ANGLE : -90 + DEFAULT_STEM_ANGLE,
    towardBottom ? -DEFAULT_STEM_ANGLE : DEFAULT_STEM_ANGLE,
    towardBottom ? -180 + DEFAULT_STEM_ANGLE : 180 - DEFAULT_STEM_ANGLE,
  ];
  let best = placementFor(
    anchor,
    anchorHeight,
    width,
    height,
    radius,
    stemSize,
    stemLength,
    candidates[0] ?? 90,
    requestedStemOffset,
  );
  let bestOverflow = overflow(best.position, width, height);
  for (const candidate of candidates.slice(1)) {
    const placement = placementFor(
      anchor,
      anchorHeight,
      width,
      height,
      radius,
      stemSize,
      stemLength,
      candidate,
      requestedStemOffset,
    );
    const candidateOverflow = overflow(placement.position, width, height);
    if (candidateOverflow < bestOverflow) {
      best = placement;
      bestOverflow = candidateOverflow;
    }
  }
  return best;
}

function roundedRectanglePath(
  width: number,
  height: number,
  radius: number,
): string {
  return [
    `M ${String(radius)} 0`,
    `H ${String(width - radius)}`,
    `Q ${String(width)} 0 ${String(width)} ${String(radius)}`,
    `V ${String(height - radius)}`,
    `Q ${String(width)} ${String(height)} ${String(width - radius)} ${String(height)}`,
    `H ${String(radius)}`,
    `Q 0 ${String(height)} 0 ${String(height - radius)}`,
    `V ${String(radius)}`,
    `Q 0 0 ${String(radius)} 0`,
    'Z',
  ].join(' ');
}

function stemPath(
  edge: Edge,
  stemSize: number,
  base: Point,
  tip: Point,
): string {
  const halfBase = stemSize / 2;
  if (edge === 'top' || edge === 'bottom') {
    return `M ${String(base.x - halfBase)} ${String(base.y)} L ${String(tip.x)} ${String(tip.y)} L ${String(base.x + halfBase)} ${String(base.y)} Z`;
  }
  return `M ${String(base.x)} ${String(base.y - halfBase)} L ${String(tip.x)} ${String(tip.y)} L ${String(base.x)} ${String(base.y + halfBase)} Z`;
}

/**
 * Places a callout in the fixed-size slide and builds its SVG background. An
 * explicit angle, offset, or stem offset is a hard geometric constraint;
 * automatic placement merely chooses omitted values that minimize overflow.
 */
export function calloutGeometry({
  anchorX,
  anchorY,
  anchorHeight: requestedAnchorHeight = 0,
  width: requestedWidth,
  height: requestedHeight,
  radius: requestedRadius,
  stemSize: requestedStemSize,
  angle: requestedAngle,
  offset,
  stemOffset: requestedStemOffset,
}: CalloutGeometryOptions): CalloutGeometry {
  const width = clamp(
    requestedWidth,
    1,
    SLIDE_WIDTH - CALLOUT_SLIDE_MARGIN * 2,
  );
  const height = clamp(
    requestedHeight,
    1,
    SLIDE_HEIGHT - CALLOUT_SLIDE_MARGIN * 2,
  );
  const radius = clamp(requestedRadius, 0, Math.min(width, height) / 2);
  const stemSize = Math.max(0, requestedStemSize);
  const stemLength = Math.max(0, offset ?? stemSize);
  const anchor = { x: anchorX, y: anchorY };
  const anchorHeight = Math.max(0, requestedAnchorHeight);
  const normalizedStemOffset =
    requestedStemOffset === undefined
      ? undefined
      : clamp(requestedStemOffset, 0, 1);
  const placement =
    requestedAngle === undefined
      ? automaticPlacement(
          anchor,
          anchorHeight,
          width,
          height,
          radius,
          stemSize,
          stemLength,
          normalizedStemOffset,
        )
      : placementFor(
          anchor,
          anchorHeight,
          width,
          height,
          radius,
          stemSize,
          stemLength,
          requestedAngle,
          normalizedStemOffset,
        );
  const tip = {
    x: placement.anchor.x - placement.position.x,
    y: placement.anchor.y - placement.position.y,
  };
  return {
    x: placement.position.x - anchor.x,
    y: placement.position.y - anchor.y,
    width,
    height,
    angle: placement.angle,
    path: `${roundedRectanglePath(width, height, radius)} ${stemPath(
      placement.edge,
      stemSize,
      placement.base,
      tip,
    )}`,
  };
}
