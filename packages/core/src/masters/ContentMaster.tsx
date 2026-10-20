import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import type { JSX } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../theme/classNames.ts';
import type { SlideMasterProps } from './SlideMaster.ts';
import { SlideNumber } from '../slide/SlideNumber.tsx';

export interface ContentMasterProps extends SlideMasterProps {
  /** Whether to show the slide number. Defaults to `true`. */
  showSlideNumber?: boolean;
}

export type ContentMasterClassKey = 'root' | 'title' | 'body' | 'slideNumber';

export const contentMasterClasses: Record<ContentMasterClassKey, string> =
  generateUtilityClasses('SeminarContentMaster', [
    'root',
    'title',
    'body',
    'slideNumber',
  ]);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarContentMaster: ContentMasterClassKey;
  }

  interface ComponentsPropsList {
    SeminarContentMaster: ContentMasterProps;
  }

  interface Components<Theme = unknown> {
    SeminarContentMaster?:
      ComponentTheme<'SeminarContentMaster', Theme> | undefined;
  }
}

interface OwnerStateProps {
  ownerState: ContentMasterProps;
}

const ContentMasterRoot = styled('section', {
  name: 'SeminarContentMaster',
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
  name: 'SeminarContentMaster',
  slot: 'Title',
})<OwnerStateProps>(({ theme }) => ({
  ...theme.typography.h2,
  margin: 0,
}));

const ContentMasterBody = styled('div', {
  name: 'SeminarContentMaster',
  slot: 'Body',
})<OwnerStateProps>({
  flex: 1,
  minHeight: 0,
});

const ContentMasterSlideNumber = styled(SlideNumber, {
  name: 'SeminarContentMaster',
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
 * Can be themed as `SeminarContentMaster` in the `components` of the MUI theme.
 */
export function ContentMaster(inProps: ContentMasterProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SeminarContentMaster' });
  const { title, className, children, showSlideNumber = true } = props;
  return (
    <ContentMasterRoot
      className={classNames(contentMasterClasses.root, className)}
      ownerState={props}
    >
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
