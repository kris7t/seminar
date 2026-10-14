import { existsSync, globSync } from 'node:fs';
import path from 'node:path';

import type { UserConfig } from 'vite';

export const DECK_SUFFIX = '.deck.mdx';
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
 * Finds the decks in `root` that get generated HTML pages, i.e., that don't
 * have a real HTML file next to them.
 */
export function findDecks(root: string): string[] {
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
