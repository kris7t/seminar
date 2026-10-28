import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { PagesPerSheet, PrintLayout, PrintOptions } from '@seminar/core';

import { findDecks } from './decks.ts';
import {
  ELECTRON_VERSION,
  findElectron,
  installElectron,
  runElectron,
} from './electron.ts';
import {
  PAPER_SIZES,
  PRINT_FAILED,
  type PaperSize,
  type PdfJob,
  type PdfOutput,
} from './job.ts';

const VERSION = (
  JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
).version;

const HELP = `Usage: seminar <command> [options]

Commands:
  pdf [paths...]      Save built decks as PDF files (default: dist)
  install-electron    Download what Seminar needs to save PDFs, e.g., in CI

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
}

async function electron(output: (message: string) => void): Promise<string> {
  const found = findElectron();
  if (found !== undefined) {
    return found;
  }
  output(`Downloading Electron ${ELECTRON_VERSION}...`);
  return installElectron();
}

async function printWithElectron(
  job: PdfJob,
  output: (message: string) => void,
  executable: string,
): Promise<void> {
  const { code, signal, errors } = await runElectron(
    executable,
    fileURLToPath(new URL('./app/main.js', import.meta.url)),
    [JSON.stringify(job)],
    output,
  );
  if (code === PRINT_FAILED) {
    throw new Error('Some decks could not be printed.');
  }
  if (code !== 0) {
    throw new Error(
      `${signal === null ? `Electron exited with code ${String(code)}` : `Electron stopped with signal ${signal}`}.${errors.trim() === '' ? '' : `\n\n${errors.trim()}`}`,
    );
  }
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
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  const [command, ...paths] = positionals;
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
            const relative = path.relative(cwd, file);
            return {
              print,
              output: file,
              label:
                relative.startsWith('..') || path.isAbsolute(relative)
                  ? file
                  : relative,
            };
          }),
        })),
        paper: values.paper === undefined ? 'A4' : paperChoice(values.paper),
      };
      await print(job, output);
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
