import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@seminar/core';

/** Empty space kept between an automatically placed callout and the slide. */
export const CALLOUT_SLIDE_MARGIN = 24;

const DEFAULT_STEM_OFFSET = 0.3;
const DEFAULT_MIRRORED_STEM_OFFSET = 0.7;
const DEFAULT_STEM_ANGLE = 20;

export interface CalloutGeometryOptions {
  /**
   * Position of the directive anchor in logical slide pixels, the middle of
   * the box it points at, if any.
   */
  anchorX: number;
  anchorY: number;
  /**
   * Size of the box around the directive anchor, e.g., of the character or
   * the element it points at, whose edge the stem ends at, where a ray from
   * the anchor towards the body leaves the box. Without a width, it ends at
   * the top or the bottom of the box.
   */
  anchorWidth?: number | undefined;
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
  /** The edge of the body that the stem is attached to. */
  edge: CalloutEdge;
  /** Length of the stem. */
  offset: number;
  /** Attachment position along `edge`, from 0 to 1. */
  stemOffset: number;
  /** Middle of the base of the stem relative to the body. */
  baseX: number;
  baseY: number;
  /** Tip of the stem relative to the body, which may lie outside of it. */
  tipX: number;
  tipY: number;
  /** SVG path of the rounded body and triangular stem. */
  path: string;
}

interface Point {
  x: number;
  y: number;
}

/** An edge of the body of a callout. */
export type CalloutEdge = 'top' | 'right' | 'bottom' | 'left';

type Edge = CalloutEdge;

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
  const halfBase = stemHalfBase(edge, width, height, radius, stemSize);
  if (edge === 'top' || edge === 'bottom') {
    const inset = radius + halfBase;
    return {
      x: clamp(width * stemOffset, inset, width - inset),
      y: edge === 'top' ? 0 : height,
    };
  }
  const inset = radius + halfBase;
  return {
    x: edge === 'left' ? 0 : width,
    y: clamp(height * stemOffset, inset, height - inset),
  };
}

