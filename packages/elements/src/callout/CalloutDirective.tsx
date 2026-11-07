import { generateUtilityClasses } from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  useEditable,
  useEditedProps,
  type ComponentTheme,
  type DirectiveForm,
} from '@seminar/core';
import { useState, type ComponentProps, type JSX, type ReactNode } from 'react';

import { Callout, type CalloutProps } from './Callout.tsx';
import { CalloutHandles } from './CalloutHandles.tsx';
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

export type CalloutAnchorClassKey = 'root';

export const calloutAnchorClasses: Record<CalloutAnchorClassKey, string> =
  generateUtilityClasses('SeminarCalloutAnchor', ['root']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarCalloutAnchor: CalloutAnchorClassKey;
  }

  interface ComponentsPropsList {
    SeminarCalloutAnchor: ComponentProps<'span'>;
  }

  interface Components<Theme = unknown> {
    SeminarCalloutAnchor?:
      ComponentTheme<'SeminarCalloutAnchor', Theme> | undefined;
  }
}

/**
 * Marks the position of a callout in the text, as tall as a character. A
 * component of its own rather than a slot of `SeminarCallout`, since it's
 * rendered outside of the callout, without its owner state, which the style
 * overrides of the callout may use.
 */
const CalloutInlineAnchor = styled('span', {
  name: 'SeminarCalloutAnchor',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
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
 *
 * While the slide is edited, dragging the body of a callout turns and
 * stretches its stem, dragging the base of the stem moves it along the edge
 * of the body, dragging the tip moves what it points at, and dragging the
 * side of the body resizes it.
 */
export function CalloutDirective(inProps: CalloutDirectiveProps): JSX.Element {
  const editable = useEditable(inProps);
  const {
    directive = 'text',
    for: target,
    label,
    children,
    ...props
  } = useEditedProps(inProps);
  const [inlineAnchor, setInlineAnchor] = useState<HTMLSpanElement | null>(
    null,
  );
  const inline = directive === 'text' && target === undefined;
  return (
    <>
      {inline && (
        <CalloutInlineAnchor
          ref={setInlineAnchor}
          className={calloutAnchorClasses.root}
        />
      )}
      <Callout
        anchor={inline ? (inlineAnchor ?? undefined) : target}
        block={directive === 'container'}
        {...props}
      >
        {label !== undefined && <CalloutTitle>{label}</CalloutTitle>}
        {children}
        {editable !== undefined && (
          <CalloutHandles
            editable={editable}
            tip={inline ? 'shift' : target === undefined ? 'slide' : 'anchor'}
          />
        )}
      </Callout>
    </>
  );
}
