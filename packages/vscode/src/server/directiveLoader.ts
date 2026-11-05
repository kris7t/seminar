import { spawn, type ChildProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readDeckTheme } from '@seminar/mdx/syntax';

import { findProject } from '../cli.ts';

/** A React component that renders a directive, see `@seminar/mdx`. */
export interface DirectiveComponent {
  source: string;
  exportName: string;
  formProp?: string | undefined;
  labelProp?: string | undefined;
  wrapIn?: string | undefined;
}

/** A named export of a module. */
export interface ModuleExport {
  source: string;
  exportName: string;
}

/**
 * The directive components of a deck, and the handlers of its code blocks, as
 * `directiveComponents` of `@seminar/rollup-plugin` tells them.
 */
export interface DeckDirectiveComponents {
  directives: Record<string, DirectiveComponent>;
  codeBlocks: Record<string, ModuleExport>;
  /** Files that the registrations were loaded from. */
  dependencies: string[];
  warnings: string[];
}

/** What the language server asks the worker. */
export interface DirectiveRequest {
  id: number;
  deck: string;
  source: string;
}

/** What the worker answers, or tells once it has loaded the config. */
export type DirectiveResponse =
  /** With the files that the config was loaded from. */
  | { ready: true; dependencies: string[] }
  | { id: number; components: DeckDirectiveComponents }
  | { id: number; error: string };

/**
 * Returns the real path of `file`, as the editor tells changes, e.g., of
 * packages of a workspace that `node_modules` links to.
 */
