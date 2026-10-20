import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useThemeProps,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import type { JSX } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../theme/classNames.ts';
import { useDeck } from '../deck/DeckContext.ts';
import { useSlideView } from '../view/SlideViewContext.ts';

export interface SlideNumberProps {
  className?: string;
  sx?: SxProps<Theme>;
}

export type SlideNumberClassKey = 'root';

export const slideNumberClasses: Record<SlideNumberClassKey, string> =
  generateUtilityClasses('SeminarSlideNumber', ['root']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarSlideNumber: SlideNumberClassKey;
  }

  interface ComponentsPropsList {
    SeminarSlideNumber: SlideNumberProps;
  }

  interface Components<Theme = unknown> {
    SeminarSlideNumber?:
      ComponentTheme<'SeminarSlideNumber', Theme> | undefined;
  }
}

const SlideNumberRoot = styled('div', {
  name: 'SeminarSlideNumber',
  slot: 'Root',
})<{ ownerState: SlideNumberProps }>(({ theme }) => ({
  ...theme.typography.caption,
  color: theme.palette.text.secondary,
}));

/**
 * Shows the number of the current slide and the number of slides in the deck,
 * e.g., `3 / 12`.
 *
 * Can be themed as `SeminarSlideNumber` in the `components` of the MUI theme.
 */
export function SlideNumber(inProps: SlideNumberProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SeminarSlideNumber' });
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
