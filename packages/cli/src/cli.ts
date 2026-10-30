import { readFileSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { PagesPerSheet, PrintLayout, PrintOptions } from '@seminar/core';
import prompts from 'prompts';

import {
  buildDeck,
  buildDirectory,
  DECK_SUFFIX,
  findProject,
  findSources,
  pagePath,
  serveDeck,
  type BuildJob,
  type DevServer,
  type ServeJob,
} from './vite.ts';
import { findDecks, type DeckPage } from './decks.ts';
import {
  ELECTRON_VERSION,
  findElectron,
  installElectron,
  runElectron,
  type ElectronExit,
} from './electron.ts';
import {
  PAPER_SIZES,
  PRINT_FAILED,
  type PaperSize,
  type PdfJob,
  type PdfOutput,
  type PresentJob,
} from './job.ts';

const VERSION = (
  JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
).version;

const HELP = `Usage: seminar <command> [options]

Commands:
  present [path]      Build and present a deck of the project, or present
                      a built deck
  preview [path]      Preview a deck of the project with the dev server of
                      Vite, updating it as you edit it
  pdf [paths...]      Save built decks as PDF files (default: dist)
  install-electron    Download the Electron that Seminar runs, e.g., in CI

present builds a .deck.mdx file with Vite, or the deck of the Vite project
if no path is given, and asks which one if there are several. Give it an
.html page or a directory of built decks to present them without building.
It starts the presentation right away, letting you choose the screen of the
audience, and quits once you stop it.

preview chooses the deck like present, but serves it with the dev server
of Vite instead of building it, and doesn't start the presentation until
you press P.

Options of present and preview:
  --present                     Start the presentation right away when
                                previewing, and quit once you stop it
  --no-quit-at-end              Stay open once you stop the presentation,
                                or cancel choosing its screen
  --quit-at-end                 Quit then, also when previewing, which
                                starts the presentation right away

Options of pdf:
  --layout <slides|notes|grid>  Slides, slides with notes, or several slides
                                per sheet, or several of them, separated
                                by commas (default: slides)
  --per-sheet <2|4|6>           Slides on each sheet, or several numbers,
                                separated by commas (default: 4)
  --every-step                  A page for every step of the slides
  --spares                      Include spare slides
  --no-headers                  Leave out headers and footers of handouts
  --paper <size>                Paper of handouts: ${PAPER_SIZES.join(', ')}
                                (default: A4)
  --out-dir <dir>               Where to save the PDFs (default: next to
                                the decks)

PDFs of slides have the names of their decks, e.g., index.pdf, and those of
handouts end with their layout, e.g., index-notes.pdf or index-4up.pdf.

  -h, --help                    Show this help
  -v, --version                 Show the version
`;

const LAYOUTS: readonly PrintLayout[] = ['slides', 'notes', 'grid'];

const PER_SHEET: readonly PagesPerSheet[] = [2, 4, 6];

/** Returns the choices in `value`, separated by commas, without repeats. */
function choices<T>(value: string, options: readonly T[], error: string): T[] {
  return [
    ...new Set(
      value.split(',').map((item) => {
        const choice = options.find((option) => String(option) === item.trim());
        if (choice === undefined) {
          throw new Error(error);
        }
        return choice;
      }),
    ),
  ];
}

/** Returns what the name of a PDF of a deck ends with, after its name. */
function suffix({ layout, perSheet }: PrintOptions): string {
  switch (layout) {
    case 'slides':
      return '';
    case 'notes':
      return '-notes';
    case 'grid':
      return `-${String(perSheet)}up`;
  }
}

function paperChoice(value: string): PaperSize {
  const paper = PAPER_SIZES.find(
    (size) => size.toLowerCase() === value.toLowerCase(),
  );
  if (paper === undefined) {
    throw new Error(`Choose --paper ${PAPER_SIZES.join(', ')}.`);
  }
  return paper;
}

/** Overrides for embedding or testing the command. */
export interface RunOptions {
  cwd?: string;
  output?: (message: string) => void;
  /** Returns the executable of Electron, downloading it if needed. */
  electron?: () => Promise<string>;
  /** Prints the PDFs of `job`, calling `output` with each message. */
  print?: (job: PdfJob, output: (message: string) => void) => Promise<void>;
  /** Builds the deck of `job` with Vite, stopping if `signal` is aborted. */
  build?: (job: BuildJob, signal: AbortSignal) => Promise<void>;
  /**
   * Starts the dev server of Vite for the deck of `job`, stopping it if
   * `signal` is aborted.
   */
  serve?: (job: ServeJob, signal: AbortSignal) => Promise<DevServer>;
  /**
   * Presents or previews the deck of `job`, calling `output` with each
   * message, and stopping if `signal` is aborted.
   */
  present?: (
    job: PresentJob,
    output: (message: string) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  /**
   * Asks which of the decks with `labels` to show, and returns its index,
   * or `undefined` if it can't ask, e.g., outside of a terminal.
   */
  chooseDeck?: (labels: readonly string[]) => Promise<number | undefined>;
}

/** Returns the name of `file` in messages: relative to `cwd`, if in it. */
function label(cwd: string, file: string): string {
  const relative = path.relative(cwd, file);
  return relative.startsWith('..') || path.isAbsolute(relative)
    ? file
    : relative;
}

/**
 * Returns the item of `items` with one of `labels` that `chooseDeck` chooses,
 * or throws with the commands to choose one of them, if it can't ask.
 */
async function choose<T>(
  items: readonly T[],
  labels: readonly string[],
  several: string,
  command: string,
  chooseDeck: (labels: readonly string[]) => Promise<number | undefined>,
): Promise<T | undefined> {
  if (items.length <= 1) {
    return items[0];
  }
  const index = await chooseDeck(labels);
  if (index === undefined) {
    throw new Error(
      `${several} Choose one of them, e.g.:\n\n${labels.map((deck) => `  seminar ${command} ${deck}`).join('\n')}`,
    );
  }
  return items[index];
}

/** Thrown when the command was stopped by `signal` after cleaning up. */
export class Interrupted extends Error {
  readonly signal: NodeJS.Signals;

  constructor(signal: NodeJS.Signals) {
    super(`Stopped by ${signal}.`);
    this.signal = signal;
  }
}

/** Signals that stop the command, e.g., Ctrl+C or closing the terminal. */
const STOP_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGHUP', 'SIGTERM'];

/**
 * Runs `task` with an abort signal that is aborted by the signals that stop
 * the command, so that it can stop its child processes and clean up, and
 * then throws {@link Interrupted}. Stops right away on a second signal, in
 * case the task can't stop.
 */
async function interruptible(
  task: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const controller = new AbortController();
  let received: NodeJS.Signals | undefined;
  const removeListeners = () => {
    for (const signal of STOP_SIGNALS) {
      process.off(signal, stop);
    }
  };
  const stop = (signal: NodeJS.Signals) => {
    if (received !== undefined) {
      removeListeners();
      process.kill(process.pid, signal);
      return;
    }
    received = signal;
    controller.abort();
  };
  for (const signal of STOP_SIGNALS) {
    process.on(signal, stop);
  }
  try {
    await task(controller.signal);
  } catch (error) {
    if (received === undefined) {
      throw error;
    }
  } finally {
    removeListeners();
  }
  if (received !== undefined) {
    throw new Interrupted(received);
  }
}

async function chooseInTerminal(
  labels: readonly string[],
): Promise<number | undefined> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    return undefined;
  }
  const { deck } = (await prompts(
    {
      type: 'select',
      name: 'deck',
      message: 'Which deck to present?',
      choices: labels.map((title, value) => ({ title, value })),
    },
    {
      onCancel: () => {
        throw new Error('No deck chosen.');
      },
    },
  )) as { deck: number };
  return deck;
}

