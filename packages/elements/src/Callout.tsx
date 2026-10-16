import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import {
  SLIDE_WIDTH,
  Step,
  type ComponentTheme,
  type StepProps,
} from '@slider/core';
import type { JSX } from 'react';

/** Props of a callout, which behaves like a step. */
export type CalloutProps = Omit<StepProps, 'defaultVariant'>;

export type CalloutClassKey = 'anchor' | 'positioner' | 'root';

export const calloutClasses: Record<CalloutClassKey, string> =
  generateUtilityClasses('SliderCallout', ['anchor', 'positioner', 'root']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderCallout: CalloutClassKey;
  }

  interface ComponentsPropsList {
    SliderCallout: CalloutProps;
  }

  interface Components<Theme = unknown> {
    SliderCallout?: ComponentTheme<'SliderCallout', Theme> | undefined;
  }
}

const CalloutAnchor = styled('span', {
  name: 'SliderCallout',
  slot: 'Anchor',
})({
  position: 'relative',
  display: 'inline-block',
  width: 0,
  height: 0,
  verticalAlign: 'baseline',
});

const CalloutPositioner = styled('span', {
  name: 'SliderCallout',
  slot: 'Positioner',
})({
  position: 'absolute',
  zIndex: 1,
  left: 0,
  bottom: '0.65em',
  transform: 'translateX(-50%)',
});

const CalloutRoot = styled(Step, {
  name: 'SliderCallout',
  slot: 'Root',
})(({ theme }) => ({
  position: 'relative',
  display: 'block',
  boxSizing: 'border-box',
  width: 'max-content',
  maxWidth: SLIDE_WIDTH / 3,
  padding: theme.spacing(0.5, 1),
  borderRadius: theme.shape.borderRadius,
  color: theme.palette.primary.contrastText,
  backgroundColor: theme.palette.primary.main,
  boxShadow: theme.shadows[1],
  '&::after': {
    position: 'absolute',
    top: '100%',
    left: '50%',
    width: '0.8em',
    height: '0.45em',
    background: 'inherit',
    clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
    content: '""',
    transform: 'translateX(-50%)',
  },
}));

/**
 * An inline callout that participates in the steps of its slide. It uses the
 * `scoped` step variant unless `variant` or a variant shorthand is set.
 */
export function Callout(inProps: CalloutProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderCallout' });
  const { className, ...other } = props;
  return (
    <CalloutAnchor className={calloutClasses.anchor}>
      <CalloutPositioner className={calloutClasses.positioner}>
        <CalloutRoot
          component="span"
          defaultVariant="scoped"
          className={`${calloutClasses.root}${className === undefined ? '' : ` ${className}`}`}
          {...other}
        />
      </CalloutPositioner>
    </CalloutAnchor>
  );
}