function stemHalfBase(
  edge: Edge,
  width: number,
  height: number,
  radius: number,
  stemSize: number,
): number {
  const edgeLength = edge === 'top' || edge === 'bottom' ? width : height;
  return Math.min(stemSize / 2, Math.max(0, edgeLength / 2 - radius));
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

interface Size {
  width: number;
  height: number;
}

/**
 * Returns where the stem with `angle` ends on the box of `size` around
 * `anchor`: where a ray from the anchor towards the body leaves the box.
 */
function tipFor(anchor: Point, { width, height }: Size, angle: number): Point {
  const toward = direction(angle);
  const exits = [
    // Rays along an axis, without the rounding errors of cosines.
    width > 0 && Math.abs(toward.x) > 1e-9
      ? width / 2 / Math.abs(toward.x)
      : Infinity,
    height > 0 && Math.abs(toward.y) > 1e-9
      ? height / 2 / Math.abs(toward.y)
      : Infinity,
  ];
  const distance = Math.min(...exits);
  if (!Number.isFinite(distance)) {
    return anchor;
  }
  return {
    x: anchor.x - clamp(toward.x * distance, -width / 2, width / 2),
    y: anchor.y - clamp(toward.y * distance, -height / 2, height / 2),
  };
}

function placementFor(
  anchor: Point,
  anchorSize: Size,
  width: number,
  height: number,
  radius: number,
  stemSize: number,
  stemLength: number,
  angle: number,
  requestedStemOffset: number | undefined,
): Placement {
  const edge = edgeForAngle(angle);
  const target = tipFor(anchor, anchorSize, angle);
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
  anchorSize: Size,
  width: number,
  height: number,
  radius: number,
  stemSize: number,
  stemLength: number,
  requestedStemOffset: number | undefined,
): Placement {
  // Keep the preferred direction and attachment stable across the slide center,
  // reflecting them only when that reduces overflow.
  const candidates = [
    90 - DEFAULT_STEM_ANGLE,
    -90 - DEFAULT_STEM_ANGLE,
    -90 + DEFAULT_STEM_ANGLE,
  ];
  const place = (angle: number): Placement =>
    placementFor(
      anchor,
      anchorSize,
      width,
      height,
      radius,
      stemSize,
      stemLength,
      angle,
      requestedStemOffset ??
        (direction(angle).x < 0
          ? DEFAULT_STEM_OFFSET
          : DEFAULT_MIRRORED_STEM_OFFSET),
    );
  let best = place(90 + DEFAULT_STEM_ANGLE);
  let bestOverflow = overflow(best.position, width, height);
  for (const candidate of candidates) {
    const placement = place(candidate);
    const candidateOverflow = overflow(placement.position, width, height);
    if (candidateOverflow < bestOverflow) {
      best = placement;
      bestOverflow = candidateOverflow;
    }
  }
  return best;
}

function speechBubblePath(
  width: number,
  height: number,
  radius: number,
  stemSize: number,
  edge: Edge,
  base: Point,
  tip: Point,
): string {
  const halfBase = stemHalfBase(edge, width, height, radius, stemSize);
  return [
    `M ${String(radius)} 0`,
    ...(edge === 'top'
      ? [
          `H ${String(base.x - halfBase)}`,
          `L ${String(tip.x)} ${String(tip.y)}`,
          `L ${String(base.x + halfBase)} 0`,
        ]
      : []),
    `H ${String(width - radius)}`,
    `Q ${String(width)} 0 ${String(width)} ${String(radius)}`,
    ...(edge === 'right'
      ? [
          `V ${String(base.y - halfBase)}`,
          `L ${String(tip.x)} ${String(tip.y)}`,
          `L ${String(width)} ${String(base.y + halfBase)}`,
        ]
      : []),
    `V ${String(height - radius)}`,
    `Q ${String(width)} ${String(height)} ${String(width - radius)} ${String(height)}`,
    ...(edge === 'bottom'
      ? [
          `H ${String(base.x + halfBase)}`,
          `L ${String(tip.x)} ${String(tip.y)}`,
          `L ${String(base.x - halfBase)} ${String(height)}`,
        ]
      : []),
    `H ${String(radius)}`,
    `Q 0 ${String(height)} 0 ${String(height - radius)}`,
    ...(edge === 'left'
      ? [
          `V ${String(base.y + halfBase)}`,
          `L ${String(tip.x)} ${String(tip.y)}`,
          `L 0 ${String(base.y - halfBase)}`,
        ]
      : []),
    `V ${String(radius)}`,
    `Q 0 0 ${String(radius)} 0`,
    'Z',
  ].join(' ');
}

/**
 * Places a callout in the fixed-size slide and builds its SVG background. An
 * explicit angle, offset, or stem offset is a hard geometric constraint;
 * automatic placement prefers above and right, reflecting to minimize overflow.
 */
function normalize({
  anchorX,
  anchorY,
  anchorWidth = 0,
  anchorHeight = 0,
  width: requestedWidth,
  height: requestedHeight,
  radius: requestedRadius,
  stemSize: requestedStemSize,
  offset,
  stemOffset,
}: CalloutGeometryOptions) {
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
  return {
    anchor: { x: anchorX, y: anchorY },
    anchorSize: {
      width: Math.max(0, anchorWidth),
      height: Math.max(0, anchorHeight),
    },
    width,
    height,
    radius,
    stemSize,
    stemLength: Math.max(0, offset ?? stemSize),
    stemOffset: stemOffset === undefined ? undefined : clamp(stemOffset, 0, 1),
  };
}

export function calloutGeometry(
  options: CalloutGeometryOptions,
): CalloutGeometry {
  const { angle: requestedAngle } = options;
  const {
    anchor,
    anchorSize,
    width,
    height,
    radius,
    stemSize,
    stemLength,
    stemOffset: normalizedStemOffset,
  } = normalize(options);
  const placement =
    requestedAngle === undefined
      ? automaticPlacement(
          anchor,
          anchorSize,
          width,
          height,
          radius,
          stemSize,
          stemLength,
          normalizedStemOffset,
        )
      : placementFor(
          anchor,
          anchorSize,
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
    edge: placement.edge,
    offset: stemLength,
    stemOffset: placement.stemOffset,
    baseX: placement.base.x,
    baseY: placement.base.y,
    tipX: tip.x,
    tipY: tip.y,
    path: speechBubblePath(
      width,
      height,
      radius,
      stemSize,
      placement.edge,
      placement.base,
      tip,
    ),
  };
}

/** A rectangle relative to the body of a callout. */
export interface CalloutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounds of the body and the stem of a callout, whichever direction the stem
 * points to.
 */
export function calloutBounds({
  width,
  height,
  tipX,
  tipY,
}: CalloutGeometry): CalloutBounds {
  const left = Math.min(0, tipX);
  const top = Math.min(0, tipY);
  return {
    x: left,
    y: top,
    width: Math.max(width, tipX) - left,
    height: Math.max(height, tipY) - top,
  };
}

const round = (value: number, step: number): number =>
  Number((Math.round(value / step) * step).toFixed(4));

/** Returns `angle` in degrees between -180, exclusive, and 180. */
function normalizeAngle(angle: number): number {
  const turned = ((((angle + 180) % 360) + 360) % 360) - 180;
  return turned === -180 ? 180 : turned;
}

/**
 * Returns the `angle` and `offset` that place the top left corner of the
 * body of the callout of `options` closest to `x`, `y`, in the coordinates
 * of its anchor, which stays where it is: exactly, unless the stem can't
 * reach there. The angle is a multiple of `angleStep` degrees, the nearest to
 * the angle of `options` of those that place the body as close, and the
 * offset is rounded to whole pixels.
 */
export function calloutPlacementAt(
  options: CalloutGeometryOptions,
  x: number,
  y: number,
  angleStep = 1,
): { angle: number; offset: number } {
  const { anchor, anchorSize, width, height, radius, stemSize, stemOffset } =
    normalize(options);
  const preferred = options.angle ?? 0;
  const turnFrom = (angle: number) =>
    Math.abs(normalizeAngle(angle - preferred));
  const candidates: { angle: number; offset: number; error: number }[] = [];
  for (let step = 1; step * angleStep <= 360; step += 1) {
    const angle = normalizeAngle(step * angleStep);
    const edge = edgeForAngle(angle);
    const tip = tipFor(anchor, anchorSize, angle);
    const base = attachmentPoint(
      edge,
      width,
      height,
      radius,
      stemSize,
      stemOffset ?? automaticStemOffset(anchor, edge),
    );
    const vector = direction(angle);
    const offset = Math.max(
      0,
      Math.round(
        (tip.x - x - base.x) * vector.x + (tip.y - y - base.y) * vector.y,
      ),
    );
    const position = positionFor(tip, base, offset, angle);
    candidates.push({
      angle,
      offset,
      error: Math.hypot(position.x - x, position.y - y),
    });
  }
  const closest = Math.min(...candidates.map(({ error }) => error));
  const best = candidates
    .filter(({ error }) => error < closest + 0.01)
    .reduce<(typeof candidates)[number] | undefined>(
      (nearest, candidate) =>
        nearest === undefined ||
        turnFrom(candidate.angle) < turnFrom(nearest.angle)
          ? candidate
          : nearest,
      undefined,
    );
  return { angle: best?.angle ?? preferred, offset: best?.offset ?? 0 };
}

/**
 * Returns the `stemOffset` that moves the base of the stem of the callout of
 * `options` with `geometry` by `distance` along its edge, rounded to `step`,
 * as far as it can be attached there, and as far as the stem can turn to its
 * tip without moving the body, as {@link calloutPlacementAt} turns it.
 */
export function calloutStemOffsetAt(
  options: CalloutGeometryOptions,
  { x, y, edge, stemOffset }: CalloutGeometry,
  distance: number,
  step = 0.05,
): number {
  const { width, height, radius, stemSize } = normalize(options);
  const length = edge === 'top' || edge === 'bottom' ? width : height;
  const inset = radius + stemHalfBase(edge, width, height, radius, stemSize);
  const lowest = Math.min(inset / length, 0.5);
  const target = clamp(
    round(stemOffset + distance / length, step),
    round(Math.ceil(lowest / step) * step, step),
    round(Math.floor((1 - lowest) / step) * step, step),
  );
  const keepsBody = (value: number) => {
    const turned = { ...options, stemOffset: value };
    const placed = calloutGeometry({
      ...turned,
      ...calloutPlacementAt(turned, options.anchorX + x, options.anchorY + y),
    });
    // As close as whole degrees and pixels place it.
    const tolerance = 1 + placed.offset * Math.sin(Math.PI / 360);
    return (
      placed.edge === edge &&
      Math.hypot(placed.x - x, placed.y - y) <= tolerance
    );
  };
  // Steps towards the target, until the body would move.
  const direction = Math.sign(target - stemOffset);
  let reached = stemOffset;
  for (
    let value = round(
      (direction > 0
        ? Math.floor(stemOffset / step + 1e-6) + 1
        : Math.ceil(stemOffset / step - 1e-6) - 1) * step,
      step,
    );
    direction > 0 ? value <= target : value >= target;
    value = round(value + direction * step, step)
  ) {
    if (!keepsBody(value)) {
      break;
    }
    reached = value;
  }
  return reached;
}
