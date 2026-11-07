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
   * The editable directives, by their keys, that the pointer or the
   * selection moved between directly the last time either moved, whose
   * handles appear and disappear at once, rather than fading in from nothing
   * or out to nothing.
   */
  swapped: readonly string[];
  /**
   * The background color of the slide, which marks are drawn over unless
   * they tell otherwise, if it has one.
   */
  background: string | undefined;
  /** Tells which editable directive is under the pointer, if any. */
  hover: (key: string | undefined) => void;
  select: (key: string | undefined) => void;
  setDragging: (key: string | undefined) => void;
}

/** How the slide is edited, if it's edited in its view. */
export const EditingContext: Context<Editing | undefined> = createContext<
  Editing | undefined
>(undefined);
