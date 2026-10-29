import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DECK_SUFFIX = '.deck.mdx';

/** The environment variable that makes the Vite plugin build only a deck. */
const DECK_ENV = 'SEMINAR_DECK';

/** Names of the config files that Vite looks for, in its order. */
const VITE_CONFIGS = [
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
  'vite.config.cjs',
  'vite.config.mts',
  'vite.config.cts',
];

/**
 * Returns the directory of the Vite project that `directory` is in, i.e., the
 * closest one with a Vite config, if any.
 */
export function findProject(directory: string): string | undefined {
  let current = path.resolve(directory);
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

/**
 * Returns the path of the page that Vite generates for `deck` in `root`, with
 * `/` separators, e.g., `talks/intro.html` for `talks/intro.deck.mdx`.
 */
export function pagePath(root: string, deck: string): string {
  return `${path
    .relative(root, deck)
    .slice(0, -DECK_SUFFIX.length)
    .split(path.sep)
    .join('/')}.html`;
}

/** Returns the path of `specifier` imported from the Vite project in `project`. */
function resolveVite(project: string, specifier: string): string {
  try {
    return createRequire(path.join(project, 'package.json')).resolve(specifier);
  } catch {
    throw new Error(
      `Vite isn't installed in ${project}. Install the dependencies first, e.g., with npm install.`,
    );
  }
}

/**
 * Returns the path of the script `name` that runs in a process of its own,
 * which is TypeScript like this module when running from the sources, e.g.,
 * in tests.
 */
function script(name: string): string {
  return fileURLToPath(
    new URL(
      `./${name}${path.extname(fileURLToPath(import.meta.url))}`,
      import.meta.url,
    ),
  );
}

/** What the script that reads the config of Vite sends. */
export interface RootMessage {
  root: string;
}

/**
 * Returns the root directory of the Vite project in `project`, as its Vite
 * config sets it. The config is loaded in a process of its own, since it
 * may load modules that, e.g., listen for signals.
 */
function findRoot(project: string): Promise<string> {
  const vite = resolveVite(project, 'vite');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script('viteRoot'), vite], {
      cwd: project,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    child.once('error', reject);
    child.once('message', ({ root }: RootMessage) => {
      resolve(root);
    });
    child.once('close', () => {
      // Unless it has already sent the root.
      reject(new Error(`Vite could not load the config of ${project}.`));
    });
  });
}

/**
 * Returns the decks of the Vite project in `project` that the Vite plugin
 * generates pages for, i.e., those in its root without a real HTML file next
 * to them.
 */
export async function findSources(project: string): Promise<string[]> {
  const root = await findRoot(project);
  return (await readdir(root, { recursive: true }))
    .filter(
      (file) =>
        file.endsWith(DECK_SUFFIX) &&
        !file
          .split(path.sep)
          .some((part) => part === 'node_modules' || part.startsWith('.')) &&
        !existsSync(
          path.join(root, `${file.slice(0, -DECK_SUFFIX.length)}.html`),
        ),
    )
    .sort()
    .map((file) => path.join(root, file));
}

/** A deck to build. */
export interface BuildJob {
  /** Directory of the Vite project, with its config. */
  project: string;
  /** Path of the `.deck.mdx` file. */
  deck: string;
  /** Directory to build the deck into. */
  outDir: string;
}

/**
 * Returns the directory in `project` to build `deck` into: the same one every
 * time, so that `vite build` empties it of the previous build, even if that
 * couldn't be removed, e.g., because the command was killed.
 */
export function buildDirectory(project: string, deck: string): string {
  const cache = path.join(project, 'node_modules/.cache/seminar/present');
  const relative = path.relative(project, deck).slice(0, -DECK_SUFFIX.length);
  return relative.startsWith('..') || path.isAbsolute(relative)
    ? path.join(cache, createHash('sha256').update(deck).digest('hex'))
    : path.join(cache, relative);
}

/** Returns the executable script of the Vite installed in `project`. */
function findVite(project: string): string {
  const manifest = resolveVite(project, 'vite/package.json');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as {
    bin: { vite: string };
  };
  return path.join(path.dirname(manifest), bin.vite);
}

/**
 * Builds only the deck of `job` with `vite build`, which shows its warnings
 * and errors in the terminal. Stops Vite when `abortSignal` is aborted, and settles
 * once it has exited.
 */
export function buildDeck(
  { project, deck, outDir }: BuildJob,
  abortSignal?: AbortSignal,
): Promise<void> {
  abortSignal?.throwIfAborted();
  const vite = findVite(project);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        vite,
        'build',
        '--outDir',
        outDir,
        '--emptyOutDir',
        '--logLevel',
        'warn',
      ],
      {
        cwd: project,
        env: { ...process.env, [DECK_ENV]: deck },
        stdio: ['ignore', 'inherit', 'inherit'],
      },
    );
    const stop = () => child.kill();
    abortSignal?.addEventListener('abort', stop, { once: true });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      abortSignal?.removeEventListener('abort', stop);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            signal === null
              ? `vite build exited with code ${String(code)}.`
              : `vite build stopped with signal ${signal}.`,
          ),
        );
      }
    });
  });
}

/** A deck to serve with the dev server of Vite. */
export interface ServeJob {
  /** Directory of the Vite project, with its config. */
  project: string;
  /** Path of the `.deck.mdx` file. */
  deck: string;
}

/** A running dev server of Vite. */
export interface DevServer {
  /** URL of the page of the deck. */
  url: string;
  /** Stops the dev server, and resolves once it has exited. */
  close: () => Promise<void>;
}

/** What the script of the dev server sends once it serves the deck. */
export interface DevServerMessage {
  url: string;
}

/**
 * Starts the dev server of Vite for the deck of `job` on a free port, in a
 * process of its own, which shows its warnings and errors in the terminal.
 * Stops it when `abortSignal` is aborted.
 */
export function serveDeck(
  { project, deck }: ServeJob,
  abortSignal?: AbortSignal,
): Promise<DevServer> {
  abortSignal?.throwIfAborted();
  const vite = resolveVite(project, 'vite');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script('devServer'), vite, deck], {
      cwd: project,
      env: { ...process.env, [DECK_ENV]: deck },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const stop = () => child.kill();
    abortSignal?.addEventListener('abort', stop, { once: true });
    const exited = new Promise<void>((resolve) => {
      child.once('close', () => {
        abortSignal?.removeEventListener('abort', stop);
        resolve();
      });
    });
    child.once('error', reject);
    child.once('message', ({ url }: DevServerMessage) => {
      resolve({
        url,
        close: async () => {
          stop();
          await exited;
        },
      });
    });
    child.once('close', (code, signal) => {
      // Unless it has already sent the URL.
      reject(
        new Error(
          signal === null
            ? `The dev server of Vite exited with code ${String(code)}.`
            : `The dev server of Vite stopped with signal ${signal}.`,
        ),
      );
    });
  });
}
