import type { Dispatch, SetStateAction } from 'react';

import { useStateValue } from './useStateValue.ts';

/** Family of the values of {@link useDeckState}. */
const DECK_STATE = {};

/**
 * Like `useState`, but the state belongs to the deck, so every slide that
 * uses the same `key` shares it, e.g., to show on one slide what the audience
 * chose on another.
 *
 * The state is `undefined` until it is set, so that every slide that uses it
 * starts from the same value. Setting it to `undefined` resets it. The
 * presenter resets the state of the deck with Reset deck in the menu.
 */
export function useDeckState<T>(
  key: string,
): [T | undefined, Dispatch<SetStateAction<T | undefined>>] {
  return useStateValue<T | undefined>('deck', DECK_STATE, key);
}
