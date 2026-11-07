import {
  getContrastRatio,
  styled,
  useTheme,
  type Theme,
} from '@mui/material/styles';
import type { CSSProperties, JSX, ReactNode } from 'react';

import {
  clampElevation,
  ShadowFilter,
  shadowFilterUrl,
} from '../svg/shadow.tsx';
import { useSvgId } from '../svg/useSvgId.ts';
import type { Editing } from './EditingContext.ts';
import { scaleOf } from './EditLayer.tsx';

/** Screen pixels of the lines and the points of marks. */
export const LINE_WIDTH = 4;
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
/**
 * Colors of marks over dark backgrounds, with their tones swapped, so that
 * their outlines stand out from the background, and their fills from those.
 */
const ON_DARK_FILL_COLOR = '#474847';
const ON_DARK_OUTLINE_COLOR = '#fff';
const ON_DARK_HIGHLIGHTED_OUTLINE_COLOR = '#fff';

/** Depth of the shadow of marks, one of the `shadows` of the theme. */
export const MARK_ELEVATION = 4;

/** Custom property of the color of the outline of a mark. */
const OUTLINE_PROPERTY = '--SeminarEditMark-outline';

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

const BoxMarkRoot = styled('div', {
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
  '&[data-on-dark]': {
    background: ON_DARK_FILL_COLOR,
    [OUTLINE_PROPERTY]: ON_DARK_OUTLINE_COLOR,
  },
  '&[data-on-dark][data-highlighted]': {
    background: HIGHLIGHTED_FILL_COLOR,
    [OUTLINE_PROPERTY]: ON_DARK_HIGHLIGHTED_OUTLINE_COLOR,
  },
}));

const MarkAnchorRoot = styled('div', {
  name: 'SeminarEditMark',
  slot: 'Root',
})({
  position: 'absolute',
  width: 0,
  height: 0,
  pointerEvents: 'none',
});

/** Props of a {@link MarkAnchor}. */
export interface MarkAnchorProps {
  /** Where the anchor is, in the screen pixels of the layer. */
  style: CSSProperties;
  children?: ReactNode;
}

/** Where marks are drawn from, in the screen pixels of the layer. */
export function MarkAnchor({ style, children }: MarkAnchorProps): JSX.Element {
  return (
    <MarkAnchorRoot aria-hidden style={style}>
      {children}
    </MarkAnchorRoot>
  );
}

/** Props of a {@link BoxMark}. */
export interface BoxMarkProps {
  /** What the mark is, e.g., a `square`, or a `vertical` line. */
  shape: string;
  highlighted: boolean;
  swapped: boolean;
  onDark: boolean;
  /** The place, the size, and the outline of the mark around its anchor. */
  style: CSSProperties;
}

/** A mark drawn as a box, e.g., a square, a circle, or a line. */
export function BoxMark({
  shape,
  highlighted,
  swapped,
  onDark,
  style,
}: BoxMarkProps): JSX.Element {
  return (
    <BoxMarkRoot
      {...markAttributes(highlighted, swapped, onDark)}
      data-shape={shape}
      style={style}
    />
  );
}

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
  '&[data-on-dark] [data-part="outline"]': { stroke: ON_DARK_OUTLINE_COLOR },
  '&[data-on-dark] [data-part="fill"]': { fill: ON_DARK_FILL_COLOR },
  '&[data-on-dark][data-highlighted] [data-part="outline"]': {
    stroke: ON_DARK_HIGHLIGHTED_OUTLINE_COLOR,
  },
  '&[data-on-dark][data-highlighted] [data-part="fill"]': {
    fill: HIGHLIGHTED_FILL_COLOR,
  },
}));

/** Props of a {@link DiamondMark}. */
interface DiamondMarkProps {
  highlighted: boolean;
  swapped: boolean;
  onDark: boolean;
  elevation: number;
  opacity: number;
}

/**
 * A diamond around its anchor, in screen pixels, with its tips on whole
 * pixels, casting the shadow of marks like squares do.
 */
export function DiamondMark({
  highlighted,
  swapped,
  onDark,
  elevation,
  opacity,
}: DiamondMarkProps): JSX.Element {
  const theme = useTheme();
  const shadowId = useSvgId('SeminarEditMark-shadow');
  const shadow = markShadow(theme, onDark, elevation);
  const half = DIAMOND_DIAGONAL / 2;
  // With the outline, which reaches beyond the tips.
  const extent = half + OUTLINE_WIDTH * 2;
  const points = `0 ${String(-half)} ${String(half)} 0 0 ${String(half)} ${String(-half)} 0`;
  return (
    <SvgMark
      {...markAttributes(highlighted, swapped, onDark)}
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
function markAttributes(
  highlighted: boolean,
  swapped: boolean,
  onDark: boolean,
) {
  return {
    'data-highlighted': highlighted ? '' : undefined,
    'data-swapped': swapped ? '' : undefined,
    'data-on-dark': onDark ? '' : undefined,
  };
}

/** Whether `color` is dark, so that light outlines stand out more over it. */
export function isDark(color: string | undefined): boolean {
  if (color === undefined || color === '') {
    return false;
  }
  try {
    return getContrastRatio(color, '#fff') > getContrastRatio(color, '#000');
  } catch {
    // Not a color MUI reads, e.g., a gradient.
    return false;
  }
}

/**
 * Returns the place, the size, and the outline of a square or a circle around
 * its anchor, in screen pixels.
 */
export function boxStyle(
  shape: 'square' | 'circle',
  theme: Theme,
  onDark: boolean,
  elevation: number,
): CSSProperties {
  const size = shape === 'square' ? SQUARE_SIZE : CIRCLE_DIAMETER;
  return {
    left: -size / 2,
    top: -size / 2,
    width: size,
    height: size,
    borderRadius: shape === 'circle' ? '50%' : undefined,
    ...outlineStyle(theme, onDark, elevation),
  };
}

/**
 * Returns the shadow that marks at `elevation` cast, from the theme, but none
 * over dark backgrounds, where it can't be seen.
 */
function markShadow(
  theme: Theme,
  onDark = false,
  elevation = MARK_ELEVATION,
): string {
  return onDark
    ? 'none'
    : (theme.shadows[clampElevation(theme, elevation)] ?? 'none');
}

/**
 * Returns the outline that marks are seen with, and their shadow, which can't
 * be seen over dark backgrounds.
 */
export function outlineStyle(
  theme: Theme,
  onDark: boolean,
  elevation: number,
): CSSProperties {
  const shadow = markShadow(theme, onDark, elevation);
  return {
    boxShadow: `0 0 0 ${String(OUTLINE_WIDTH)}px var(${OUTLINE_PROPERTY})${shadow === 'none' ? '' : `, ${shadow}`}`,
  };
}

/**
 * Returns the style of a {@link MarkAnchor} at `x`, `y` in the logical pixels
 * of the slide, moved onto the nearest device pixel.
 */
export function anchorStyle(
  editing: Editing,
  x: number,
  y: number,
): CSSProperties {
  const [left, top] = snapToPixels(editing, x, y);
  return { left, top };
}

/**
 * Returns where `x`, `y` in the logical pixels of the slide being edited is
 * in the screen pixels of the {@link EditLayer}, moved onto the nearest edges
 * of device pixels, so that marks drawn from it in whole screen pixels are
 * crisp, rather than blurred differently on each side.
 */
export function snapToPixels(
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
