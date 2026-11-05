import { createContext, type Context } from 'react';

/** How a slide is edited in the view it's shown in. */
export interface Editing {
  /** The layer above the slide that handles are drawn in. */
  layer: HTMLElement | null;
  /** The screen pixels of a logical pixel of the slide. */
  scale: number;
  /** The editable directive under the pointer, by its key. */
  hovered: string | undefined;
  /** The editable directive that was clicked, by its key. */
  selected: string | undefined;
  /** The editable directive whose handle is dragged, by its key. */
  dragging: string | undefined;
  /**
   * Tells which editable directive is under the pointer, if any, which stays
   * hovered a little after the pointer leaves it.
   */
  hover: (key: string | undefined) => void;
  select: (key: string | undefined) => void;
  setDragging: (key: string | undefined) => void;
}

/** How the slide is edited, if it's edited in its view. */
export const EditingContext: Context<Editing | undefined> = createContext<
  Editing | undefined
>(undefined);
