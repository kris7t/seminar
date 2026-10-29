import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDeck, buildDirectory } from './build.ts';

let project: string;

beforeEach(async () => {
  project = await mkdtemp(path.join(os.tmpdir(), 'seminar-build-'));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

/** Installs a fake Vite into `project` that runs `script` as its command. */
async function vite(script: string): Promise<void> {
  const directory = path.join(project, 'node_modules/vite');
  await mkdir(path.join(directory, 'bin'), { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'vite', bin: { vite: 'bin/vite.js' } }),
  );
  await writeFile(path.join(directory, 'bin/vite.js'), script);
}

describe('buildDirectory', () => {
  it('is the same for each deck in the cache of the project', () => {
    expect(
      buildDirectory(project, path.join(project, 'decks/talk.deck.mdx')),
    ).toBe(
      path.join(project, 'node_modules/.cache/seminar/present/decks/talk'),
    );
    expect(
      path.dirname(
        buildDirectory(project, path.join(project, '../other/talk.deck.mdx')),
      ),
    ).toBe(path.join(project, 'node_modules/.cache/seminar/present'));
  });
});

describe('buildDeck', () => {
  it('runs vite build with the deck to build', async () => {
    await vite(`import { writeFileSync } from 'node:fs';
writeFileSync('args.json', JSON.stringify({
  args: process.argv.slice(2),
  deck: process.env.SEMINAR_DECK,
}));`);
    await buildDeck({ project, deck: 'talk.deck.mdx', outDir: 'out' });
    expect(
      JSON.parse(await readFile(path.join(project, 'args.json'), 'utf8')),
    ).toEqual({
      args: ['build', '--outDir', 'out', '--emptyOutDir', '--logLevel', 'warn'],
      deck: 'talk.deck.mdx',
    });
  });

  it('stops Vite when aborted', async () => {
    await vite('setInterval(() => undefined, 1000);');
    const controller = new AbortController();
    const building = buildDeck(
      { project, deck: 'talk.deck.mdx', outDir: 'out' },
      controller.signal,
    );
    controller.abort();
    await expect(building).rejects.toThrow(
      'vite build stopped with signal SIGTERM.',
    );
  });
});
