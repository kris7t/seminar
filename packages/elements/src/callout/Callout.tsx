import { generateUtilityClasses } from '@mui/material';
import {
  decomposeColor,
  recomposeColor,
  styled,
  useTheme,
  useThemeProps,
  type Palette,
  type PaletteColor,
  type TypeText,
} from '@mui/material/styles';
import {
  SLIDE_VIEW_ATTRIBUTE,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  Step,
  type ComponentTheme,
  type DirectiveForm,
  useSlideElement,
  type StepProps,
  type StepState,
} from '@slider/core';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import {
  CALLOUT_SLIDE_MARGIN,
  calloutBounds,
  calloutGeometry,
  type CalloutGeometry,
} from './calloutGeometry.ts';
import { CalloutTitle, calloutTitleClasses } from './CalloutTitle.tsx';
import {
  clampElevation,
  ShadowFilter,
  shadowFilterUrl,
} from '../utils/shadow.tsx';
import { useSvgId } from '../utils/useSvgId.ts';

export const DEFAULT_CALLOUT_MAX_WIDTH = 360;
export const DEFAULT_CALLOUT_STEM_SIZE = 36;
export const DEFAULT_CALLOUT_ELEVATION = 4;

/**
 * Keys of the MUI theme palette whose values are palette colors, like
 * `primary`, or text colors of the palette, like `text.secondary`.
 */
export type CalloutColor =
  | {
      [Key in keyof Palette]: Palette[Key] extends PaletteColor ? Key : never;
    }[keyof Palette]
  | `text.${Extract<keyof TypeText, string>}`;

/** Further visual variants of callouts, added by module augmentation. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Augmented by themes.
export interface CalloutVariantOverrides {}

/** Visual treatment of a callout, independently of its step behavior. */
export type CalloutVariant =
  | 'filled'
  | 'outlined'
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Empty unless augmented.
  | keyof CalloutVariantOverrides;

/** Alignment of the text in a callout. */
export type CalloutAlign =
  'left' | 'center' | 'right' | 'justify' | 'start' | 'end';

/**
 * A point as `x,y`, as an MDX-friendly string or a JSX tuple. Numbers are
 * logical slide pixels, and percentages, like `50%`, fractions of a box.
 */
export type CalloutPoint = string | readonly [number | string, number | string];

/** Props of a speech bubble callout, which behaves like a step. */
export interface CalloutProps extends Omit<
  StepProps,
  'children' | 'color' | 'defaultBehavior'
> {
  /**
   * Width of the rounded body in logical slide pixels. Without it, the body
   * fits its text, up to `maxWidth`.
   */
  width?: number | undefined;
  /**
   * Width of the body without `width`, beyond which its text breaks into
   * lines. Defaults to 360.
   */
  maxWidth?: number | undefined;
  /**
   * How the callout was written in MDX, which the `callout` directive sets:
   * `text` (the default) for `:callout[…]` in the text, `leaf` for
   * `::callout[…]` on a line of its own, and `container` for `:::callout`
   * with Markdown content. Leaf and container callouts take no room on the
   * slide, so they can point anywhere with `at`.
   */
  directive?: DirectiveForm | undefined;
  /**
   * Title shown above the content as a {@link CalloutTitle}, e.g., the label
   * of a `:::callout[…]` directive.
   */
  heading?: ReactNode;
  /**
   * Alignment of the text. Defaults to `left` for container callouts, and to
   * `center` otherwise.
   */
  align?: CalloutAlign | undefined;
  /** Corner radius of the body. Defaults to twice the theme shape radius. */
  radius?: number | undefined;
  /** Width of the stem at the body, and its default length. */
  stemSize?: number | undefined;
  /**
   * Direction from the bubble body to the directive anchor, in degrees. `0`
   * selects the right edge and `90` the bottom edge. Omit it for automatic
   * fitting; an explicit value is exact even when the bubble is clipped.
   */
  angle?: number | undefined;
  /** Stem length from the body to the anchor. Defaults to `stemSize`. */
  offset?: number | undefined;
  /**
   * Attachment position along the selected edge, from 0 to 1. Defaults to an
   * automatically mirrored 0.3 or 0.7.
   */
  stemOffset?: number | undefined;
  /** Shift from the character-box attachment, as `x,y` logical pixels. */
  shift?: CalloutPoint | undefined;
  /**
   * Name of the element on the slide to point at, e.g., `arch` for an image
   * with `{#arch}` in MDX. The callout points at the middle of its top or
   * bottom edge, or at `at` in its box. Unless `in`, `with`, `group`, or
   * `after` is set, the callout is a step nested in the step of the element,
   * or the step enclosing it, if any.
   */
  for?: string | undefined;
  /**
   * Point to attach to, as `x,y` from the top left corner of the slide, or of
   * the element named by `for`, e.g., `120,80` in logical pixels or `62%,40%`
   * of the size of the box.
   */
  at?: CalloutPoint | undefined;
  /**
   * MUI palette color of the bubble, like `primary`, or a text color, like
   * `text.secondary`.
   */
  color?: CalloutColor | undefined;
  /** Visual treatment of the bubble. Defaults to `filled`. */
  variant?: CalloutVariant | undefined;
  /**
   * Shadow depth of the bubble, from 0 to 24, which selects one of the
   * `shadows` of the MUI theme, like the `elevation` of a `Paper`. Defaults
   * to 4.
   */
  elevation?: number | undefined;
  children?: StepProps['children'];
}

