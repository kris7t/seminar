import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import type { JSX } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../theme/classNames.ts';
import type { SlideMasterProps } from './SlideMaster.ts';

export type TitleMasterProps = SlideMasterProps;

export type TitleMasterClassKey = 'root' | 'title' | 'subtitle';

export const titleMasterClasses: Record<TitleMasterClassKey, string> =
  generateUtilityClasses('SeminarTitleMaster', ['root', 'title', 'subtitle']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarTitleMaster: TitleMasterClassKey;
  }

  interface ComponentsPropsList {
    SeminarTitleMaster: TitleMasterProps;
  }

  interface Components<Theme = unknown> {
    SeminarTitleMaster?:
      ComponentTheme<'SeminarTitleMaster', Theme> | undefined;
  }
}

interface OwnerStateProps {
  ownerState: TitleMasterProps;
}

const TitleMasterRoot = styled('section', {
  name: 'SeminarTitleMaster',
  slot: 'Root',
})<OwnerStateProps>(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: theme.spacing(4),
  width: '100%',
  height: '100%',
  padding: theme.spacing(8, 10),
}));

const TitleMasterTitle = styled('h1', {
  name: 'SeminarTitleMaster',
  slot: 'Title',
})<OwnerStateProps>(({ theme }) => ({
  ...theme.typography.h1,
  margin: 0,
  color: theme.palette.primary.main,
}));

const TitleMasterSubtitle = styled('div', {
  name: 'SeminarTitleMaster',
  slot: 'Subtitle',
})<OwnerStateProps>(({ theme }) => ({
  ...theme.typography.subtitle1,
}));

/**
 * Slide master for the title slide with a large, vertically centered title.
 *
 * The body is intended for the subtitle, authors and venue of the talk.
 *
 * Can be themed as `SeminarTitleMaster` in the `components` of the MUI theme.
 */
export function TitleMaster(inProps: TitleMasterProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SeminarTitleMaster' });
  const { title, className, children } = props;
  return (
    <TitleMasterRoot
      className={classNames(titleMasterClasses.root, className)}
      ownerState={props}
    >
      {title !== undefined && (
        <TitleMasterTitle
          className={titleMasterClasses.title}
          ownerState={props}
        >
          {title}
        </TitleMasterTitle>
      )}
      {children !== undefined && (
        <TitleMasterSubtitle
          className={titleMasterClasses.subtitle}
          ownerState={props}
        >
          {children}
        </TitleMasterSubtitle>
      )}
    </TitleMasterRoot>
  );
}
