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
   * {@link SlideCutProp}), unless they set their own `cut`.
   */
  cut?: SlideCutProp | undefined;
  /**
   * Duration of the fades of the slides with this master, in milliseconds,
   * unless they set their own `fade`, instead of the `stepTransition` and
   * `slideTransition` of the theme (see the `fade` of `Slide`).
   */
  fade?: number | undefined;
  /** Duration of the fades into the slides with this master. */
  fadeIn?: number | undefined;
  /** Duration of the fades out of the slides with this master. */
  fadeOut?: number | undefined;
  /** Duration of the fades with the slides before those with this master. */
  fadeBefore?: number | undefined;
  /** Duration of the fades with the slides after those with this master. */
  fadeAfter?: number | undefined;
};

/**
 * A fade of a slide from or to its neighbors, whichever way the deck goes:
 *
 * - `'before'` and `'after'`: with the slide before or after it in the deck,
 *   e.g., whose content doesn't fade well into it.
 * - `'in'` and `'out'`: into or out of it, from or to either side.
 *
 * Going from one slide to another, e.g., a later one, leaves the first one
 * after it, and enters the other one before it. A cut of a side is a fade of
 * no time on that side, e.g., `cut=in` is `fadeIn=0` (see the `fade` of
 * `Slide`).
 */
export type SlideCut = 'before' | 'after' | 'in' | 'out';

/**
 * Which fades of a slide to cut: all of them with `true`, or the empty
 * string of a bare `cut` in MDX, e.g., for a slide with a background of its
 * own, none with `false`, or some {@link SlideCut}s, e.g., `'in'`,
 * `['in', 'after']`, or `'in after'` in an attribute of MDX.
 */
export type SlideCutProp =
  boolean | '' | SlideCut | readonly SlideCut[] | `${SlideCut} ${string}`;

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
