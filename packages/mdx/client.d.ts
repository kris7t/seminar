/**
 * Types of `.deck.mdx` modules compiled with `@slider/rollup-plugin`.
 *
 * Add `@slider/mdx/client` to the `types` of your `tsconfig.json`.
 */
declare module '*.deck.mdx' {
  import type { DeckProps } from '@slider/core';
  import type { JSX } from 'react';

  /** The frontmatter of the document. */
  export const frontmatter: Record<string, unknown>;

  /** The deck of slides described by the document. */
  export default function MDXDeck(
    props: Omit<DeckProps, 'children'>,
  ): JSX.Element;
}
