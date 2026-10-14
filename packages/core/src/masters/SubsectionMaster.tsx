import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import type { JSX } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import type { SlideMasterProps } from './SlideMaster.ts';

export type SubsectionMasterProps = SlideMasterProps;

export type SubsectionMasterClassKey = 'root' | 'title' | 'subtitle';

export const subsectionMasterClasses: Record<SubsectionMasterClassKey, string> =
  generateUtilityClasses('SliderSubsectionMaster', [
    'root',
    'title',
    'subtitle',
  ]);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderSubsectionMaster: SubsectionMasterClassKey;
  }

  interface ComponentsPropsList {
    SliderSubsectionMaster: SubsectionMasterProps;
  }

  interface Components<Theme = unknown> {
    SliderSubsectionMaster?:
      ComponentTheme<'SliderSubsectionMaster', Theme> | undefined;
  }
}

interface OwnerStateProps {
  ownerState: SubsectionMasterProps;
}

const SubsectionMasterRoot = styled('section', {
  name: 'SliderSubsectionMaster',
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

const SubsectionMasterTitle = styled('h1', {
  name: 'SliderSubsectionMaster',
  slot: 'Title',
})<OwnerStateProps>(({ theme }) => ({
  ...theme.typography.h3,
  margin: 0,
  color: theme.palette.text.primary,
}));

const SubsectionMasterSubtitle = styled('div', {
  name: 'SliderSubsectionMaster',
  slot: 'Subtitle',
})<OwnerStateProps>(({ theme }) => ({
  ...theme.typography.subtitle2,
}));

/**
 * Slide master for slides that start a subsection of a presentation, with a
 * vertically centered title that is smaller than the title of sections.
 *
 * The body is intended for a short summary of the subsection.
 *
 * Can be themed as `SliderSubsectionMaster` in the `components` of the MUI
 * theme.
 */
export function SubsectionMaster(inProps: SubsectionMasterProps): JSX.Element {
  const props = useThemeProps({
    props: inProps,
    name: 'SliderSubsectionMaster',
  });
  const { title, children } = props;
  return (
    <SubsectionMasterRoot
      className={subsectionMasterClasses.root}
      ownerState={props}
    >
      {title !== undefined && (
        <SubsectionMasterTitle
          className={subsectionMasterClasses.title}
          ownerState={props}
        >
          {title}
        </SubsectionMasterTitle>
      )}
      {children !== undefined && (
        <SubsectionMasterSubtitle
          className={subsectionMasterClasses.subtitle}
          ownerState={props}
        >
          {children}
        </SubsectionMasterSubtitle>
      )}
    </SubsectionMasterRoot>
  );
}