export type CalloutClassKey =
  'anchor' | 'positioner' | 'root' | 'background' | 'content';

export const calloutClasses: Record<CalloutClassKey, string> =
  generateUtilityClasses('SliderCallout', [
    'anchor',
    'positioner',
    'root',
    'background',
    'content',
  ]);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderCallout: CalloutClassKey;
  }

  interface ComponentsPropsList {
    SliderCallout: CalloutProps;
  }

  interface Components<Theme = unknown> {
    SliderCallout?: ComponentTheme<'SliderCallout', Theme> | undefined;
  }
}

interface CalloutOwnerState extends CalloutProps {
  color: CalloutColor;
  variant: CalloutVariant;
  elevation: number;
  /** Width of the body, or `undefined` to fit its text up to `maxWidth`. */
  width: number | undefined;
  maxWidth: number;
  align: CalloutAlign;
  directive: DirectiveForm;
  radius: number;
  stemSize: number;
}

interface PaletteColorLike {
  main: string;
  light?: string | undefined;
  dark?: string | undefined;
  contrastText?: string | undefined;
}

function paletteColor(
  palette: Palette,
  color: string,
): PaletteColorLike | undefined {
  const value = (palette as unknown as Record<PropertyKey, unknown>)[color];
  return typeof value === 'object' &&
    value !== null &&
    'main' in value &&
    typeof value.main === 'string'
    ? (value as PaletteColorLike)
    : undefined;
}

/** Composes a translucent `color` over `background` into an opaque color. */
function opaque(color: string, background: string): string {
  const { values } = decomposeColor(color);
  const alpha = values[3] ?? 1;
  if (alpha >= 1) return color;
  const under = decomposeColor(background).values;
  return recomposeColor({
    type: 'rgb',
    values: [0, 1, 2].map((i) =>
      Math.round((values[i] ?? 0) * alpha + (under[i] ?? 0) * (1 - alpha)),
    ) as [number, number, number],
  });
}

/**
 * Palette colors for the text colors of the palette, opaque over the paper
 * background, so that filled callouts don't let the slide show through.
 */
function textColors(palette: Palette): [CalloutColor, PaletteColorLike][] {
  return Object.entries(palette.text).flatMap(([key, value]) => {
    if (typeof value !== 'string') return [];
    let main: string;
    try {
      main = opaque(value, palette.background.paper);
    } catch {
      return [];
    }
    return [[`text.${key}` as CalloutColor, { main }]];
  });
}

