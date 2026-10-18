import { createContext, use, type Context } from 'react';

/** The options of a deck by their name, see `SliderConfig`. */
export type SliderOptions = Readonly<Record<string, unknown>>;

const NO_OPTIONS: SliderOptions = {};

/** The options of the deck, which its {@link Deck} provides. */
export const SliderOptionsContext: Context<SliderOptions> =
  createContext(NO_OPTIONS);

/**
 * Returns the options called `name` of the deck, like `math`, or
 * `undefined` if the deck has none.
 *
 * Decks written in MDX have the options of their configs and frontmatter
 * (see the `options` of `SliderConfig`), as plugins that compile decks may
 * have replaced them.
 */
export function useSliderOptions(name: string): unknown {
  const options = use(SliderOptionsContext);
  return Object.hasOwn(options, name) ? options[name] : undefined;
}
