import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import type { JSX } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../theme/classNames.ts';
import type { SlideMasterProps } from './SlideMaster.ts';

export type SectionMasterProps = SlideMasterProps;

export type SectionMasterClassKey = 'root' | 'title' | 'subtitle';

export const sectionMasterClasses: Record<SectionMasterClassKey, string> =
  generateUtilityClasses('SeminarSectionMaster', ['root', 'title', 'subtitle']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarSectionMaster: SectionMasterClassKey;
  }

  interface ComponentsPropsList {
    SeminarSectionMaster: SectionMasterProps;
  }

  interface Components<Theme = unknown> {
    SeminarSectionMaster?:
      ComponentTheme<'SeminarSectionMaster', Theme> | undefined;
  }
}

interface OwnerStateProps {
  ownerState: SectionMasterProps;
}

const SectionMasterRoot = styled('section', {
  name: 'SeminarSectionMaster',
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

const SectionMasterTitle = styled('h1', {
  name: 'SeminarSectionMaster',
  slot: 'Title',
})<OwnerStateProps>(({ theme }) => ({
  ...theme.typography.h2,
  margin: 0,
  color: theme.palette.primary.main,
}));

const SectionMasterSubtitle = styled('div', {
  name: 'SeminarSectionMaster',
  slot: 'Subtitle',
})<OwnerStateProps>(({ theme }) => ({
  ...theme.typography.subtitle1,
}));

/**
 * Slide master for slides that start a section of a presentation, with a
 * large, vertically centered title.
 *
 * The body is intended for a short summary of the section.
 *
 * Can be themed as `SeminarSectionMaster` in the `components` of the MUI theme.
 */
export function SectionMaster(inProps: SectionMasterProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SeminarSectionMaster' });
  const { title, className, children } = props;
  return (
    <SectionMasterRoot
      className={classNames(sectionMasterClasses.root, className)}
      ownerState={props}
    >
      {title !== undefined && (
        <SectionMasterTitle
          className={sectionMasterClasses.title}
          ownerState={props}
        >
          {title}
        </SectionMasterTitle>
      )}
      {children !== undefined && (
        <SectionMasterSubtitle
          className={sectionMasterClasses.subtitle}
          ownerState={props}
        >
          {children}
        </SectionMasterSubtitle>
      )}
    </SectionMasterRoot>
  );
}
