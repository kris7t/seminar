import { styled } from '@mui/material/styles';
import type { DirectiveForm } from '@seminar/core';
import { useState, type JSX, type ReactNode } from 'react';

import { Callout, calloutClasses, type CalloutProps } from './Callout.tsx';
import { CalloutTitle } from './CalloutTitle.tsx';

/** Props of the `callout` directive in MDX. */
export interface CalloutDirectiveProps extends Omit<
  CalloutProps,
  'anchor' | 'block' | 'children'
> {
  /**
   * How the directive was written: `text` for `:callout[…]` in the text,
   * `leaf` for `::callout[…]` on a line of its own, and `container` for
   * `:::callout` with Markdown content. Defaults to `text`.
   */
  directive?: DirectiveForm | undefined;
  /**
   * Name of the element on the slide to point at. Without it, callouts in the
   * text point at their position in the text, and others are placed on the
   * slide with `at`.
   */
  for?: string | undefined;
  /** The label of a `:::callout[…]` directive, shown as its title. */
  label?: string | undefined;
  /** The label of a text or leaf directive, or the content of a container. */
  children?: ReactNode;
}

/** Marks the position of a callout in the text, as tall as a character. */
const CalloutInlineAnchor = styled('span', {
  name: 'SeminarCallout',
  slot: 'Anchor',
  overridesResolver: (_props, styles) => styles['anchor'],
})({
  display: 'inline-block',
  width: 0,
  height: '1em',
  verticalAlign: 'text-bottom',
});

/**
 * The `callout` directive of MDX decks, which renders a {@link Callout}:
 *
 * - `:callout[…]` points at its position in the text.
 * - `::callout[…]` on a line of its own is placed on the slide with `at`.
 * - `:::callout[Title]` holds Markdown content up to the closing `:::`, under
 *   the title, and is placed on the slide with `at`.
 *
 * With `for`, they point at an element on the slide instead.
 */
export function CalloutDirective({
  directive = 'text',
  for: target,
  label,
  children,
  ...props
}: CalloutDirectiveProps): JSX.Element {
  const [inlineAnchor, setInlineAnchor] = useState<HTMLSpanElement | null>(
    null,
  );
  const inline = directive === 'text' && target === undefined;
  return (
    <>
      {inline && (
        <CalloutInlineAnchor
          ref={setInlineAnchor}
          className={calloutClasses.anchor}
        />
      )}
      <Callout
        anchor={inline ? (inlineAnchor ?? undefined) : target}
        block={directive === 'container'}
        {...props}
      >
        {label !== undefined && <CalloutTitle>{label}</CalloutTitle>}
        {children}
      </Callout>
    </>
  );
}
