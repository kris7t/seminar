import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useThemeProps,
  type TypographyVariant,
} from '@mui/material/styles';
import type { ComponentTheme } from '@slider/core';
import type { ComponentProps, JSX } from 'react';

/** Props of the title of a callout. */
export interface CalloutTitleProps extends ComponentProps<'span'> {
  /**
   * Typography variant of the theme for the title. Defaults to `h5`, a
   * heading as large as the text of callouts.
   */
  variant?: TypographyVariant | undefined;
}

export type CalloutTitleClassKey = 'root';

export const calloutTitleClasses: Record<CalloutTitleClassKey, string> =
  generateUtilityClasses('SliderCalloutTitle', ['root']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderCalloutTitle: CalloutTitleClassKey;
  }

  interface ComponentsPropsList {
    SliderCalloutTitle: CalloutTitleProps;
  }

  interface Components<Theme = unknown> {
    SliderCalloutTitle?:
      ComponentTheme<'SliderCalloutTitle', Theme> | undefined;
  }
}

interface CalloutTitleOwnerState extends CalloutTitleProps {
  variant: TypographyVariant;
}

const CalloutTitleRoot = styled('span', {
  name: 'SliderCalloutTitle',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
})<{ ownerState: CalloutTitleOwnerState }>(({ theme, ownerState }) => ({
  ...theme.typography[ownerState.variant],
  display: 'block',
  // Centered above the content, whatever its alignment, unless the theme
  // overrides it.
  textAlign: 'center',
  // Like the `gutterBottom` of MUI `Typography`.
  marginBottom: '0.35em',
}));

/**
 * The title of a callout, like the `heading` of a `Callout`, or the label of
 * a `:::callout[…]` directive, shown as a centered heading. Being a `span`,
 * it may go in any callout.
 */
export function CalloutTitle(inProps: CalloutTitleProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderCalloutTitle' });
  const { variant = 'h5', className, ...other } = props;
  return (
    <CalloutTitleRoot
      className={`${calloutTitleClasses.root}${className === undefined ? '' : ` ${className}`}`}
      ownerState={{ ...props, variant }}
      {...other}
    />
  );
}