async function electron(output: (message: string) => void): Promise<string> {
  const found = findElectron();
  if (found !== undefined) {
    return found;
  }
  output(`Downloading Electron ${ELECTRON_VERSION}...`);
  return installElectron();
}

/** Throws if Electron didn't exit successfully. */
function checkExit({ code, signal, errors }: ElectronExit): void {
  if (code !== 0) {
    throw new Error(
      `${signal === null ? `Electron exited with code ${String(code)}` : `Electron stopped with signal ${signal}`}.${errors.trim() === '' ? '' : `\n\n${errors.trim()}`}`,
    );
  }
}

async function printWithElectron(
  job: PdfJob,
  output: (message: string) => void,
  executable: string,
): Promise<void> {
  const exit = await runElectron(
    executable,
    fileURLToPath(new URL('./app/pdf.js', import.meta.url)),
    [JSON.stringify(job)],
    output,
  );
  if (exit.code === PRINT_FAILED) {
    throw new Error('Some decks could not be printed.');
  }
  checkExit(exit);
}

async function presentWithElectron(
  job: PresentJob,
  output: (message: string) => void,
  executable: string,
  abortSignal: AbortSignal,
): Promise<void> {
  checkExit(
    await runElectron(
      executable,
      fileURLToPath(new URL('./app/present.js', import.meta.url)),
      [JSON.stringify(job)],
      // The terminal may be gone after a signal, e.g., SIGHUP.
      (line) => {
        if (!abortSignal.aborted) {
          output(line);
        }
      },
      { windows: true, abortSignal },
    ),
  );
}

