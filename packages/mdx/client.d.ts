/**
 * Types of `.deck.mdx` modules compiled with `@seminar/rollup-plugin`.
 *
 * Add `@seminar/mdx/client` to the `types` of your `tsconfig.json`.
 */
declare module '*.deck.mdx' {
  import type { DeckProps } from '@seminar/core';
  import type { JSX } from 'react';

  /** The frontmatter of the document. */
  export const frontmatter: Record<string, unknown>;

  /** The deck of slides described by the document. */
  export default function MDXDeck(
    props: Omit<DeckProps, 'children'>,
  ): JSX.Element;
}
