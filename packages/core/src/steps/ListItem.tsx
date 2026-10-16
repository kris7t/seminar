import type { JSX } from 'react';

import { Step, type StepAttachment, type StepProps } from './Step.tsx';

/** Props of a {@link ListItem}. */
export type ListItemProps = Omit<StepProps, 'component' | 'defaultAttachment'>;

const WITH_PREVIOUS: StepAttachment = { with: 'previous' };

/**
 * An item of a list, which is shown with the previous step, unless it's a
 * step of its own with `step`, or with a step behavior, e.g., `only`, or
 * placed otherwise, e.g., with `group`. MDX decks render the items of
 * Markdown lists like this, with the props of their `:step` directive.
 */
export function ListItem(props: ListItemProps): JSX.Element {
  return <Step component="li" defaultAttachment={WITH_PREVIOUS} {...props} />;
}