const CalloutAnchor = styled('span', {
  name: 'SliderCallout',
  slot: 'Anchor',
  overridesResolver: (_props, styles) => styles['anchor'],
})<{ ownerState: CalloutOwnerState }>({
  position: 'relative',
  display: 'inline-block',
  width: 0,
  height: '1em',
  verticalAlign: 'text-bottom',
  variants: [
    {
      // Takes no room between the blocks around it, and points at where
      // the next one starts, unless `at` is set.
      props: ({ directive }) => directive !== 'text',
      style: { position: 'absolute', display: 'block', height: 0 },
    },
  ],
});

const CalloutPositioner = styled('span', {
  name: 'SliderCallout',
  slot: 'Positioner',
  overridesResolver: (_props, styles) => styles['positioner'],
})<{ ownerState: CalloutOwnerState }>(({ ownerState }) => ({
  position: 'absolute',
  zIndex: 1,
  top: '50%',
  left: 0,
  display: 'block',
  ...(ownerState.width === undefined
    ? { width: 'max-content', maxWidth: ownerState.maxWidth }
    : { width: ownerState.width }),
}));

const CalloutRoot = styled(Step, {
  name: 'SliderCallout',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
})<{ ownerState: CalloutOwnerState }>(({ theme }) => {
  const colors: [CalloutColor, PaletteColorLike][] = [
    ...Object.keys(theme.palette).flatMap(
      (color): [CalloutColor, PaletteColorLike][] => {
        const selected = paletteColor(theme.palette, color);
        return selected === undefined
          ? []
          : [[color as CalloutColor, selected]];
      },
    ),
    ...textColors(theme.palette),
  ];
  const colorVariants = colors.map(([color, selected]) => ({
    props: { color },
    style: {
      '--SliderCallout-palette-main': selected.main,
      '--SliderCallout-palette-light': selected.light ?? selected.main,
      '--SliderCallout-palette-dark': selected.dark ?? selected.main,
      '--SliderCallout-palette-contrastText':
        selected.contrastText ?? theme.palette.getContrastText(selected.main),
    },
  }));
  return {
    position: 'relative',
    display: 'block',
    boxSizing: 'border-box',
    width: '100%',
    color: 'var(--SliderCallout-color)',
    variants: [
      {
        props: { variant: 'filled' },
        style: {
          '--SliderCallout-background': 'var(--SliderCallout-palette-main)',
          '--SliderCallout-color': 'var(--SliderCallout-palette-contrastText)',
          '--SliderCallout-outline': 'transparent',
          '--SliderCallout-outline-width': 0,
        },
      },
      {
        props: { variant: 'outlined' },
        style: {
          '--SliderCallout-background': theme.palette.background.paper,
          '--SliderCallout-color': 'var(--SliderCallout-palette-main)',
          '--SliderCallout-outline': 'var(--SliderCallout-palette-main)',
          '--SliderCallout-outline-width': 2,
        },
      },
      ...colorVariants,
    ],
  };
});

const CalloutBackground = styled('svg', {
  name: 'SliderCallout',
  slot: 'Background',
  overridesResolver: (_props, styles) => styles['background'],
})<{ ownerState: CalloutOwnerState }>({
  position: 'absolute',
  zIndex: -1,
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  overflow: 'visible',
  pointerEvents: 'none',
  fill: 'var(--SliderCallout-background)',
  stroke: 'var(--SliderCallout-outline)',
  strokeWidth: 'var(--SliderCallout-outline-width)',
  strokeLinejoin: 'round',
});

const CalloutContent = styled('span', {
  name: 'SliderCallout',
  slot: 'Content',
  overridesResolver: (_props, styles) => styles['content'],
})<{ ownerState: CalloutOwnerState }>(({ theme, ownerState }) => ({
  position: 'relative',
  zIndex: 0,
  display: 'block',
  padding: theme.spacing(1, 1.5),
  textAlign: ownerState.align,
  variants: [
    {
      // Blocks of container callouts are as far apart as the padding,
      // rather than a line apart like on slides, which would be loose for a
      // bubble. They have no room at the edges, and none below the title,
      // which has room of its own. Margins of the first and last blocks
      // inside blocks, like the paragraphs of list items, would also show at
      // the edges.
      props: { directive: 'container' },
      style: {
        '& :is(p, ul, ol, dl, blockquote, pre, figure, table)': {
          marginBlock: theme.spacing(1),
        },
        [[1, 2, 3]
          .map((depth) => `& ${'> :first-child '.repeat(depth)}`)
          .concat(`& > .${calloutTitleClasses.root} + *`)
          .join(', ')]: { marginTop: 0 },
        [[1, 2, 3]
          .map((depth) => `& ${'> :last-child '.repeat(depth)}`)
          .join(', ')]: { marginBottom: 0 },
      },
    },
  ],
}));

