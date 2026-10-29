import { existsSync, globSync } from 'node:fs';
import path from 'node:path';

import type { UserConfig } from 'vite';

export const DECK_SUFFIX = '.deck.mdx';

/** Prefix of the names of the build environments of self-contained decks. */
export const ENVIRONMENT_PREFIX = 'seminar_deck_';
export const HTML_SUFFIX = '.html';

/** The inputs of a build. */
export type Input = NonNullable<
  NonNullable<NonNullable<UserConfig['build']>['rolldownOptions']>['input']
>;

/** Returns the deck that `htmlPath` is generated for, e.g., `talk.html`. */
export function getDeckPath(htmlPath: string): string {
  return htmlPath.slice(0, -HTML_SUFFIX.length) + DECK_SUFFIX;
}

/** Returns the HTML page generated for `deckPath`, e.g., `talk.deck.mdx`. */
export function getHtmlPath(deckPath: string): string {
  return deckPath.slice(0, -DECK_SUFFIX.length) + HTML_SUFFIX;
}

/**
 * Environment variable with the path of the only deck to build or serve, if
 * set, e.g., by `seminar present`, which leaves out the other decks and pages.
 */
export const DECK_ENV = 'SEMINAR_DECK';

/** Returns the only deck to build from {@link DECK_ENV}, if it is set. */
export function selectedDeck(): string | undefined {
  const deck = process.env[DECK_ENV];
  return deck === undefined || deck === '' ? undefined : deck;
}

/** Whether `file` is inside of the directory `root`, not in a sibling. */
export function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/**
 * Finds the decks in `root` that get generated HTML pages, i.e., that don't
 * have a real HTML file next to them, or only the deck in {@link DECK_ENV}.
 */
export function findDecks(root: string): string[] {
  const selected = selectedDeck();
  if (selected !== undefined) {
    const deck = path.resolve(selected);
    if (!deck.endsWith(DECK_SUFFIX) || !existsSync(deck)) {
      throw new Error(`${DECK_ENV}=${selected} isn't a deck.`);
    }
    if (!isInside(root, deck) || existsSync(getHtmlPath(deck))) {
      throw new Error(
        `${DECK_ENV}=${selected} doesn't get a generated page in ${root}.`,
      );
    }
    return [deck];
  }
  return globSync(`**/*${DECK_SUFFIX}`, {
    cwd: root,
    exclude: ['**/node_modules/**'],
  })
    .map((deck) => path.join(root, deck))
    .filter((deck) => !existsSync(getHtmlPath(deck)));
}

/** Removes the inputs in `excluded` from `input`. */
export function removeInputs(
  input: Input | undefined,
  excluded: ReadonlySet<string>,
): Input | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (typeof input === 'string') {
    return excluded.has(input) ? [] : input;
  }
  if (Array.isArray(input)) {
    return input.filter((item) => !excluded.has(item));
  }
  return Object.fromEntries(
    Object.entries(input).filter(([, item]) => !excluded.has(item)),
  );
}

/** Whether `input` has no entry points. */
export function isEmptyInput(input: Input | undefined): boolean {
  if (input === undefined || typeof input === 'string') {
    return false;
  }
  return Array.isArray(input)
    ? input.length === 0
    : Object.keys(input).length === 0;
}
