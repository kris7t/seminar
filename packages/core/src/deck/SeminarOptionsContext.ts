import { createContext, use, type Context } from 'react';

/** The options of a deck by their name, see `SeminarConfig`. */
export type SeminarOptions = Readonly<Record<string, unknown>>;

const NO_OPTIONS: SeminarOptions = {};

/** The options of the deck, which its {@link Deck} provides. */
export const SeminarOptionsContext: Context<SeminarOptions> =
  createContext(NO_OPTIONS);

/**
 * Returns the options called `name` of the deck, like `math`, or
 * `undefined` if the deck has none.
 *
 * Decks written in MDX have the options of their configs and frontmatter
 * (see the `options` of `SeminarConfig`), as plugins that compile decks may
 * have replaced them.
 */
export function useSeminarOptions(name: string): unknown {
  const options = use(SeminarOptionsContext);
  return Object.hasOwn(options, name) ? options[name] : undefined;
}
