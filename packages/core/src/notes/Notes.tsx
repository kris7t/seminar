import {
  Children,
  createElement,
  Fragment,
  isValidElement,
  type JSX,
  type ReactNode,
} from 'react';

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
 * Returns the presenter notes of `slide`: its `notes` prop and the children
 * of its {@link Notes} children, or `undefined` if it has none.
 */
export function getSlideNotes(slide: ReactNode): ReactNode {
  if (!isValidElement<{ notes?: ReactNode; children?: ReactNode }>(slide)) {
    return undefined;
  }
  const { notes: notesProp } = slide.props;
  // Notes are positional children of the slide.
  // eslint-disable-next-line @eslint-react/no-children-to-array
  const notes = Children.toArray(slide.props.children).flatMap((child) =>
    isValidElement<NotesProps>(child) && child.type === Notes
      ? [child.props.children]
      : [],
  );
  if (notesProp !== undefined && notesProp !== null) {
    notes.unshift(notesProp);
  }
  if (notes.length === 0) {
    return undefined;
  }
  // The parts of the notes are separate children of a fragment, rather than
  // a list, so that they don't need keys, e.g., the paragraphs that the
  // compiler passes as an array.
  return createElement(Fragment, null, ...notes.flat(Infinity));
}
