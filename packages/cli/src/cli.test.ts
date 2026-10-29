import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BuildJob } from './vite.ts';
import { Interrupted, run } from './cli.ts';
import type { BuiltDeck, PdfJob, PresentJob } from './job.ts';

const DECK = '<!doctype html><body><div id="seminar-root"></div></body>';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'seminar-cli-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function page(name: string, html = DECK): Promise<void> {
  const file = path.join(directory, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
}

/** Runs the command, and returns the job that it prints, if any. */
async function pdf(...argv: string[]): Promise<PdfJob | undefined> {
  let printed: PdfJob | undefined;
  await run(argv, {
    cwd: directory,
    output: () => undefined,
    print: (job) => {
      printed = job;
      return Promise.resolve();
    },
  });
  return printed;
}

const SLIDES = {
  pages: 'split',
  spares: false,
  layout: 'slides',
  perSheet: 4,
  headers: true,
} as const;

describe('seminar pdf', () => {
  it('prints the decks in dist next to their pages', async () => {
    await page('dist/index.html');
    await page('dist/talks/second.html');
    await page('dist/other.html', '<!doctype html><p>Not a deck</p>');
    await page('dist/node_modules/package/deck.html');
    const job = await pdf('pdf');
    const dist = path.join(directory, 'dist');
    expect(job).toEqual({
      decks: [
        {
          root: dist,
          page: 'index.html',
          pdfs: [
            {
              print: SLIDES,
              output: path.join(dist, 'index.pdf'),
              label: path.join('dist', 'index.pdf'),
            },
          ],
        },
        {
          root: dist,
          page: 'talks/second.html',
          pdfs: [
            {
              print: SLIDES,
              output: path.join(dist, 'talks/second.pdf'),
              label: path.join('dist', 'talks/second.pdf'),
            },
          ],
        },
      ],
      paper: 'A4',
    });
  });

  it('prints handouts with the options chosen', async () => {
    await page('build/talk.html');
    const job = await pdf(
      'pdf',
      'build/talk.html',
      '--per-sheet',
      '6',
      '--every-step',
      '--spares',
      '--no-headers',
      '--paper',
      'letter',
      '--out-dir',
      'pdf',
    );
    expect(job).toEqual({
      decks: [
        {
          root: path.join(directory, 'build'),
          page: 'talk.html',
          pdfs: [
            {
              print: {
                pages: 'steps',
                spares: true,
                layout: 'grid',
                perSheet: 6,
                headers: false,
              },
              output: path.join(directory, 'pdf', 'talk-6up.pdf'),
              label: path.join('pdf', 'talk-6up.pdf'),
            },
          ],
        },
      ],
      paper: 'Letter',
    });
  });

  it('prints several layouts at once, with their names', async () => {
    await page('dist/index.html');
    const job = await pdf(
      'pdf',
      '--layout',
      'slides,notes,grid,notes',
      '--per-sheet',
      '2,6',
    );
    expect(
      job?.decks[0]?.pdfs.map(({ print: { layout, perSheet }, label }) => [
        layout,
        perSheet,
        label,
      ]),
    ).toEqual([
      ['slides', 4, path.join('dist', 'index.pdf')],
      ['notes', 4, path.join('dist', 'index-notes.pdf')],
      ['grid', 2, path.join('dist', 'index-2up.pdf')],
      ['grid', 6, path.join('dist', 'index-6up.pdf')],
    ]);
  });

  it('explains what is wrong with the paths and options', async () => {
    await expect(pdf('pdf')).rejects.toThrow(
      "dist doesn't exist. Build the decks first",
    );
    await page('dist/other.html', '<!doctype html><p>Not a deck</p>');
    await expect(pdf('pdf')).rejects.toThrow('dist has no decks.');
    await expect(pdf('pdf', 'dist/other.html')).rejects.toThrow(
      "dist/other.html isn't the page of a deck built by Seminar.",
    );
    await page('dist/index.html');
    await expect(pdf('pdf', '--layout', 'slides,poster')).rejects.toThrow(
      'Choose --layout slides, notes, or grid, or several of them.',
    );
    await expect(pdf('pdf', '--per-sheet', '3')).rejects.toThrow(
      'Choose --per-sheet 2, 4, or 6, or several of them.',
    );
    await expect(
      pdf('pdf', '--layout', 'notes', '--per-sheet', '2'),
    ).rejects.toThrow('Choose --per-sheet only with --layout grid.');
    await expect(pdf('pdf', '--paper', 'B5')).rejects.toThrow(
      'Choose --paper A3, A4, A5, Letter, Legal, Tabloid.',
    );
    await expect(pdf('publish')).rejects.toThrow('Unknown command "publish"');
  });
});

