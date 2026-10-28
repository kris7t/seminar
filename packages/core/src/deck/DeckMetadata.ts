/**
 * What a deck tells about itself, like its title and authors. Decks written
 * in MDX take it from their frontmatter.
 */
export interface DeckMetadata {
  /** Title of the deck. */
  title?: string | undefined;
  /** Authors of the deck. */
  authors?: readonly string[] | undefined;
  /** The event where the deck is presented, e.g., a conference. */
  event?: string | undefined;
  /** Date of the presentation, as written, e.g., `2026-10-28`. */
  date?: string | undefined;
  /** A short description of the deck. */
  description?: string | undefined;
  /** Keywords of the deck. */
  keywords?: readonly string[] | undefined;
}
