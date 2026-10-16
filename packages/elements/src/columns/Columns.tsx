import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import type { ComponentTheme } from '@slider/core';
import type { ComponentProps, JSX } from 'react';

/** Alignment of the columns of {@link Columns} across the row. */
export type ColumnsAlign = 'start' | 'center' | 'end' | 'stretch';

/** Props of {@link Columns}. */
export interface ColumnsProps extends ComponentProps<'div'> {
  /**
   * Space between the columns, in logical slide pixels, e.g., `48`, or any
   * CSS length. Defaults to the spacing of the theme times 4.
   */
  gap?: number | string | undefined;
  /** How the columns are aligned vertically. Defaults to `start`. */
  align?: ColumnsAlign | undefined;
}

export type ColumnsClassKey = 'root';

export const columnsClasses: Record<ColumnsClassKey, string> =
  generateUtilityClasses('SliderColumns', ['root']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderColumns: ColumnsClassKey;
  }

  interface ComponentsPropsList {
    SliderColumns: ColumnsProps;
  }

  interface Components<Theme = unknown> {
    SliderColumns?: ComponentTheme<'SliderColumns', Theme> | undefined;
  }
}

/** Returns a CSS length, with numbers, also in strings, in pixels. */
export function cssLength(
  value: number | string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text !== '' && Number.isFinite(Number(text)) ? `${text}px` : text;
}

interface ColumnsOwnerState {
  gap: ColumnsProps['gap'];
  align: ColumnsAlign;
}

const ALIGN_ITEMS: Record<ColumnsAlign, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

const ColumnsRoot = styled('div', {
  name: 'SliderColumns',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
})<{ ownerState: ColumnsOwnerState }>(({ theme, ownerState }) => ({
  display: 'flex',
  gap: cssLength(ownerState.gap) ?? theme.spacing(4),
  alignItems: ALIGN_ITEMS[ownerState.align],
  // As far from the blocks around it as paragraphs are.
  marginBlock: '1em',
}));

/**
 * A row of {@link Column}s, e.g., `::::columns` in MDX, with `:::column`
 * containers in it. The columns share the width of the row, and are aligned
 * at their tops by default.
 *
 * Can be themed as `SliderColumns` in the `components` of the MUI theme.
 */
export function Columns(inProps: ColumnsProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderColumns' });
  const { gap, align = 'start', className, ...other } = props;
  return (
    <ColumnsRoot
      className={`${columnsClasses.root}${className === undefined ? '' : ` ${className}`}`}
      ownerState={{ gap, align }}
      {...other}
    />
  );
}
