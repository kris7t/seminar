import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useThemeProps,
  type ComponentsOverrides,
  type ComponentsProps,
  type ComponentsVariants,
} from '@mui/material/styles';
import type { JSX } from 'react';

import type { SlideMasterProps } from './SlideMaster.ts';
import { SlideNumber } from '../slide/SlideNumber.tsx';

export interface ContentMasterProps extends SlideMasterProps {
  /** Whether to show the slide number. Defaults to `true`. */
  showSlideNumber?: boolean;
}

export type ContentMasterClassKey = 'root' | 'title' | 'body' | 'slideNumber';

export const contentMasterClasses: Record<ContentMasterClassKey, string> =
  generateUtilityClasses('SliderContentMaster', [
    'root',
    'title',
    'body',
    'slideNumber',
  ]);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderContentMaster: ContentMasterClassKey;
  }

  interface ComponentsPropsList {
    SliderContentMaster: ContentMasterProps;
  }

  interface Components<Theme = unknown> {
    SliderContentMaster?:
      | {
          defaultProps?: ComponentsProps['SliderContentMaster'] | undefined;
          styleOverrides?:
            ComponentsOverrides<Theme>['SliderContentMaster'] | undefined;
          variants?:
            ComponentsVariants<Theme>['SliderContentMaster'] | undefined;
        }
      | undefined;
  }
}

interface OwnerStateProps {
  ownerState: ContentMasterProps;
}

const ContentMasterRoot = styled('section', {
  name: 'SliderContentMaster',
  slot: 'Root',
})<OwnerStateProps>(({ theme }) => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(3),
  width: '100%',
  height: '100%',
  padding: theme.spacing(6, 8),
}));

const ContentMasterTitle = styled('h1', {
  name: 'SliderContentMaster',
  slot: 'Title',
})<OwnerStateProps>(({ theme }) => ({
  ...theme.typography.h2,
  margin: 0,
}));

const ContentMasterBody = styled('div', {
  name: 'SliderContentMaster',
  slot: 'Body',
})<OwnerStateProps>({
  flex: 1,
  minHeight: 0,
});

const ContentMasterSlideNumber = styled(SlideNumber, {
  name: 'SliderContentMaster',
  slot: 'SlideNumber',
})<OwnerStateProps>(({ theme }) => ({
  position: 'absolute',
  right: theme.spacing(4),
  bottom: theme.spacing(3),
}));

/**
 * Slide master with a heading at the top, the body below it, and the slide
 * number in the bottom right corner.
 *
 * Can be themed as `SliderContentMaster` in the `components` of the MUI theme.
 */
export function ContentMaster(inProps: ContentMasterProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderContentMaster' });
  const { title, children, showSlideNumber = true } = props;
  return (
    <ContentMasterRoot className={contentMasterClasses.root} ownerState={props}>
      {title !== undefined && (
        <ContentMasterTitle
          className={contentMasterClasses.title}
          ownerState={props}
        >
          {title}
        </ContentMasterTitle>
      )}
      <ContentMasterBody
        className={contentMasterClasses.body}
        ownerState={props}
      >
        {children}
      </ContentMasterBody>
      {showSlideNumber && (
        <ContentMasterSlideNumber
          className={contentMasterClasses.slideNumber}
          ownerState={props}
        />
      )}
    </ContentMasterRoot>
  );
}
