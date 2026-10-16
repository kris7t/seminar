import type { ComponentType, ReactNode } from 'react';

/** Props passed from a {@link Slide} to its slide master. */
export interface SlideMasterProps {
  title?: ReactNode;
  /** Classes of the slide, which masters should add to their root element. */
  className?: string | undefined;
  children?: ReactNode;
}

/** A component that lays out the contents of a slide. */
export type SlideMaster = ComponentType<SlideMasterProps> & {
  /**
   * Which fades of the slides with this master to cut (see
   * {@link SlideTransition}), unless they set their own `transition`.
   * Defaults to `'fade'`.
   */
  transition?: SlideTransitionProp | undefined;
};

/**
 * Which fades of a slide from and to its neighbors to cut, as the
 * `slideTransition` of the theme says otherwise, whichever way the deck
 * goes:
 *
 * - `'fade'`: none, i.e., no preference, which is the default.
 * - `'cut'`: all of them, e.g., for a slide with a background of its own.
 * - `'cut-before'` and `'cut-after'`: the fade with the slide before or
 *   after it in the deck, e.g., whose content doesn't fade well into it.
 * - `'cut-in'` and `'cut-out'`: the fade into or out of it, from or to
 *   either side.
 *
 * Going from one slide to another, e.g., a later one, leaves the first one
 * after it, and enters the other one before it. The slides fade unless either
 * of them cuts that fade.
 */
export type SlideTransition =
  'fade' | 'cut' | 'cut-before' | 'cut-after' | 'cut-in' | 'cut-out';

/**
 * One or more {@link SlideTransition}s of a slide, e.g., `'cut-in'`, or
 * `['cut-in', 'cut-after']`, or separated by spaces, e.g., `'cut-in
 * cut-after'` in an attribute of MDX.
 */
export type SlideTransitionProp =
  SlideTransition | readonly SlideTransition[] | `${SlideTransition} ${string}`;

/** Slide masters of a theme, selectable by name with `<Slide master="…">`. */
export interface SlideMasters {
  [name: string]: SlideMaster;
  /** Default master for slides with a title and body. */
  content: SlideMaster;
  /** Master for the title slide of a presentation. */
  title: SlideMaster;
  /** Master for slides that start a section. */
  section: SlideMaster;
  /** Master for slides that start a subsection. */
  subsection: SlideMaster;
}

declare module '@mui/material/styles' {
  interface Theme {
    master: SlideMasters;
  }

  interface ThemeOptions {
    master?: Partial<SlideMasters>;
  }
}
