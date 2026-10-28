import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { run } from './cli.ts';
import type { PdfJob } from './job.ts';

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
          output: path.join(dist, 'index.pdf'),
          label: path.join('dist', 'index.pdf'),
        },
        {
          root: dist,
          page: 'talks/second.html',
          output: path.join(dist, 'talks/second.pdf'),
          label: path.join('dist', 'talks/second.pdf'),
        },
      ],
      print: {
        pages: 'split',
        spares: false,
        layout: 'slides',
        perSheet: 4,
        headers: true,
      },
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
          output: path.join(directory, 'pdf', 'talk.pdf'),
          label: path.join('pdf', 'talk.pdf'),
        },
      ],
      print: {
        pages: 'steps',
        spares: true,
        layout: 'grid',
        perSheet: 6,
        headers: false,
      },
      paper: 'Letter',
    });
    expect((await pdf('pdf', 'build', '--layout', 'notes'))?.print).toEqual(
      expect.objectContaining({ layout: 'notes' }),
    );
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
    await expect(pdf('pdf', '--layout', 'poster')).rejects.toThrow(
      'Choose --layout slides, notes, or grid.',
    );
    await expect(pdf('pdf', '--per-sheet', '3')).rejects.toThrow(
      'Choose --per-sheet 2, 4, or 6.',
    );
    await expect(pdf('pdf', '--paper', 'B5')).rejects.toThrow(
      'Choose --paper A3, A4, A5, Letter, Legal, Tabloid.',
    );
    await expect(pdf('present')).rejects.toThrow('Unknown command "present"');
  });
});
