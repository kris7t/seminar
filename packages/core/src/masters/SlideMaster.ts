import type { ComponentType, ReactNode } from 'react';

import type { CutProp } from '../transitions/fades.ts';

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
   * {@link CutProp}), unless they set their own `cut`.
   */
  cut?: CutProp | undefined;
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
