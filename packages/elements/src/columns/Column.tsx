import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useTheme,
  useThemeProps,
  type TypographyVariant,
} from '@mui/material/styles';
import {
  clampElevation,
  Step,
  JOINS_CONTENT,
  useSlideView,
  type ComponentTheme,
  type StepProps,
} from '@seminar/core';
import { use, type JSX, type ReactNode } from 'react';

import { paletteColorVariants } from '../paletteColors.ts';
import { FIRST_CHILD } from '../selectors.ts';
import {
  columnAppearance,
  ColumnsAppearanceContext,
  type ColumnAppearance,
  type ColumnColor,
  type ColumnVariant,
} from './columnAppearance.ts';
import { cssLength } from './Columns.tsx';

/**
 * Props of a {@link Column}. Its `color`, `variant`, `elevation`, and
 * `radius` default to those of its {@link Columns}.
 */
export interface ColumnProps
  extends
    Omit<StepProps, 'component' | 'defaults' | 'children' | 'color'>,
    ColumnAppearance {
  /**
   * Title shown centered above the column, e.g., the label of a
   * `:::column[Title]` directive.
   */
  heading?: ReactNode;
  /** Typography variant of the theme for the title. Defaults to `h5`. */
  headingVariant?: TypographyVariant | undefined;
  /**
   * Width of the column, in logical slide pixels, e.g., `400`, or any CSS
   * length, e.g., `40%`. Without it, the column shares the width of the row
   * with the others.
   */
  width?: number | string | undefined;
  /**
   * How much of the width of the row the column takes, compared to the other
   * columns without a width, e.g., `2` for twice as much. Defaults to 1.
   */
  grow?: number | undefined;
  children?: ReactNode;
}

export type ColumnClassKey = 'root' | 'content' | 'heading';

export const columnClasses: Record<ColumnClassKey, string> =
  generateUtilityClasses('SeminarColumn', ['root', 'content', 'heading']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarColumn: ColumnClassKey;
  }

  interface ComponentsPropsList {
    SeminarColumn: ColumnProps;
  }

  interface Components<Theme = unknown> {
    SeminarColumn?: ComponentTheme<'SeminarColumn', Theme> | undefined;
  }
}

interface ColumnOwnerState {
  width: ColumnProps['width'];
  grow: ColumnProps['grow'];
  headingVariant: TypographyVariant;
  color: ColumnColor;
  variant: ColumnVariant;
  elevation: number;
  radius: number;
}

const ColumnRoot = styled(Step, {
  name: 'SeminarColumn',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
})<{ ownerState: ColumnOwnerState }>(({ theme, ownerState }) => {
  const width = cssLength(ownerState.width);
  const grow = ownerState.grow ?? 1;
  return {
    // Columns without a width share the row by their growth, regardless of
    // their content, and may shrink below it.
    flex:
      width === undefined
        ? `${String(Number.isFinite(grow) ? grow : 1)} 1 0`
        : `0 0 ${width}`,
    minWidth: 0,
    boxSizing: 'border-box',
    '--SeminarColumn-background': 'transparent',
    '--SeminarColumn-padding': '0px',
    backgroundColor: 'var(--SeminarColumn-background)',
    borderRadius: ownerState.radius,
    boxShadow: theme.shadows[ownerState.elevation],
    variants: [
      {
        props: { variant: 'plain' },
        style: {
          '--SeminarColumn-heading-color': 'var(--SeminarColumn-palette-main)',
          '--SeminarColumn-heading-background': 'transparent',
        },
      },
      {
        // Shadows need something to cast them.
        props: ({ variant, elevation }: ColumnOwnerState) =>
          variant === 'plain' && elevation > 0,
        style: {
          '--SeminarColumn-background': theme.palette.background.paper,
          '--SeminarColumn-padding': theme.spacing(3),
        },
      },
      {
        props: { variant: 'card' },
        style: {
          '--SeminarColumn-background': `color-mix(in srgb, var(--SeminarColumn-palette-main) 10%, ${theme.palette.background.paper})`,
          '--SeminarColumn-heading-color':
            'var(--SeminarColumn-palette-contrastText)',
          '--SeminarColumn-heading-background':
            'var(--SeminarColumn-palette-main)',
          '--SeminarColumn-padding': theme.spacing(3),
        },
      },
      ...paletteColorVariants(theme, 'SeminarColumn'),
    ],
  };
});