/**
 * Returns the deck to build or serve for `command`: the `.deck.mdx` file at
 * `input`, or the deck of the Vite project that `cwd` is in, asking with
 * `chooseDeck` which one if there are several.
 */
async function chooseSource(
  input: string | undefined,
  command: string,
  cwd: string,
  chooseDeck: (labels: readonly string[]) => Promise<number | undefined>,
): Promise<ServeJob> {
  if (input !== undefined) {
    const deck = path.resolve(cwd, input);
    if (!(await stat(deck).catch(() => undefined))?.isFile()) {
      throw new Error(`${input} doesn't exist.`);
    }
    const project = findProject(path.dirname(deck));
    if (project === undefined) {
      throw new Error(
        `${input} isn't in a Vite project with a Vite config, e.g., vite.config.ts.`,
      );
    }
    return { project, deck };
  }
  const project = findProject(cwd);
  if (project === undefined) {
    throw new Error(
      `Found no Vite project here. Choose a deck to ${command}, e.g.:\n\n  seminar ${command} talk${DECK_SUFFIX}${command === 'present' ? '\n  seminar present dist/index.html' : ''}`,
    );
  }
  const sources = await findSources(project);
  const deck = await choose(
    sources,
    sources.map((source) => label(cwd, source)),
    'The project has several decks.',
    command,
    chooseDeck,
  );
  if (deck === undefined) {
    throw new Error(`The project in ${project} has no decks.`);
  }
  return { project, deck };
}