/** Makes a Vite project with a fake Vite, whose config has `root`. */
async function project(root?: string): Promise<void> {
  await page('vite.config.ts', '');
  await page(
    'node_modules/vite/package.json',
    JSON.stringify({
      name: 'vite',
      type: 'module',
      exports: { '.': './index.js', './package.json': './package.json' },
      bin: { vite: 'bin/vite.js' },
    }),
  );
  await page(
    'node_modules/vite/index.js',
    `export async function loadConfigFromFile() {
  return { config: ${JSON.stringify(root === undefined ? {} : { root })} };
}`,
  );
}

/** Returns `job` as a built deck, which `seminar present` presents. */
function built(job: PresentJob): BuiltDeck {
  if (!('root' in job)) {
    throw new Error(`Not a built deck: ${job.url}`);
  }
  return job;
}

interface Presented {
  job?: BuiltDeck;
  asked?: readonly string[];
  built?: BuildJob;
}

/**
 * Runs the command, choosing `choice` if it asks which deck to present, and
 * returns the job that it presents, what it asked, and what it built, if
 * anything. Builds decks into pages with their names.
 */
async function present(argv: string[], choice?: number): Promise<Presented> {
  const result: Presented = {};
  await run(argv, {
    cwd: directory,
    output: () => undefined,
    build: async (job) => {
      result.built = job;
      await mkdir(job.outDir, { recursive: true });
      await writeFile(
        path.join(job.outDir, path.basename(job.deck, '.deck.mdx') + '.html'),
        DECK,
      );
    },
    present: (job) => {
      result.job = built(job);
      expect(existsSync(path.join(result.job.root, result.job.page))).toBe(
        true,
      );
      return Promise.resolve();
    },
    chooseDeck: (labels) => {
      result.asked = labels;
      return Promise.resolve(choice);
    },
  });
  if (result.built !== undefined) {
    expect(existsSync(result.built.outDir)).toBe(false);
  }
  return result;
}

/** Resolves when `signal` is aborted. */
function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
    }
    signal.addEventListener('abort', () => {
      resolve();
    });
  });
}

