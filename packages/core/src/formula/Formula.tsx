import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useThemeProps,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import type { JSX, ReactNode } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../utils/classNames.ts';

export interface FormulaProps {
  /** Whether the formula is shown on its own line, like `$$…$$` in TeX. */
  display?: boolean | undefined;
  /**
   * Whether the formula takes the full width of the line, e.g., for equation
   * numbers on the right.
   */
  fullWidth?: boolean | undefined;
  /** Minimum width of a full-width formula, e.g., `12.5ex`. */
  minWidth?: string | undefined;
  /**
   * The rendered formula: an `svg` element for display, followed by a `math`
   * element, which is only visible to assistive technology.
   */
  children?: ReactNode;
  className?: string;
  sx?: SxProps<Theme>;
}

export type FormulaClassKey = 'root' | 'display' | 'inline';

export const formulaClasses: Record<FormulaClassKey, string> =
  generateUtilityClasses('SliderFormula', ['root', 'display', 'inline']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderFormula: FormulaClassKey;
  }

  interface ComponentsPropsList {
    SliderFormula: FormulaProps;
  }

  interface Components<Theme = unknown> {
    SliderFormula?: ComponentTheme<'SliderFormula', Theme> | undefined;
  }
}

// Adapted from the style sheet of the SVG output of MathJax.
const FormulaRoot = styled('span', {
  name: 'SliderFormula',
  slot: 'Root',
})<{ ownerState: FormulaProps }>({
  position: 'relative',
  direction: 'ltr',
  whiteSpace: 'nowrap',
  '& > svg': {
    overflow: 'visible',
    minHeight: 1,
    minWidth: 1,
  },
  // Show the MathML to assistive technology only.
  '& > math': {
    position: 'absolute',
    inset: 0,
    display: 'block',
    padding: '1px 0 0 0',
    border: 0,
    overflow: 'hidden',
    clipPath: 'polygon(0 0, 0 1px, 1px 1px, 1px 0)',
    userSelect: 'none',
  },
  variants: [
    {
      props: ({ ownerState }) => ownerState.display === true,
      style: {
        display: 'block',
        textAlign: 'center',
        justifyContent: 'center',
        margin: '0.7em 0',
        padding: '0.3em 2px',
        '& > math': { width: '100%' },
      },
    },
    {
      props: ({ ownerState }) =>
        ownerState.display === true && ownerState.fullWidth === true,
      style: { display: 'flex' },
    },
  ],
});

/**
 * A formula rendered by MathJax, as created from `$…$` and `$$…$$` in decks
 * written in MDX.
 *
 * Can be themed as `SliderFormula` in the `components` of the MUI theme. The math
 * font is chosen when the deck is compiled (see the `slider` export condition
 * of themes).
 */
export function Formula(inProps: FormulaProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderFormula' });
  const {
    display = false,
    fullWidth = false,
    minWidth,
    className,
    children,
    ...other
  } = props;
  return (
    <FormulaRoot
      as={display ? 'div' : 'span'}
      className={classNames(
        formulaClasses.root,
        display ? formulaClasses.display : formulaClasses.inline,
        className,
      )}
      ownerState={{ ...props, display, fullWidth }}
      style={fullWidth && minWidth !== undefined ? { minWidth } : undefined}
      {...other}
    >
      {children}
    </FormulaRoot>
  );
}
