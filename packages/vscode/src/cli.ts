import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { findPackage } from '@seminar/mdx/syntax';

/**
 * Returns the script to run with Node for the `seminar` command of the
 * `@seminar/cli` of the project of the file `deck`, or `undefined` if it isn't
 * installed.
 */
export function findCli(deck: string): string | undefined {
  const cli = findPackage('@seminar/cli', deck);
  if (cli === undefined) {
    return undefined;
  }
  const { bin } = JSON.parse(
    readFileSync(path.join(cli, 'package.json'), 'utf8'),
  ) as { bin: { seminar: string } };
  return path.join(cli, bin.seminar);
}

/** Names of the config files that Vite looks for. */
const VITE_CONFIGS = [
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
  'vite.config.cjs',
  'vite.config.mts',
  'vite.config.cts',
];

/**
 * Returns the directory of the Vite project of the file `deck`, i.e., the
 * closest one with a Vite config, like `seminar` finds it, if any.
 */
export function findProject(deck: string): string | undefined {
  let current = path.dirname(deck);
  for (;;) {
    if (VITE_CONFIGS.some((config) => existsSync(path.join(current, config)))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

const DECK_SUFFIX = '.deck.mdx';

/** Whether the file at `file` is in the directory at `directory`. */
export function isInside(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  );
}

/**
 * Returns the deck with the page at the path `page` of the URL of a dev server
 * with the root directory `root`, if the page can be one.
 */
export function deckOfPage(root: string, page: string): string | undefined {
  if (!page.endsWith('.html')) {
    return undefined;
  }
  let relative;
  try {
    relative = decodeURIComponent(page.slice(1, -'.html'.length));
  } catch {
    return undefined;
  }
  const deck = path.join(root, `${relative}${DECK_SUFFIX}`);
  return path.relative(root, deck).startsWith('..') ? undefined : deck;
}

/**
 * Returns the URL of the page of `deck` at the URL `base` of a dev server with
 * the root directory `root`, with the query `query`, if any, or `undefined` if
 * the deck isn't in the root.
 */
export function deckPage(
  base: string,
  root: string,
  deck: string,
  query = '',
): string | undefined {
  const relative = path.relative(root, deck);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  const page = relative
    .slice(0, -DECK_SUFFIX.length)
    .split(path.sep)
    .map(encodeURIComponent)
    .join('/');
  return new URL(`${page}.html${query}`, base).href;
}
