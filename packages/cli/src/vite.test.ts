import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDeck, buildDirectory, findSources, serveDeck } from './vite.ts';

let project: string;

beforeEach(async () => {
  project = await mkdtemp(path.join(os.tmpdir(), 'seminar-build-'));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

/**
 * Installs a fake Vite into `project` that runs `script` as its command, and
 * whose API is the module `api`.
 */
async function vite(script: string, api = ''): Promise<void> {
  const directory = path.join(project, 'node_modules/vite');
  await mkdir(path.join(directory, 'bin'), { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'vite',
      type: 'module',
      exports: { '.': './index.js', './package.json': './package.json' },
      bin: { vite: 'bin/vite.js' },
    }),
  );
  await writeFile(path.join(directory, 'bin/vite.js'), script);
  await writeFile(path.join(directory, 'index.js'), api);
}

/** The API of a fake Vite whose dev server listens on port 1234. */
const SERVER_API = `export async function createServer(config) {
  return {
    config: { root: process.cwd() },
    httpServer: { address: () => ({ port: 1234 }) },
    listen: async () => undefined,
  };
}`;

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

describe('findSources', () => {
  it('finds the decks in the root of the config', async () => {
    await vite(
      '',
      `// Like modules that, e.g., clean up on signals.
process.on('SIGHUP', () => undefined);
export async function loadConfigFromFile(_env, _file, root) {
  return { config: { root: 'decks' } };
}`,
    );
    for (const file of ['decks/talk.deck.mdx', 'src/fixture.deck.mdx']) {
      await mkdir(path.dirname(path.join(project, file)), { recursive: true });
      await writeFile(path.join(project, file), '');
    }
    const listeners = process.listenerCount('SIGHUP');
    expect(await findSources(project)).toEqual([
      path.join(project, 'decks/talk.deck.mdx'),
    ]);
    expect(process.listenerCount('SIGHUP')).toBe(listeners);
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

describe('serveDeck', () => {
  it('starts the dev server, and returns the URL of the deck', async () => {
    await vite('', SERVER_API);
    const server = await serveDeck({
      project,
      deck: path.join(project, 'decks/my talk.deck.mdx'),
    });
    expect(server.url).toBe('http://127.0.0.1:1234/decks/my%20talk.html');
    await server.close();
  });

  it('stops the dev server when aborted', async () => {
    await vite(
      '',
      `export async function createServer() {
  await new Promise(() => setInterval(() => undefined, 1000));
}`,
    );
    const controller = new AbortController();
    const serving = serveDeck(
      { project, deck: path.join(project, 'talk.deck.mdx') },
      controller.signal,
    );
    controller.abort();
    await expect(serving).rejects.toThrow(
      'The dev server of Vite stopped with signal SIGTERM.',
    );
  });
});
