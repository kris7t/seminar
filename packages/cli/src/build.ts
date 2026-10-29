import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

/** What we need from the API of Vite. */
interface Vite {
  loadConfigFromFile(
    configEnv: {
      command: 'build';
      mode: string;
      isSsrBuild: boolean;
      isPreview: boolean;
    },
    configFile: undefined,
    configRoot: string,
  ): Promise<{ config: { root?: string } } | null>;
}

/**
 * Returns the root directory of the Vite project in `project`, as its Vite
 * config sets it.
 */
async function findRoot(project: string): Promise<string> {
  const vite = (await import(
    pathToFileURL(resolveVite(project, 'vite')).href
  )) as Vite;
  const loaded = await vite.loadConfigFromFile(
    {
      command: 'build',
      mode: 'production',
      isSsrBuild: false,
      isPreview: false,
    },
    undefined,
    project,
  );
  // Vite resolves the root from the working directory, where it is run.
  return path.resolve(project, loaded?.config.root ?? '.');
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
 * and errors in the terminal.
 */
export function buildDeck({ project, deck, outDir }: BuildJob): Promise<void> {
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
    child.once('error', reject);
    child.once('close', (code, signal) => {
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
