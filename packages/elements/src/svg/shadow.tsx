import type { Theme } from '@mui/material/styles';
import { Fragment, type JSX } from 'react';

/** One layer of a CSS box shadow, in pixels. */
export interface ShadowLayer {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
}

/** Splits `value` at the top-level occurrences of `separator`. */
function splitTopLevel(value: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (depth === 0 && separator.test(char)) {
      parts.push(part);
      part = '';
    } else {
      part += char;
    }
  }
  parts.push(part);
  return parts.map((item) => item.trim()).filter((item) => item !== '');
}

function pixels(token: string): number | undefined {
  const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(px)?$/.exec(token);
  if (match === null || (match[2] === undefined && Number(match[1]) !== 0)) {
    return undefined;
  }
  return Number(match[1]);
}

/**
 * Parses the outer layers of a CSS `box-shadow`, like the `shadows` of an MUI
 * theme. Inset layers, and layers with lengths other than pixels, are left
 * out.
 */
export function parseBoxShadow(shadow: string): ShadowLayer[] {
  if (shadow.trim() === 'none') return [];
  return splitTopLevel(shadow, /,/).flatMap((layer) => {
    const lengths: number[] = [];
    const colors: string[] = [];
    for (const token of splitTopLevel(layer, /\s/)) {
      if (token === 'inset') return [];
      const length = pixels(token);
      if (length === undefined) colors.push(token);
      else if (colors.length > 0) return [];
      else lengths.push(length);
    }
    const [offsetX, offsetY, blur = 0, spread = 0] = lengths;
    if (
      offsetX === undefined ||
      offsetY === undefined ||
      lengths.length > 4 ||
      colors.length > 1
    ) {
      return [];
    }
    return [
      {
        offsetX,
        offsetY,
        blur: Math.max(blur, 0),
        spread,
        color: colors[0] ?? 'currentColor',
      },
    ];
  });
}

/** How far the layers reach beyond the shape they shadow. */
export function shadowExtent(layers: readonly ShadowLayer[]): number {
  return Math.max(
    0,
    ...layers.map(
      ({ offsetX, offsetY, blur, spread }) =>
        Math.max(Math.abs(offsetX), Math.abs(offsetY)) + blur + spread,
    ),
  );
}

/**
 * Rounds `elevation` and clamps it to the `shadows` of `theme`, like the
 * `elevation` of an MUI `Paper`.
 */
export function clampElevation(theme: Theme, elevation: number): number {
  return Math.min(
    Math.max(Number.isFinite(elevation) ? Math.round(elevation) : 0, 0),
    theme.shadows.length - 1,
  );
}

/** A rectangle in the user space of an SVG element. */
export interface SvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShadowFilterProps {
  /** Id of the filter, which shapes refer to with {@link shadowFilterUrl}. */
  id: string;
  /** A CSS box shadow, e.g., one of the `shadows` of the MUI theme. */
  shadow: string;
  /**
   * Bounds of the shapes casting the shadow, which the filter region extends
   * by the reach of the shadow.
   */
  bounds: SvgBounds;
}

/**
 * Returns the `filter` attribute for shapes casting `shadow` with the
 * {@link ShadowFilter} `id`, or `undefined` if there's no shadow to cast.
 */
export function shadowFilterUrl(
  id: string,
  shadow: string,
): string | undefined {
  return parseBoxShadow(shadow).length > 0 ? `url(#${id})` : undefined;
}

/**
 * An SVG filter that casts a CSS box shadow from the shapes it's applied to,
 * like MUI casts its `shadows` from boxes, for elements that aren't boxes.
 * Unlike chained CSS `drop-shadow` filters, each layer is cast by the shapes
 * themselves, and spread like box shadows are. Renders nothing if there's no
 * shadow to cast.
 */
export function ShadowFilter({
  id,
  shadow,
  bounds,
}: ShadowFilterProps): JSX.Element | null {
  // Names the result of each layer in the filter.
  const layers = parseBoxShadow(shadow).map((layer, i) => ({
    ...layer,
    name: `layer${String(i)}`,
  }));
  if (layers.length === 0) return null;
  const extent = shadowExtent(layers);
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={bounds.x - extent}
      y={bounds.y - extent}
      width={bounds.width + extent * 2}
      height={bounds.height + extent * 2}
      colorInterpolationFilters="sRGB"
    >
      {layers.map(({ offsetX, offsetY, blur, spread, color, name }) => (
        <Fragment key={name}>
          {spread !== 0 && (
            <feMorphology
              in="SourceAlpha"
              operator={spread > 0 ? 'dilate' : 'erode'}
              radius={Math.abs(spread)}
            />
          )}
          <feGaussianBlur
            {...(spread === 0 && { in: 'SourceAlpha' })}
            stdDeviation={blur / 2}
          />
          <feOffset dx={offsetX} dy={offsetY} result={`${name}-offset`} />
          <feFlood floodColor={color} />
          <feComposite in2={`${name}-offset`} operator="in" result={name} />
        </Fragment>
      ))}
      <feMerge>
        {/* Earlier layers of box shadows are on top. */}
        {layers
          .map(({ name }) => <feMergeNode key={name} in={name} />)
          .reverse()}
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}
