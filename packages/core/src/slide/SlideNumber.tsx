import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useThemeProps,
  type ComponentsOverrides,
  type ComponentsProps,
  type ComponentsVariants,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import type { JSX } from 'react';

import { classNames } from '../utils/classNames.ts';
import { useDeck } from '../deck/DeckContext.ts';

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
    SliderSlideNumber?:
      | {
          defaultProps?: ComponentsProps['SliderSlideNumber'] | undefined;
          styleOverrides?:
            ComponentsOverrides<Theme>['SliderSlideNumber'] | undefined;
          variants?: ComponentsVariants<Theme>['SliderSlideNumber'] | undefined;
        }
      | undefined;
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
  const { slideIndex, slideCount } = useDeck();
  return (
    <SlideNumberRoot
      className={classNames(slideNumberClasses.root, className)}
      ownerState={props}
      {...other}
    >
      {slideIndex + 1} / {slideCount}
    </SlideNumberRoot>
  );
}
