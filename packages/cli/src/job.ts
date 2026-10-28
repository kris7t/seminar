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

/** A deck to print as a PDF. */
export interface PdfDeck {
  /** Directory that the page of the deck is served from. */
  root: string;
  /** Path of the page of the deck in `root`, with `/` separators. */
  page: string;
  /** Path of the PDF to write. */
  output: string;
  /** Name of the PDF in messages. */
  label: string;
}

/** What the Electron app prints, passed to it as JSON. */
export interface PdfJob {
  decks: PdfDeck[];
  print: PrintOptions;
  /** Paper of handouts, which slides are as large as instead. */
  paper: PaperSize;
}

/**
 * Exit code of the Electron app when it couldn't print some of the decks,
 * which it has reported already.
 */
export const PRINT_FAILED = 2;
