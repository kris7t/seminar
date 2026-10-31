import type { JSX } from 'react';

import { Step, WITH_CONTENT, type StepProps } from '../steps/Step.tsx';

/** Props of a {@link Paragraph}. */
export type ParagraphProps = Omit<StepProps, 'component' | 'defaultAttachment'>;

/**
 * A paragraph, which is shown with the previous step, so that it appears in
 * order with the steps around it, unless it's a step of its own with `step`,
 * or with a step behavior, e.g., `only`, or placed otherwise, e.g., with
 * `group`. MDX decks render Markdown paragraphs like this, with the props of
 * their `:step` directive.
 */
export function Paragraph(props: ParagraphProps): JSX.Element {
  return <Step component="p" defaultAttachment={WITH_CONTENT} {...props} />;
}