const INITIAL_HEIGHT = 64;

function finiteNumber(value: unknown, fallback: number): number {
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : fallback;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : undefined;
}

function calloutPoint(
  value: CalloutPoint | undefined,
): [number, number] | undefined {
  const parts =
    typeof value === 'string' ? value.trim().split(/[\s,]+/) : value;
  if (parts?.length !== 2) return undefined;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined;
}

/** A box in logical slide pixels. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SLIDE_BOX: Box = { x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT };

/** A coordinate in logical pixels, or as a fraction of the size of a box. */
interface Coordinate {
  value: number;
  relative: boolean;
}

function coordinate(
  value: number | string | undefined,
): Coordinate | undefined {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  const relative = text.endsWith('%');
  const number = Number(relative ? text.slice(0, -1) : text);
  if (text === '' || !Number.isFinite(number)) return undefined;
  return { value: relative ? number / 100 : number, relative };
}

/** Parses a point that may be relative to a box, see {@link CalloutPoint}. */
function relativePoint(
  value: CalloutPoint | undefined,
): [Coordinate, Coordinate] | undefined {
  const parts =
    typeof value === 'string' ? value.trim().split(/[\s,]+/) : value;
  if (parts?.length !== 2) return undefined;
  const x = coordinate(parts[0]);
  const y = coordinate(parts[1]);
  return x === undefined || y === undefined ? undefined : [x, y];
}

/** Returns `point` in logical slide pixels, relative to `box`. */
function resolvePoint(
  [x, y]: [Coordinate, Coordinate],
  box: Box,
): [number, number] {
  return [
    box.x + (x.relative ? x.value * box.width : x.value),
    box.y + (y.relative ? y.value * box.height : y.value),
  ];
}

function fromAnchorOrigin(
  geometry: CalloutGeometry,
  anchorX: number,
  anchorY: number,
  originX: number,
  originY: number,
): CalloutGeometry {
  return {
    ...geometry,
    x: geometry.x + anchorX - originX,
    y: geometry.y + anchorY - originY,
  };
}

function initialGeometry(ownerState: CalloutOwnerState): CalloutGeometry {
  const originX = SLIDE_WIDTH / 2;
  const originY = SLIDE_HEIGHT / 2;
  const [shiftX, shiftY] = calloutPoint(ownerState.shift) ?? [0, 0];
  const at = relativePoint(ownerState.at);
  const [atX, atY] =
    at === undefined ? [originX, originY] : resolvePoint(at, SLIDE_BOX);
  const anchorX = atX + shiftX;
  const anchorY = atY + shiftY;
  const geometry = calloutGeometry({
    anchorX,
    anchorY,
    width: ownerState.width ?? ownerState.maxWidth,
    height: INITIAL_HEIGHT,
    radius: ownerState.radius,
    stemSize: ownerState.stemSize,
    angle: ownerState.angle,
    offset: ownerState.offset,
    stemOffset: ownerState.stemOffset,
  });
  return fromAnchorOrigin(geometry, anchorX, anchorY, originX, originY);
}

function sameGeometry(left: CalloutGeometry, right: CalloutGeometry): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.angle === right.angle &&
    left.tipX === right.tipX &&
    left.tipY === right.tipY &&
    left.path === right.path
  );
}

/**
 * A speech bubble anchored to its position in the text. Its body and stem are
 * drawn as an SVG path and placed in the logical coordinate space of the
 * slide, before the slide is scaled for display.
 *
 * The callout participates in the steps of its slide and uses the `scoped`
 * behavior unless `behavior` or a behavior shorthand is set. Geometry, color,
 * and visual variant may be set directly or through the MUI theme.
 */
