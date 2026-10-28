import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { PdfDeck } from './job.ts';

/** What the pages of decks built by Seminar render the deck into. */
const ROOT_MARKER = 'id="seminar-root"';

async function isDeck(file: string): Promise<boolean> {
  return (await readFile(file, 'utf8')).includes(ROOT_MARKER);
}

/**
 * Returns the pages of decks to print from `inputs`: the pages themselves, or
 * directories with pages, e.g., the output of `vite build`, with the PDFs
 * next to the pages, or in the same place in `outDir`.
 */
export async function findDecks(
  inputs: readonly string[],
  { cwd, outDir }: { cwd: string; outDir?: string | undefined },
): Promise<PdfDeck[]> {
  const decks: PdfDeck[] = [];
  const add = (root: string, page: string) => {
    const pdf = page.replace(/\.html?$/i, '.pdf');
    const output =
      outDir === undefined
        ? path.join(root, pdf)
        : path.resolve(cwd, outDir, pdf);
    const relative = path.relative(cwd, output);
    decks.push({
      root,
      page: page.split(path.sep).join('/'),
      output,
      label:
        relative.startsWith('..') || path.isAbsolute(relative)
          ? output
          : relative,
    });
  };
  for (const input of inputs) {
    const resolved = path.resolve(cwd, input);
    const stats = await stat(resolved).catch(() => undefined);
    if (stats === undefined) {
      throw new Error(
        `${input} doesn't exist. Build the decks first, e.g., with vite build.`,
      );
    }
    if (stats.isDirectory()) {
      const pages = (await readdir(resolved, { recursive: true }))
        .filter(
          (page) =>
            /\.html?$/i.test(page) &&
            !page
              .split(path.sep)
              .some((part) => part === 'node_modules' || part.startsWith('.')),
        )
        .sort();
      const before = decks.length;
      for (const page of pages) {
        if (await isDeck(path.join(resolved, page))) {
          add(resolved, page);
        }
      }
      if (decks.length === before) {
        throw new Error(
          `${input} has no decks. Build them first, e.g., with vite build.`,
        );
      }
    } else if (await isDeck(resolved)) {
      add(path.dirname(resolved), path.basename(resolved));
    } else {
      throw new Error(`${input} isn't the page of a deck built by Seminar.`);
    }
  }
  return decks;
}
