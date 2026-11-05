import type { JSX, ReactNode } from 'react';

import { JOINS_CONTENT } from '../steps/stepDefaults.ts';
import { Step, type StepProps } from '../steps/Step.tsx';

/** Props of a {@link CodeBlock}. */
export interface CodeBlockProps extends Omit<
  StepProps,
  'component' | 'defaults' | 'children'
> {
  /** Language of the code, e.g., `ts`. */
  lang?: string | undefined;
  /** The words after the language that aren't attributes, e.g., `{1-3}`. */
  meta?: string | undefined;
  /** The text of the code. */
  code?: string | undefined;
  /** The code, a `pre` element. */
  children?: ReactNode;
}

/**
 * The attributes of code blocks that {@link CodeBlock} renders, after the
 * language, e.g., ` ```ts #fib step `, which are those of `:step`. The other
 * props are set when compiling the deck.
 */
export type CodeBlockAttributes = Omit<
  CodeBlockProps,
  'lang' | 'meta' | 'code' | 'children'
>;

/**
 * A code block of a deck that no plugin renders, e.g., without syntax
 * highlighting. It's shown with the previous step, like paragraphs, unless
 * it's placed otherwise, e.g., with `step` after the language.
 */
export function CodeBlock(props: CodeBlockProps): JSX.Element {
  // The meta and the text of the block are for other components, and aren't
  // passed on to the element.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { lang, meta, code, children, ...stepProps } = props;
  return (
    <Step defaults={JOINS_CONTENT} data-lang={lang} {...stepProps}>
      {children}
    </Step>
  );
}
