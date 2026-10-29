import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DECK_ENV, findDecks } from './decks.ts';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'seminar-decks-'));
  for (const file of [
    'decks/talk.deck.mdx',
    'decks/other.deck.mdx',
    'decks/page.deck.mdx',
    'decks/page.html',
    'node_modules/package/package.deck.mdx',
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), '');
  }
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe('findDecks', () => {
  it('finds the decks that get generated pages', () => {
    expect(findDecks(root).sort()).toEqual([
      path.join(root, 'decks/other.deck.mdx'),
      path.join(root, 'decks/talk.deck.mdx'),
    ]);
  });

  it(`only finds the deck in ${DECK_ENV}`, () => {
    vi.stubEnv(DECK_ENV, path.join(root, 'decks/talk.deck.mdx'));
    expect(findDecks(root)).toEqual([path.join(root, 'decks/talk.deck.mdx')]);
  });

  it(`rejects other files in ${DECK_ENV}`, () => {
    vi.stubEnv(DECK_ENV, path.join(root, 'decks/missing.deck.mdx'));
    expect(() => findDecks(root)).toThrow("missing.deck.mdx isn't a deck.");
    vi.stubEnv(DECK_ENV, path.join(root, 'decks/page.deck.mdx'));
    expect(() => findDecks(root)).toThrow(
      `page.deck.mdx doesn't get a generated page in ${root}.`,
    );
    expect(() => findDecks(path.join(root, 'node_modules'))).toThrow(
      "doesn't get a generated page",
    );
  });
});
