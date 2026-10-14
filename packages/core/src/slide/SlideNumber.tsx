import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useThemeProps,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import type { JSX } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../utils/classNames.ts';
import { useDeck } from '../deck/DeckContext.ts';
import { useSlideView } from './SlideViewContext.ts';

export interface SlideNumberProps {
  className?: string;
  sx?: SxProps<Theme>;
}

export type SlideNumberClassKey = 'root';

export const slideNumberClasses: Record<SlideNumberClassKey, string> =
  generateUtilityClasses('SliderSlideNumber', ['root']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderSlideNumber: SlideNumberClassKey;
  }

  interface ComponentsPropsList {
    SliderSlideNumber: SlideNumberProps;
  }

  interface Components<Theme = unknown> {
    SliderSlideNumber?: ComponentTheme<'SliderSlideNumber', Theme> | undefined;
  }
}

const SlideNumberRoot = styled('div', {
  name: 'SliderSlideNumber',
  slot: 'Root',
})<{ ownerState: SlideNumberProps }>(({ theme }) => ({
  ...theme.typography.caption,
  color: theme.palette.text.secondary,
}));

/**
 * Shows the number of the current slide and the number of slides in the deck,
 * e.g., `3 / 12`.
 *
 * Can be themed as `SliderSlideNumber` in the `components` of the MUI theme.
 */
export function SlideNumber(inProps: SlideNumberProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderSlideNumber' });
  const { className, ...other } = props;
  // The slide may be shown in several views, e.g., in the overview.
  const { index } = useSlideView();
  const { slideCount } = useDeck();
  return (
    <SlideNumberRoot
      className={classNames(slideNumberClasses.root, className)}
      ownerState={props}
      {...other}
    >
      {index + 1} / {slideCount}
    </SlideNumberRoot>
  );
}
