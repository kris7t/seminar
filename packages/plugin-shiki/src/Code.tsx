import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import {
  Step,
  useSlideView,
  WITH_PREVIOUS,
  type ComponentTheme,
  type StepProps,
} from '@seminar/core';
import type { JSX, ReactNode } from 'react';

/** Props of a {@link Code} block. */
export interface CodeProps extends Omit<
  StepProps,
  'component' | 'defaultAttachment' | 'children'
> {
  /** Language of the code, e.g., `ts`. */
  lang?: string | undefined;
  /** The rest of the first line of the code block after the language. */
  meta?: string | undefined;
  /** The text of the code. */
  code?: string | undefined;
  /** The highlighted code, a `pre` element. */
  children?: ReactNode;
}

export type CodeClassKey = 'root';

export const codeClasses: Record<CodeClassKey, string> = generateUtilityClasses(
  'SeminarCode',
  ['root'],
);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarCode: CodeClassKey;
  }

  interface ComponentsPropsList {
    SeminarCode: CodeProps;
  }

  interface Components<Theme = unknown> {
    SeminarCode?: ComponentTheme<'SeminarCode', Theme> | undefined;
  }
}

const CodeRoot = styled(Step, {
  name: 'SeminarCode',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
})(({ theme }) => ({
  margin: theme.spacing(2, 0),
  '& pre': {
    margin: 0,
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    overflow: 'auto',
    fontFamily:
      'ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Menlo, Consolas, monospace',
    fontSize: '0.75em',
    lineHeight: 1.5,
  },
}));

/**
 * A code block of a deck, highlighted by Shiki when the deck is compiled. It's
 * shown with the previous step, like paragraphs, unless it's placed
 * otherwise. Documents show its `code` in a plain `pre` instead, with the
 * language in `data-lang`.
 *
 * Can be themed as `SeminarCode` in the `components` of the MUI theme.
 */
export function Code(inProps: CodeProps): JSX.Element {
  // The meta and the text of the block are for other components, and aren't
  // passed on to the element.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { lang, meta, code, className, children, ...stepProps } = useThemeProps(
    { props: inProps, name: 'SeminarCode' },
  );
  const { kind } = useSlideView();
  if (kind === 'document' && code !== undefined) {
    // The text of the code without its highlighting.
    return (
      <Step
        component="pre"
        defaultAttachment={WITH_PREVIOUS}
        className={className}
        data-lang={lang}
        {...stepProps}
      >
        {code}
      </Step>
    );
  }
  return (
    <CodeRoot
      component="div"
      defaultAttachment={WITH_PREVIOUS}
      className={
        className === undefined
          ? codeClasses.root
          : `${codeClasses.root} ${className}`
      }
      data-lang={lang}
      {...stepProps}
    >
      {children}
    </CodeRoot>
  );
}
