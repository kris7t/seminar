import type { ComponentType, ReactNode } from 'react';

/** Props passed from a {@link Slide} to its slide master. */
export interface SlideMasterProps {
  title?: ReactNode;
  /** Classes of the slide, which masters should add to their root element. */
  className?: string | undefined;
  children?: ReactNode;
}

/** A component that lays out the contents of a slide. */
export type SlideMaster = ComponentType<SlideMasterProps>;

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
