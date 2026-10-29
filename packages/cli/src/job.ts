import type { PrintOptions } from '@seminar/core';

/** Sizes of paper that handouts can be printed on. */
export const PAPER_SIZES = [
  'A3',
  'A4',
  'A5',
  'Letter',
  'Legal',
  'Tabloid',
] as const;

export type PaperSize = (typeof PAPER_SIZES)[number];

/** A PDF of a deck to save. */
export interface PdfOutput {
  print: PrintOptions;
  /** Path of the PDF. */
  output: string;
  /** Name of the PDF in messages. */
  label: string;
}

/** A deck to print as PDFs. */
export interface PdfDeck {
  /** Directory that the page of the deck is served from. */
  root: string;
  /** Path of the page of the deck in `root`, with `/` separators. */
  page: string;
  pdfs: PdfOutput[];
}

/** What the Electron app prints, passed to it as JSON. */
export interface PdfJob {
  decks: PdfDeck[];
  /** Paper of handouts, which slides are as large as instead. */
  paper: PaperSize;
}

/** A built deck to present, which starts presenting right away. */
export interface BuiltDeck {
  /** Directory that the page of the deck is served from. */
  root: string;
  /** Path of the page of the deck in `root`, with `/` separators. */
  page: string;
}

/**
 * A deck served by the dev server of Vite to preview, which isn't presented
 * until the presenter starts the presentation.
 */
export interface PreviewedDeck {
  /** URL of the page of the deck. */
  url: string;
}

/** A deck to show in the app of `seminar present` or `seminar preview`. */
export type PresentJob = BuiltDeck | PreviewedDeck;

/** What the preload script makes the `seminarHost` of a deck from. */
export interface HostOptions {
  print?: PrintOptions;
  present?: boolean;
  preview?: boolean;
  /**
   * Whether the app knows the screens of windows, and puts the audience
   * window on its screen itself, as on Wayland.
   */
  placesWindows?: boolean;
}

/**
 * Exit code of the Electron app when it couldn't print some of the decks,
 * which it has reported already.
 */
export const PRINT_FAILED = 2;
