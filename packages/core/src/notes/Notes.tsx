import { Children, isValidElement, type JSX, type ReactNode } from 'react';

export interface NotesProps {
  children?: ReactNode;
}

/**
 * Presenter notes of a slide, which are shown to the presenter instead of on
 * the slide. Must be a direct child of the {@link Slide}.
 *
 * In decks written in MDX, write notes in a `:::notes` directive.
 */
// The props are read by the deck, which renders the notes instead.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Notes(_props: NotesProps): JSX.Element | null {
  return null;
}

/**
 * Returns the presenter notes of `slide`: the children of its {@link Notes}
 * children, or `undefined` if it has none.
 */
export function getSlideNotes(slide: ReactNode): ReactNode {
  if (!isValidElement<{ children?: ReactNode }>(slide)) {
    return undefined;
  }
  // Notes are positional children of the slide.
  // eslint-disable-next-line @eslint-react/no-children-to-array
  const notes = Children.toArray(slide.props.children).flatMap((child) =>
    isValidElement<NotesProps>(child) && child.type === Notes
      ? [child.props.children]
      : [],
  );
  return notes.length === 0 ? undefined : notes;
}