describe('seminar present', () => {
  it('presents the deck in a directory', async () => {
    await page('dist/index.html');
    await page('dist/other.html', '<!doctype html><p>Not a deck</p>');
    expect(await present(['present', 'dist'])).toEqual({
      job: { root: path.join(directory, 'dist'), page: 'index.html' },
    });
  });

  it('presents a deck given by its page', async () => {
    await page('build/talk.html');
    await page('build/other.html');
    expect(await present(['present', 'build/talk.html'])).toEqual({
      job: { root: path.join(directory, 'build'), page: 'talk.html' },
    });
  });

  it('asks which deck to present if there are several', async () => {
    await page('dist/index.html');
    await page('dist/talks/second.html');
    expect(await present(['present', 'dist'], 1)).toEqual({
      job: { root: path.join(directory, 'dist'), page: 'talks/second.html' },
      asked: [
        path.join('dist', 'index.html'),
        path.join('dist', 'talks/second.html'),
      ],
    });
  });

  it("lists the decks if it can't ask which one to present", async () => {
    await page('dist/index.html');
    await page('dist/talks/second.html');
    await expect(present(['present', 'dist'])).rejects.toThrow(
      `dist has several decks. Choose one of them, e.g.:

  seminar present ${path.join('dist', 'index.html')}
  seminar present ${path.join('dist', 'talks/second.html')}`,
    );
    await expect(
      present(['present', 'dist/index.html', 'dist/talks/second.html']),
    ).rejects.toThrow('Choose one deck to present.');
  });

  it('builds and presents a deck given by its source', async () => {
    await page('vite.config.ts', '');
    await page('decks/talk.deck.mdx', '# Talk');
    await page('decks/other.deck.mdx', '# Other');
    const { built, job } = await present(['present', 'decks/talk.deck.mdx']);
    expect(built).toEqual({
      project: directory,
      deck: path.join(directory, 'decks/talk.deck.mdx'),
      outDir: path.join(
        directory,
        'node_modules/.cache/seminar/present/decks/talk',
      ),
    });
    expect(job).toEqual({ root: built?.outDir, page: 'talk.html' });
  });

  it('finds the page of the deck among others built with it', async () => {
    await page('vite.config.ts', '');
    await page('decks/talks/talk.deck.mdx', '# Talk');
    let presented: BuiltDeck | undefined;
    await run(['present', 'decks/talks/talk.deck.mdx'], {
      cwd: directory,
      output: () => undefined,
      build: async ({ outDir }) => {
        for (const name of ['talk.html', 'talks/talk.html', 'other.html']) {
          await mkdir(path.dirname(path.join(outDir, name)), {
            recursive: true,
          });
          await writeFile(path.join(outDir, name), DECK);
        }
      },
      present: (job) => {
        presented = built(job);
        return Promise.resolve();
      },
    });
    expect(presented?.page).toBe('talks/talk.html');
  });

  it('stops presenting and cleans up on a signal', async () => {
    await page('vite.config.ts', '');
    await page('decks/talk.deck.mdx', '# Talk');
    const listeners = process.listenerCount('SIGHUP');
    let outDir = '';
    const presenting = run(['present', 'decks/talk.deck.mdx'], {
      cwd: directory,
      output: () => undefined,
      build: async (job) => {
        outDir = job.outDir;
        await mkdir(outDir, { recursive: true });
        await writeFile(path.join(outDir, 'talk.html'), DECK);
      },
      present: async (_job, _output, signal) => {
        process.emit('SIGHUP', 'SIGHUP');
        // Like Electron, which exits when it is stopped.
        await aborted(signal);
      },
    });
    await expect(presenting).rejects.toEqual(new Interrupted('SIGHUP'));
    await expect(presenting).rejects.toHaveProperty('signal', 'SIGHUP');
    expect(existsSync(outDir)).toBe(false);
    expect(process.listenerCount('SIGHUP')).toBe(listeners);
  });

  it('stops building and cleans up on a signal', async () => {
    await page('vite.config.ts', '');
    await page('decks/talk.deck.mdx', '# Talk');
    let outDir = '';
    let presented = false;
    const presenting = run(['present', 'decks/talk.deck.mdx'], {
      cwd: directory,
      output: () => undefined,
      build: async (job, signal) => {
        outDir = job.outDir;
        await mkdir(outDir, { recursive: true });
        process.emit('SIGINT', 'SIGINT');
        await aborted(signal);
        throw new Error('vite build stopped with signal SIGTERM.');
      },
      present: () => {
        presented = true;
        return Promise.resolve();
      },
    });
    await expect(presenting).rejects.toHaveProperty('signal', 'SIGINT');
    expect(presented).toBe(false);
    expect(existsSync(outDir)).toBe(false);
  });

  it('builds and presents the only deck of the project', async () => {
    await project('decks');
    await page('decks/talk.deck.mdx', '# Talk');
    await page('src/fixture.deck.mdx', '# Outside of the root');
    await page('decks/page.deck.mdx', '# Page with its own HTML');
    await page('decks/page.html', '<!doctype html>');
    await page('node_modules/package/package.deck.mdx', '# Package');
    const { built, job, asked } = await present(['present']);
    expect(built?.deck).toBe(path.join(directory, 'decks/talk.deck.mdx'));
    expect(job?.page).toBe('talk.html');
    expect(asked).toBeUndefined();
  });

  it('asks which deck of the project to build', async () => {
    await project();
    await page('decks/talk.deck.mdx', '# Talk');
    await page('decks/other.deck.mdx', '# Other');
    const { built, asked } = await present(['present'], 1);
    expect(asked).toEqual([
      path.join('decks', 'other.deck.mdx'),
      path.join('decks', 'talk.deck.mdx'),
    ]);
    expect(built?.deck).toBe(path.join(directory, 'decks/talk.deck.mdx'));
    await expect(present(['present'])).rejects.toThrow(
      `The project has several decks. Choose one of them, e.g.:

  seminar present ${path.join('decks', 'other.deck.mdx')}
  seminar present ${path.join('decks', 'talk.deck.mdx')}`,
    );
  });

  it('explains what is missing to build a deck', async () => {
    await expect(present(['present'])).rejects.toThrow(
      'Found no Vite project here.',
    );
    await page('decks/talk.deck.mdx', '# Talk');
    await expect(present(['present', 'decks/talk.deck.mdx'])).rejects.toThrow(
      "decks/talk.deck.mdx isn't in a Vite project",
    );
    await page('vite.config.ts', '');
    await expect(present(['present', 'decks/other.deck.mdx'])).rejects.toThrow(
      "decks/other.deck.mdx doesn't exist.",
    );
    await expect(present(['present'])).rejects.toThrow(
      `Vite isn't installed in ${directory}.`,
    );
    await project();
    await rm(path.join(directory, 'decks'), { recursive: true });
    await expect(present(['present'])).rejects.toThrow(
      `The project in ${directory} has no decks.`,
    );
  });
});

