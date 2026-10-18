import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useThemeProps,
  type TypographyVariant,
} from '@mui/material/styles';
import {
  Step,
  WITH_PREVIOUS,
  type ComponentTheme,
  type StepProps,
} from '@slider/core';
import type { JSX, ReactNode } from 'react';

import { FIRST_CHILD } from '../selectors.ts';
import { cssLength } from './Columns.tsx';

/** Props of a {@link Column}. */
export interface ColumnProps extends Omit<
  StepProps,
  'component' | 'defaultAttachment' | 'children'
> {
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
  grow?: number | string | undefined;
  children?: ReactNode;
}

export type ColumnClassKey = 'root' | 'heading';

export const columnClasses: Record<ColumnClassKey, string> =
  generateUtilityClasses('SliderColumn', ['root', 'heading']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderColumn: ColumnClassKey;
  }

  interface ComponentsPropsList {
    SliderColumn: ColumnProps;
  }

  interface Components<Theme = unknown> {
    SliderColumn?: ComponentTheme<'SliderColumn', Theme> | undefined;
  }
}

interface ColumnOwnerState {
  width: ColumnProps['width'];
  grow: ColumnProps['grow'];
  headingVariant: TypographyVariant;
}

const ColumnRoot = styled(Step, {
  name: 'SliderColumn',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
})<{ ownerState: ColumnOwnerState }>(({ ownerState }) => {
  const width = cssLength(ownerState.width);
  const grow = Number(ownerState.grow ?? 1);
  return {
    // Columns without a width share the row by their growth, regardless of
    // their content, and may shrink below it.
    flex:
      width === undefined
        ? `${String(Number.isFinite(grow) ? grow : 1)} 1 0`
        : `0 0 ${width}`,
    minWidth: 0,
    // The tops of columns line up, whatever their first blocks are.
    [`& > ${FIRST_CHILD}`]: { marginTop: 0 },
    '& > :last-child': { marginBottom: 0 },
  };
});

const ColumnHeading = styled('h2', {
  name: 'SliderColumn',
  slot: 'Heading',
  overridesResolver: (_props, styles) => styles['heading'],
})<{ ownerState: ColumnOwnerState }>(({ theme, ownerState }) => ({
  ...theme.typography[ownerState.headingVariant],
  marginBlock: '0 0.5em',
  textAlign: 'center',
}));

/**
 * A column of {@link Columns}, e.g., `:::column[Title]` in MDX. It's shown
 * with the previous step, like a paragraph, unless it's a step of its own,
 * e.g., `:::column{step}`, so that columns can be revealed one by one.
 *
 * Can be themed as `SliderColumn` in the `components` of the MUI theme.
 */
export function Column(inProps: ColumnProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderColumn' });
  const {
    heading,
    headingVariant = 'h5',
    width,
    grow,
    className,
    children,
    ...stepProps
  } = props;
  const ownerState: ColumnOwnerState = { width, grow, headingVariant };
  return (
    <ColumnRoot
      defaultAttachment={WITH_PREVIOUS}
      className={`${columnClasses.root}${className === undefined ? '' : ` ${className}`}`}
      ownerState={ownerState}
      {...stepProps}
    >
      {heading !== undefined && heading !== null && (
        <ColumnHeading
          className={columnClasses.heading}
          ownerState={ownerState}
        >
          {heading}
        </ColumnHeading>
      )}
      {children}
    </ColumnRoot>
  );
}
