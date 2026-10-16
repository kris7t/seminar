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
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  Step,
  type ComponentTheme,
  parseSlidePoint,
  resolveSlidePoint,
  SLIDE_BOX,
  useSlideBox,
  useSlideElement,
  useSlidePoint,
  type SlidePoint,
  type StepProps,
  type StepState,
} from '@slider/core';
import {
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
import { calloutTitleClasses } from './CalloutTitle.tsx';
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
   * What the callout points at: an element, the name of an element on the
   * slide, e.g., `arch` for an image with `{#arch}` in MDX, or nothing, to
   * place it on the slide with `at`. It points at the middle of the top or
   * bottom edge of the element, or at `at` in its box. Unless `in`, `with`,
   * `group`, or `after` is set, the callout is a step nested in the step of
   * the element, or the step enclosing it, if any, and `with="self"` places
   * it where it is instead. The callout itself takes no room where it's
   * rendered.
   */
  anchor?: Element | string | undefined;
  /**
   * Whether the content is blocks, like paragraphs and lists, rather than
   * phrasing content. Blocks are left-aligned by default.
   */
  block?: boolean | undefined;
  /**
   * Alignment of the text. Defaults to `left` for blocks, and to `center`
   * otherwise.
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
  shift?: SlidePoint | undefined;
  /**
   * Point to attach to, as `x,y` from the top left corner of the anchor, or
   * of the slide without one, e.g., `120,80` in logical pixels or `62%,40%`
   * of the size of the box. Defaults to the middle of the slide without an
   * anchor.
   */
  at?: SlidePoint | undefined;
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
  'anchor' | 'origin' | 'positioner' | 'root' | 'background' | 'content';

export const calloutClasses: Record<CalloutClassKey, string> =
  generateUtilityClasses('SliderCallout', [
    'anchor',
    'origin',
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
  block: boolean;
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

/**
 * Where the callout is rendered, which takes no room, and which its bubble is
 * placed relative to.
 */
const CalloutOrigin = styled('span', {
  name: 'SliderCallout',
  slot: 'Origin',
  overridesResolver: (_props, styles) => styles['origin'],
})<{ ownerState: CalloutOwnerState }>({
  position: 'absolute',
  display: 'block',
  width: 0,
  height: 0,
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
  textAlign: ownerState.align ?? 'center',
  variants: [
    {
      // Blocks of container callouts are as far apart as the padding,
      // rather than a line apart like on slides, which would be loose for a
      // bubble. They have no room at the edges, and none below the title,
      // which has room of its own. Margins of the first and last blocks
      // inside blocks, like the paragraphs of list items, would also show at
      // the edges.
      props: { block: true },
      style: {
        textAlign: ownerState.align ?? 'left',
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
  const shift = parseSlidePoint(ownerState.shift);
  const [shiftX, shiftY] =
    shift === undefined ? [0, 0] : resolveSlidePoint(shift, SLIDE_BOX);
  const at = parseSlidePoint(ownerState.at);
  const [atX, atY] =
    at === undefined ? [originX, originY] : resolveSlidePoint(at, SLIDE_BOX);
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
    anchor,
    block = false,
    radius: requestedRadius,
    stemSize: requestedStemSize = DEFAULT_CALLOUT_STEM_SIZE,
    angle,
    offset,
    stemOffset,
    shift,
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
  const targetElement = useSlideElement(anchor);
  const ownerState: CalloutOwnerState = {
    ...props,
    width,
    maxWidth,
    block,
    radius,
    stemSize,
    angle: preferredAngle,
    offset: preferredOffset,
    stemOffset: preferredStemOffset,
    color,
    variant,
    elevation,
  };
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const positionerRef = useRef<HTMLSpanElement>(null);
  const originBox = useSlideBox(origin ?? undefined);
  const anchored = useSlidePoint(targetElement, { at, shift });
  const [size, setSize] = useState<[number, number] | undefined>();
  useLayoutEffect(() => {
    const positioner = positionerRef.current;
    if (positioner === null) return undefined;
    // In logical pixels, since the scale of the slide is a transform.
    const measure = () => {
      setSize((previous) =>
        previous?.[0] === positioner.offsetWidth &&
        previous[1] === positioner.offsetHeight
          ? previous
          : [positioner.offsetWidth, positioner.offsetHeight],
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(positioner);
    return () => {
      observer.disconnect();
    };
  }, []);
  const geometry =
    anchored === undefined || originBox === undefined
      ? initialGeometry(ownerState)
      : fromAnchorOrigin(
          calloutGeometry({
            anchorX: anchored.point[0],
            anchorY: anchored.point[1],
            // Without `at`, callouts point at the top or bottom edge of their
            // anchor, as if it was a character.
            anchorHeight:
              targetElement !== undefined && parseSlidePoint(at) === undefined
                ? anchored.box.height
                : 0,
            width:
              width ??
              (size === undefined || size[0] === 0 ? maxWidth : size[0]),
            height:
              size === undefined || size[1] === 0 ? INITIAL_HEIGHT : size[1],
            radius,
            stemSize,
            angle: preferredAngle,
            offset: preferredOffset,
            stemOffset: preferredStemOffset,
          }),
          anchored.point[0],
          anchored.point[1],
          originBox.x,
          originBox.y,
        );

  // Callouts with blocks are blocks themselves.
  const element = block ? 'div' : 'span';
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
        {body}
      </CalloutContent>
    </>
  );
  const stepChildren =
    typeof children === 'function'
      ? (state: StepState): ReactNode => content(children(state))
      : content(children);

  return (
    <CalloutOrigin
      as={element}
      ref={setOrigin}
      className={calloutClasses.origin}
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
          // Callouts are nested in the step of the element they point at.
          defaultAttachment={
            targetElement === undefined ? undefined : { in: targetElement }
          }
          {...stepProps}
        >
          {stepChildren}
        </CalloutRoot>
      </CalloutPositioner>
    </CalloutOrigin>
  );
}