function realPath(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

/** How long the worker may take to load the config or answer. */
const TIMEOUT = 30_000;

/**
 * Returns the path of the worker, which is TypeScript like this module when
 * running from the sources, e.g., in tests.
 */
function workerScript(): string {
  return fileURLToPath(
    new URL(
      `./directiveWorker${path.extname(fileURLToPath(import.meta.url))}`,
      import.meta.url,
    ),
  );
}

/** A worker that has loaded the Vite config of a project. */
interface Worker {
  child: ChildProcess;
  ready: Promise<void>;
  /** The files that the config was loaded from, once it's ready. */
  dependencies: string[];
  pending: Map<
    number,
    {
      resolve: (components: DeckDirectiveComponents) => void;
      reject: (error: Error) => void;
    }
  >;
}

/** Directive components that are loaded or being loaded. */
interface Loaded {
  project: string;
  components: Promise<DeckDirectiveComponents>;
  /** The components, once they are loaded. */
  result?: DeckDirectiveComponents | undefined;
  /** The files that they were loaded from, once they are loaded. */
  dependencies: string[];
  /** Whether they couldn't be loaded, until a file changes. */
  failed: boolean;
}

/**
 * Loads the directive components of decks from the Vite configs of their
 * projects, which it runs in processes of their own, like Vite would. Only for
 * trusted workspaces, since it runs the code of the project.
 */
export class DirectiveLoader {
  readonly #script: string;
  readonly #workers = new Map<string, Worker>();
  /** Loaded components by the project, the directory of the deck, and its theme. */
  readonly #loaded = new Map<string, Loaded>();
  #nextId = 0;

  constructor(script = workerScript()) {
    this.#script = script;
  }

  /**
   * Returns the directive components of the deck at `deck` with `source`,
   * which are the same for decks in the same directory with the same theme.
   * Rejects if the deck isn't in a Vite project with the Seminar plugin, or the
   * config can't be loaded.
   */
  load(deck: string, source: string): Promise<DeckDirectiveComponents> {
    const project = findProject(deck);
    if (project === undefined) {
      return Promise.reject(new Error(`${deck} isn't in a Vite project.`));
    }
    const key = this.#key(project, deck, source);
    const existing = this.#loaded.get(key);
    if (existing !== undefined) {
      return existing.components;
    }
    const loaded: Loaded = {
      project,
      components: this.#request(project, deck, source),
      dependencies: [],
      failed: false,
    };
    this.#loaded.set(key, loaded);
    loaded.components.then(
      (result) => {
        loaded.result = result;
        loaded.dependencies = result.dependencies.map(realPath);
      },
      () => {
        loaded.failed = true;
      },
    );
    return loaded.components;
  }

  /**
   * Returns the directive components of the deck at `deck` with `source`, if
   * they are loaded, without loading them.
   */
  loaded(deck: string, source: string): DeckDirectiveComponents | undefined {
    const project = findProject(deck);
    return project === undefined
      ? undefined
      : this.#loaded.get(this.#key(project, deck, source))?.result;
  }

  #key(project: string, deck: string, source: string): string {
    return [project, path.dirname(deck), readDeckTheme(source) ?? ''].join(
      '\0',
    );
  }

  /**
   * Forgets what was loaded from `file`, e.g., when it changes, and stops the
   * worker of its project, which may have cached it. If `file` is the Vite
   * config, or one it was loaded from, forgets everything of the project.
   * Forgets what couldn't be loaded on any change, e.g., to try again once the
   * config is fixed.
   *
   * @returns Whether it forgot anything.
   */
  invalidate(changedFile: string): boolean {
    const file = realPath(changedFile);
    const changed = new Set<string>();
    for (const [project, worker] of this.#workers) {
      if (worker.dependencies.includes(file)) {
        changed.add(project);
      }
    }
    let forgot = false;
    for (const [key, { project, dependencies, failed }] of this.#loaded) {
      if (failed || changed.has(project)) {
        this.#loaded.delete(key);
        forgot = true;
      } else if (dependencies.includes(file)) {
        this.#loaded.delete(key);
        changed.add(project);
        forgot = true;
      }
    }
    for (const project of changed) {
      const worker = this.#workers.get(project);
      if (worker !== undefined) {
        this.#stop(project, worker);
      }
    }
    return forgot;
  }

  /** Stops the workers. */
  dispose(): void {
    for (const [project, worker] of this.#workers) {
      this.#stop(project, worker);
    }
  }

  async #request(
    project: string,
    deck: string,
    source: string,
  ): Promise<DeckDirectiveComponents> {
    const worker = this.#worker(project);
    await worker.ready;
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.pending.delete(id);
        reject(new Error(`Loading the directives of ${deck} timed out.`));
      }, TIMEOUT);
      worker.pending.set(id, {
        resolve: (components) => {
          clearTimeout(timer);
          resolve(components);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      worker.child.send({ id, deck, source } satisfies DirectiveRequest);
    });
  }

  #worker(project: string): Worker {
    const existing = this.#workers.get(project);
    if (existing !== undefined) {
      return existing;
    }
    let vite: string;
    try {
      vite = createRequire(path.join(project, 'package.json')).resolve('vite');
    } catch {
      throw new Error(`Vite isn't installed in ${project}.`);
    }
    const child = spawn(process.execPath, [this.#script, vite], {
      cwd: project,
      // Not the output of the language server, which may be its protocol.
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let output = '';
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
    const pending: Worker['pending'] = new Map();
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Loading the Vite config of ${project} timed out.`));
        child.kill();
      }, TIMEOUT);
      child.on('message', (response: DirectiveResponse) => {
        if ('ready' in response) {
          clearTimeout(timer);
          worker.dependencies = response.dependencies.map(realPath);
          resolve();
        } else if ('components' in response) {
          pending.get(response.id)?.resolve(response.components);
          pending.delete(response.id);
        } else {
          pending.get(response.id)?.reject(new Error(response.error));
          pending.delete(response.id);
        }
      });
      child.once('error', reject);
      child.once('close', () => {
        clearTimeout(timer);
        const error = new Error(
          `Vite could not load the config of ${project}${output === '' ? '.' : `: ${output.trim()}`}`,
        );
        reject(error);
        for (const { reject: rejectPending } of pending.values()) {
          rejectPending(error);
        }
        pending.clear();
        if (this.#workers.get(project) === worker) {
          this.#workers.delete(project);
        }
      });
    });
    const worker: Worker = { child, ready, dependencies: [], pending };
    this.#workers.set(project, worker);
    return worker;
  }

  #stop(project: string, worker: Worker): void {
    this.#workers.delete(project);
    worker.child.kill();
  }
}