export function Callout(inProps: CalloutProps): JSX.Element {
  const theme = useTheme();
  const props = useThemeProps({ props: inProps, name: 'SliderCallout' });
  const {
    width: requestedWidth,
    maxWidth: requestedMaxWidth = DEFAULT_CALLOUT_MAX_WIDTH,
    directive = 'text',
    align = directive === 'container' ? 'left' : 'center',
    heading,
    radius: requestedRadius,
    stemSize: requestedStemSize = DEFAULT_CALLOUT_STEM_SIZE,
    angle,
    offset,
    stemOffset,
    shift,
    for: target,
    at,
    color = 'primary',
    variant = 'filled',
    elevation: requestedElevation = DEFAULT_CALLOUT_ELEVATION,
    className,
    children,
    ...stepProps
  } = props;
  // Callouts stay narrower than the slide.
  const bodyWidth = (value: number) =>
    Math.min(Math.max(value, 1), SLIDE_WIDTH - CALLOUT_SLIDE_MARGIN * 2);
  const requestedExactWidth = optionalFiniteNumber(requestedWidth);
  const width =
    requestedExactWidth === undefined
      ? undefined
      : bodyWidth(requestedExactWidth);
  const maxWidth = bodyWidth(
    finiteNumber(requestedMaxWidth, DEFAULT_CALLOUT_MAX_WIDTH),
  );
  const radius = Math.max(
    finiteNumber(
      requestedRadius ?? Number(theme.shape.borderRadius) * 2,
      Number(theme.shape.borderRadius) * 2,
    ),
    0,
  );
  const stemSize = Math.max(
    finiteNumber(requestedStemSize, DEFAULT_CALLOUT_STEM_SIZE),
    0,
  );
  const elevation = clampElevation(
    theme,
    finiteNumber(requestedElevation, DEFAULT_CALLOUT_ELEVATION),
  );
  const preferredAngle = optionalFiniteNumber(angle);
  const preferredOffset = optionalFiniteNumber(offset);
  const preferredStemOffset = optionalFiniteNumber(stemOffset);
  const preferredShift = calloutPoint(shift);
  const absoluteAnchor = relativePoint(at);
  const targetElement = useSlideElement(target);
  // Callouts pointing at an element are nested in its step, unless they are
  // placed otherwise.
  const nestInTarget =
    targetElement !== undefined &&
    stepProps.in === undefined &&
    stepProps.with === undefined &&
    stepProps.group === undefined &&
    stepProps.after === undefined;
  const ownerState: CalloutOwnerState = {
    ...props,
    width,
    maxWidth,
    align,
    directive,
    radius,
    stemSize,
    angle: preferredAngle,
    offset: preferredOffset,
    stemOffset: preferredStemOffset,
    shift: preferredShift,
    color,
    variant,
    elevation,
  };
  const anchorRef = useRef<HTMLSpanElement>(null);
  const positionerRef = useRef<HTMLSpanElement>(null);
  const [geometry, setGeometry] = useState(() => initialGeometry(ownerState));

  const updateGeometry = useCallback(() => {
    const anchor = anchorRef.current;
    const positioner = positionerRef.current;
    const frame = anchor?.closest<HTMLElement>(`[${SLIDE_VIEW_ATTRIBUTE}]`);
    if (
      anchor === null ||
      positioner === null ||
      frame === undefined ||
      frame === null
    )
      return;
    const frameRect = frame.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const scale = frameRect.width / SLIDE_WIDTH || 1;
    const measuredAnchorX =
      (anchorRect.left + anchorRect.width / 2 - frameRect.left) / scale;
    const measuredAnchorY =
      (anchorRect.top + anchorRect.height / 2 - frameRect.top) / scale;
    const targetRect = targetElement?.getBoundingClientRect();
    // The box that `at` is relative to.
    const box: Box =
      targetRect === undefined
        ? SLIDE_BOX
        : {
            x: (targetRect.left - frameRect.left) / scale,
            y: (targetRect.top - frameRect.top) / scale,
            width: targetRect.width / scale,
            height: targetRect.height / scale,
          };
    const [shiftX, shiftY] = preferredShift ?? [0, 0];
    // Without `at`, the callout points at an edge of its target, or of the
    // characters around its anchor, as if the target was a character.
    const [atX, atY] =
      absoluteAnchor !== undefined
        ? resolvePoint(absoluteAnchor, box)
        : targetRect !== undefined
          ? [box.x + box.width / 2, box.y + box.height / 2]
          : [measuredAnchorX, measuredAnchorY];
    const anchorX = atX + shiftX;
    const anchorY = atY + shiftY;
    const next = fromAnchorOrigin(
      calloutGeometry({
        anchorX,
        anchorY,
        anchorHeight:
          absoluteAnchor !== undefined
            ? 0
            : targetRect !== undefined
              ? box.height
              : anchorRect.height / scale,
        width: width ?? (positioner.offsetWidth || maxWidth),
        height: positioner.offsetHeight || INITIAL_HEIGHT,
        radius,
        stemSize,
        angle: preferredAngle,
        offset: preferredOffset,
        stemOffset: preferredStemOffset,
      }),
      anchorX,
      anchorY,
      measuredAnchorX,
      measuredAnchorY,
    );
    setGeometry((previous) => (sameGeometry(previous, next) ? previous : next));
  }, [
    preferredAngle,
    preferredOffset,
    preferredStemOffset,
    absoluteAnchor,
    preferredShift,
    targetElement,
    radius,
    stemSize,
    width,
    maxWidth,
  ]);

  useLayoutEffect(() => {
    updateGeometry();
    const positioner = positionerRef.current;
    const observer =
      positioner === null || typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(updateGeometry);
    if (positioner !== null) observer?.observe(positioner);
    if (targetElement !== undefined) observer?.observe(targetElement);
    window.addEventListener('resize', updateGeometry);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateGeometry);
    };
  }, [updateGeometry, targetElement]);

  // Containers hold blocks, like paragraphs and lists.
  const element = directive === 'container' ? 'div' : 'span';
  const shadowId = useSvgId('SliderCallout-shadow');
  const shadow = theme.shadows[elevation] ?? 'none';

  const content = (body: ReactNode): ReactNode => (
    <>
      <CalloutBackground
        aria-hidden
        className={calloutClasses.background}
        ownerState={ownerState}
        viewBox={`0 0 ${String(geometry.width)} ${String(geometry.height)}`}
      >
        <defs>
          <ShadowFilter
            id={shadowId}
            shadow={shadow}
            bounds={calloutBounds(geometry)}
          />
        </defs>
        <path d={geometry.path} filter={shadowFilterUrl(shadowId, shadow)} />
      </CalloutBackground>
      <CalloutContent
        as={element}
        className={calloutClasses.content}
        ownerState={ownerState}
      >
        {heading !== undefined && <CalloutTitle>{heading}</CalloutTitle>}
        {body}
      </CalloutContent>
    </>
  );
  const stepChildren =
    typeof children === 'function'
      ? (state: StepState): ReactNode => content(children(state))
      : content(children);

  return (
    <CalloutAnchor
      as={element}
      ref={anchorRef}
      className={calloutClasses.anchor}
      ownerState={ownerState}
    >
      <CalloutPositioner
        as={element}
        ref={positionerRef}
        className={calloutClasses.positioner}
        ownerState={ownerState}
        style={{
          transform: `translate(${String(geometry.x)}px, ${String(geometry.y)}px)`,
        }}
      >
        <CalloutRoot
          component={element}
          defaultBehavior="scoped"
          className={`${calloutClasses.root}${className === undefined ? '' : ` ${className}`}`}
          ownerState={ownerState}
          {...stepProps}
          {...(nestInTarget && { in: targetElement })}
        >
          {stepChildren}
        </CalloutRoot>
      </CalloutPositioner>
    </CalloutAnchor>
  );
}