// The padding is inside the content, so that it doesn't take from the share
// of the row of the column.
const ColumnContent = styled('div', {
  name: 'SeminarColumn',
  slot: 'Content',
  overridesResolver: (_props, styles) => styles['content'],
})<{ ownerState: ColumnOwnerState }>({
  padding: 'var(--SeminarColumn-padding)',
  // The tops of columns line up, whatever their first blocks are. Titles
  // are placed by their own styles.
  [`& > ${FIRST_CHILD}:not(.${columnClasses.heading})`]: { marginTop: 0 },
  '& > :last-child': { marginBottom: 0 },
});

const ColumnHeading = styled('h2', {
  name: 'SeminarColumn',
  slot: 'Heading',
  overridesResolver: (_props, styles) => styles['heading'],
})<{ ownerState: ColumnOwnerState }>(({ theme, ownerState }) => ({
  ...theme.typography[ownerState.headingVariant],
  marginBlock: '0 0.5em',
  textAlign: 'center',
  color: 'var(--SeminarColumn-heading-color)',
  backgroundColor: 'var(--SeminarColumn-heading-background)',
  variants: [
    {
      // A band across the top of the column.
      props: { variant: 'card' },
      style: {
        margin:
          'calc(-1 * var(--SeminarColumn-padding)) calc(-1 * var(--SeminarColumn-padding)) var(--SeminarColumn-padding)',
        padding: `${theme.spacing(1)} var(--SeminarColumn-padding)`,
        borderRadius: `${String(ownerState.radius)}px ${String(ownerState.radius)}px 0 0`,
      },
    },
  ],
}));

/**
 * A column of {@link Columns}, e.g., `:::column[Title]` in MDX. It's shown
 * with the previous step, like a paragraph, unless it's a step of its own,
 * e.g., `:::column{step}`, so that columns can be revealed one by one.
 *
 * Its color, variant, elevation, and radius are, in order of precedence, its
 * own, those set on its `Columns`, the defaults of `SeminarColumn` in the
 * theme, and then the defaults of `SeminarColumns` in the theme.
 *
 * Can be themed as `SeminarColumn` in the `components` of the MUI theme.
 */
export function Column(inProps: ColumnProps): JSX.Element {
  const theme = useTheme();
  const columns = use(ColumnsAppearanceContext);
  const props = useThemeProps({
    props: { ...inProps, ...columns?.props, ...columnAppearance(inProps) },
    name: 'SeminarColumn',
  });
  const {
    heading,
    headingVariant = 'h5',
    width,
    grow,
    color = columns?.defaults.color ?? 'primary',
    variant = columns?.defaults.variant ?? 'plain',
    elevation = columns?.defaults.elevation ?? 0,
    radius = columns?.defaults.radius,
    className,
    children,
    ...stepProps
  } = props;
  const defaultRadius = Number(theme.shape.borderRadius) * 2;
  const ownerState: ColumnOwnerState = {
    width,
    grow,
    headingVariant,
    color,
    variant,
    elevation: clampElevation(theme, elevation),
    radius: Math.max(
      Number.isFinite(radius) ? Number(radius) : defaultRadius,
      0,
    ),
  };
  // Below the headings of the slides in documents.
  const { kind } = useSlideView();
  return (
    <ColumnRoot
      defaults={JOINS_CONTENT}
      className={`${columnClasses.root}${className === undefined ? '' : ` ${className}`}`}
      ownerState={ownerState}
      {...stepProps}
    >
      <ColumnContent className={columnClasses.content} ownerState={ownerState}>
        {heading !== undefined && heading !== null && (
          <ColumnHeading
            as={kind === 'document' ? 'h5' : undefined}
            className={columnClasses.heading}
            ownerState={ownerState}
          >
            {heading}
          </ColumnHeading>
        )}
        {children}
      </ColumnContent>
    </ColumnRoot>
  );
}
