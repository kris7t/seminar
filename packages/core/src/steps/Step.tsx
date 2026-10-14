import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useThemeProps,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import {
  use,
  type ElementType,
  type HTMLAttributes,
  type JSX,
  type ReactNode,
} from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../utils/classNames.ts';
import { TogetherContext } from './TogetherContext.ts';
import { useStep, type StepState, type StepWith } from './useSteps.ts';

export interface StepProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'children'
> {
  /**
   * See {@link StepWith}. Ignored directly inside a {@link Together}, which
   * determines the step instead.
   */
  with?: StepWith | undefined;
  /** See the `group` option of `useSteps`. */
  group?: string | undefined;
  /** The element to render. Defaults to `'div'`. */
  component?: ElementType;
  children?: ReactNode | ((state: StepState) => ReactNode);
  sx?: SxProps<Theme>;
}

export type StepClassKey = 'root' | 'active' | 'inactive' | 'current';

export const stepClasses: Record<StepClassKey, string> = generateUtilityClasses(
  'SliderStep',
  ['root', 'active', 'inactive', 'current'],
);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderStep: StepClassKey;
  }

  interface ComponentsPropsList {
    SliderStep: StepProps;
  }

  interface Components<Theme = unknown> {
    SliderStep?: ComponentTheme<'SliderStep', Theme> | undefined;
  }
}

interface StepOwnerState extends StepProps {
  isActive: boolean;
  isCurrent: boolean;
}

const StepRoot = styled('div', {
  name: 'SliderStep',
  slot: 'Root',
})<{ ownerState: StepOwnerState }>({
  variants: [
    {
      props: ({ ownerState }) => !ownerState.isActive,
      // Keep the space of hidden content, so that the layout doesn't shift.
      style: { visibility: 'hidden' },
    },
  ],
});

/**
 * Content shown from a step of the presentation.
 *
 * Inactive steps are hidden but keep their space in the layout. Steps inside
 * the step are nested inside it, and are shown after it.
 *
 * Can be themed as `SliderStep` in the `components` of the MUI theme.
 */
export function Step(inProps: StepProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderStep' });
  const {
    component = 'div',
    with: withStep,
    group,
    className,
    children,
    ...other
  } = props;
  const together = use(TogetherContext);
  const step = useStep({ with: together ?? withStep, group });
  const { ref, isActive, isCurrent } = step;
  return (
    <StepRoot
      as={component}
      ref={ref}
      className={classNames(
        stepClasses.root,
        isActive ? stepClasses.active : stepClasses.inactive,
        isCurrent ? stepClasses.current : undefined,
        className,
      )}
      ownerState={{ ...props, isActive, isCurrent }}
      {...other}
    >
      {/* Steps nested inside this one don't join the enclosing Together. */}
      <TogetherContext value={undefined}>
        {typeof children === 'function' ? children(step) : children}
      </TogetherContext>
    </StepRoot>
  );
}