/** Runs the command with the arguments in `argv`. */
export async function run(
  argv: string[],
  {
    cwd = process.cwd(),
    output = console.log,
    electron: getElectron = () => electron(output),
    print = async (job, output) => {
      await printWithElectron(job, output, await getElectron());
    },
    present = async (job, output, signal) => {
      await presentWithElectron(job, output, await getElectron(), signal);
    },
    build = buildDeck,
    serve = serveDeck,
    chooseDeck = chooseInTerminal,
  }: RunOptions = {},
): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      layout: { type: 'string' },
      'per-sheet': { type: 'string' },
      'every-step': { type: 'boolean' },
      spares: { type: 'boolean' },
      headers: { type: 'boolean' },
      paper: { type: 'string' },
      'out-dir': { type: 'string' },
      present: { type: 'boolean' },
      'quit-at-end': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  const [command, ...paths] = positionals;
  // Whether the presentation starts right away, and the app quits at its
  // end, which is what starting it right away is for, unless asked not to.
  const presentNow =
    command !== 'preview' ||
    values.present === true ||
    values['quit-at-end'] === true;
  const quitAtEnd = values['quit-at-end'] ?? presentNow;
  if (values.help === true || command === 'help') {
    output(HELP);
    return;
  }
  if (values.version === true) {
    output(VERSION);
    return;
  }
  switch (command) {
    case 'pdf': {
      const perSheets =
        values['per-sheet'] === undefined
          ? [4 as const]
          : choices(
              values['per-sheet'],
              PER_SHEET,
              'Choose --per-sheet 2, 4, or 6, or several of them.',
            );
      const layouts: PrintLayout[] =
        values.layout === undefined
          ? [values['per-sheet'] === undefined ? 'slides' : 'grid']
          : choices(
              values.layout,
              LAYOUTS,
              'Choose --layout slides, notes, or grid, or several of them.',
            );
      if (values['per-sheet'] !== undefined && !layouts.includes('grid')) {
        throw new Error('Choose --per-sheet only with --layout grid.');
      }
      const prints = layouts.flatMap((layout): PrintOptions[] =>
        (layout === 'grid' ? perSheets : [4 as const]).map((perSheet) => ({
          pages: values['every-step'] === true ? 'steps' : 'split',
          spares: values.spares ?? false,
          layout,
          perSheet,
          headers: values.headers ?? true,
        })),
      );
      const decks = await findDecks(paths.length === 0 ? ['dist'] : paths, {
        cwd,
        outDir: values['out-dir'],
      });
      const job: PdfJob = {
        decks: decks.map(({ root, page, output }) => ({
          root,
          page,
          pdfs: prints.map((print): PdfOutput => {
            const file = `${output}${suffix(print)}.pdf`;
            return { print, output: file, label: label(cwd, file) };
          }),
        })),
        paper: values.paper === undefined ? 'A4' : paperChoice(values.paper),
      };
      await print(job, output);
      return;
    }
    case 'present': {
      if (paths.length > 1) {
        throw new Error('Choose one deck to present.');
      }
      const [input] = paths;
      if (input !== undefined && !input.endsWith(DECK_SUFFIX)) {
        const decks = await findDecks([input], { cwd });
        const deck = await choose(
          decks,
          decks.map(({ root, page }) => label(cwd, path.join(root, page))),
          `${input} has several decks.`,
          'present',
          chooseDeck,
        );
        if (deck === undefined) {
          throw new Error(`${input} has no decks.`);
        }
        await interruptible((signal) =>
          present(
            { root: deck.root, page: deck.page, quitAtEnd },
            output,
            signal,
          ),
        );
        return;
      }
      const { project, deck } = await chooseSource(
        input,
        'present',
        cwd,
        chooseDeck,
      );
      const outDir = buildDirectory(project, deck);
      await interruptible(async (signal) => {
        try {
          output(`Building ${label(cwd, deck)}...`);
          await build({ project, deck, outDir }, signal);
          // Older versions of the Vite plugin build all decks, so find the page
          // of the deck: the longest one that its path ends with.
          const page = `/${pagePath(project, deck)}`;
          const built = (
            await findDecks([outDir], { cwd }).catch((): DeckPage[] => [])
          )
            .filter((built) => page.endsWith(`/${built.page}`))
            .sort((a, b) => b.page.length - a.page.length)[0];
          if (built === undefined) {
            throw new Error(`Building ${label(cwd, deck)} made no deck.`);
          }
          await present(
            { root: built.root, page: built.page, quitAtEnd },
            output,
            signal,
          );
        } finally {
          await rm(outDir, { recursive: true, force: true });
        }
      });
      return;
    }
    case 'preview': {
      if (paths.length > 1) {
        throw new Error('Choose one deck to preview.');
      }
      const [input] = paths;
      if (input !== undefined && !input.endsWith(DECK_SUFFIX)) {
        throw new Error(
          `Choose a ${DECK_SUFFIX} file to preview. To present a built deck, use seminar present ${input}.`,
        );
      }
      const job = await chooseSource(input, 'preview', cwd, chooseDeck);
      await interruptible(async (signal) => {
        output(`Starting the dev server of ${label(cwd, job.deck)}...`);
        const server = await serve(job, signal);
        try {
          output(`Previewing ${server.url}`);
          await present(
            { url: server.url, present: presentNow, quitAtEnd },
            output,
            signal,
          );
        } finally {
          await server.close();
        }
      });
      return;
    }
    case 'install-electron': {
      if (paths.length > 0) {
        throw new Error('install-electron takes no paths.');
      }
      output(`Electron ${ELECTRON_VERSION} is at ${await getElectron()}`);
      return;
    }
    case undefined:
      throw new Error(`Choose a command.\n\n${HELP}`);
    default:
      throw new Error(`Unknown command ${JSON.stringify(command)}.\n\n${HELP}`);
  }
}
