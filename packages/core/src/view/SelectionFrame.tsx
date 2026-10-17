import { alpha, generateUtilityClasses } from '@mui/material';
import { styled, type SxProps, type Theme } from '@mui/material/styles';
import type { ComponentProps, JSX } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../theme/classNames.ts';

/**
 * Name of the custom highlight that shows the text selected by the presenter
 * to the audience, as `::highlight(slider-selection)`.
 */
export const SELECTION_HIGHLIGHT = 'slider-selection';

/** CSS custom property with the background color of selected text. */
export const SELECTION_BACKGROUND_PROPERTY = '--SliderSelection-background';

export type SelectionFrameProps = ComponentProps<'div'> & {
  sx?: SxProps<Theme>;
};

export type SelectionFrameClassKey = 'root';

export const selectionFrameClasses: Record<SelectionFrameClassKey, string> =
  generateUtilityClasses('SliderSelection', ['root']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderSelection: SelectionFrameClassKey;
  }

  interface ComponentsPropsList {
    SliderSelection: SelectionFrameProps;
  }

  interface Components<Theme = unknown> {
    SliderSelection?: ComponentTheme<'SliderSelection', Theme> | undefined;
  }
}

const SelectionFrameRoot = styled('div', {
  name: 'SliderSelection',
  slot: 'Root',
})(({ theme }) => ({
  [SELECTION_BACKGROUND_PROPERTY]: alpha(theme.palette.primary.main, 0.3),
  '& ::selection': {
    backgroundColor: `var(${SELECTION_BACKGROUND_PROPERTY})`,
  },
  [`& ::highlight(${SELECTION_HIGHLIGHT})`]: {
    backgroundColor: `var(${SELECTION_BACKGROUND_PROPERTY})`,
  },
}));

/**
 * The frame of a slide, which styles the text selected in it, so that the
 * selection of the presenter looks the same in the presenter view and in the
 * audience view, where it is shown as a custom highlight.
 *
 * Can be themed as `SliderSelection` in the `components` of the MUI theme.
 * The background of selected text, also in text fields, is the
 * `--SliderSelection-background` custom property, a translucent primary color
 * by default. Other styles can be set for both `& ::selection` and
 * `& ::highlight(slider-selection)`.
 */
export function SelectionFrame({
  className,
  ...other
}: SelectionFrameProps): JSX.Element {
  return (
    <SelectionFrameRoot
      className={classNames(selectionFrameClasses.root, className)}
      {...other}
    />
  );
}