describe('seminar preview', () => {
  /**
   * Runs the command, choosing `choice` if it asks which deck to preview, and
   * returns what it served, what it previewed, and whether it closed the dev
   * server afterwards.
   */
  async function preview(argv: string[], choice?: number) {
    const result: {
      served?: { project: string; deck: string };
      job?: PresentJob;
      closed: boolean;
    } = { closed: false };
    await run(argv, {
      cwd: directory,
      output: () => undefined,
      serve: (job) => {
        result.served = job;
        return Promise.resolve({
          url: 'http://127.0.0.1:1234/talk.html',
          close: () => {
            result.closed = true;
            return Promise.resolve();
          },
        });
      },
      present: (job) => {
        expect(result.closed).toBe(false);
        result.job = job;
        return Promise.resolve();
      },
      chooseDeck: () => Promise.resolve(choice),
    });
    return result;
  }

  it('previews the deck of the project with the dev server', async () => {
    await project('decks');
    await page('decks/talk.deck.mdx', '# Talk');
    expect(await preview(['preview'])).toEqual({
      served: {
        project: directory,
        deck: path.join(directory, 'decks/talk.deck.mdx'),
      },
      job: { url: 'http://127.0.0.1:1234/talk.html' },
      closed: true,
    });
  });

  it('previews a deck given by its source', async () => {
    await page('vite.config.ts', '');
    await page('decks/talk.deck.mdx', '# Talk');
    expect(
      (await preview(['preview', 'decks/talk.deck.mdx'])).served?.deck,
    ).toBe(path.join(directory, 'decks/talk.deck.mdx'));
  });

  it('only previews the sources of decks', async () => {
    await page('dist/index.html');
    await expect(preview(['preview', 'dist/index.html'])).rejects.toThrow(
      'Choose a .deck.mdx file to preview. To present a built deck, use seminar present dist/index.html.',
    );
    await project();
    await page('decks/talk.deck.mdx', '# Talk');
    await page('decks/other.deck.mdx', '# Other');
    await expect(preview(['preview'])).rejects.toThrow(
      `The project has several decks. Choose one of them, e.g.:

  seminar preview ${path.join('decks', 'other.deck.mdx')}`,
    );
  });

  it('stops the dev server on a signal', async () => {
    await page('vite.config.ts', '');
    await page('decks/talk.deck.mdx', '# Talk');
    let closed = false;
    const previewing = run(['preview', 'decks/talk.deck.mdx'], {
      cwd: directory,
      output: () => undefined,
      serve: () =>
        Promise.resolve({
          url: 'http://127.0.0.1:1234/talk.html',
          close: () => {
            closed = true;
            return Promise.resolve();
          },
        }),
      present: async (_job, _output, signal) => {
        process.emit('SIGINT', 'SIGINT');
        await aborted(signal);
      },
    });
    await expect(previewing).rejects.toHaveProperty('signal', 'SIGINT');
    expect(closed).toBe(true);
  });
});
