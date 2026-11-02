import { spawn } from 'node:child_process';

/** How long to keep an unused dev server, to reopen previews right away. */
const IDLE_TIME = 60_000;

/** A running dev server of a project. */
export interface DevServer {
  /** URL of the root of the dev server. */
  url: string;
  /** Path of the root directory of the Vite project. */
  root: string;
  /** Stops the dev server. */
  stop: () => void;
}

/** What a dev server tells the extension while it's starting or running. */
export interface DevServerEvents {
  /** Called with the number of pages connected to the dev server. */
  onPages: (count: number) => void;
  /** Called when the dev server has stopped. */
  onExit: () => void;
}

/** Starts the dev server of the Vite project in `project`. */
export type StartDevServer = (
  project: string,
  events: DevServerEvents,
) => Promise<DevServer>;

/** Permission to use a dev server until it's released. */
export interface DevServerLease {
  url: string;
  root: string;
  /** Resolves when the dev server has stopped by itself. */
  exited: Promise<void>;
  /**
   * Gives up the dev server, which stops some time after this if no other
   * lease or connected page keeps it running. So releasing right after opening
   * a page in a browser keeps the server as long as the page is open.
   */
  release: () => void;
}

interface Entry {
  server: Promise<DevServer>;
  exited: Promise<void>;
  leases: number;
  pages: number;
  idle: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Keeps one dev server for each Vite project, for as long as something uses
 * it, so that the previews of decks in the project can share it.
 */
export class DevServers {
  readonly #start: StartDevServer;
  readonly #entries = new Map<string, Entry>();

  constructor(start: StartDevServer) {
    this.#start = start;
  }

  /** Returns a lease of the dev server of `project`, starting it if needed. */
  async acquire(project: string): Promise<DevServerLease> {
    const entry = this.#entries.get(project) ?? this.#create(project);
    entry.leases += 1;
    this.#update(project, entry);
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        entry.leases -= 1;
        this.#update(project, entry);
      }
    };
    try {
      const { url, root } = await entry.server;
      return { url, root, exited: entry.exited, release };
    } catch (error) {
      release();
      throw error;
    }
  }

  /** Stops all dev servers. */
  dispose(): void {
    for (const [project, entry] of this.#entries) {
      this.#stop(project, entry);
    }
  }

  #create(project: string): Entry {
    let onExit: () => void = () => undefined;
    const exited = new Promise<void>((resolve) => {
      onExit = resolve;
    });
    const entry: Entry = {
      exited,
      leases: 0,
      pages: 0,
      idle: undefined,
      server: this.#start(project, {
        onPages: (count) => {
          entry.pages = count;
          this.#update(project, entry);
        },
        onExit: () => {
          this.#forget(project, entry);
          onExit();
        },
      }),
    };
    this.#entries.set(project, entry);
    entry.server.catch(() => {
      this.#forget(project, entry);
    });
    return entry;
  }

  #update(project: string, entry: Entry): void {
    const used = entry.leases > 0 || entry.pages > 0;
    if (used) {
      clearTimeout(entry.idle);
      entry.idle = undefined;
    } else {
      entry.idle ??= setTimeout(() => {
        this.#stop(project, entry);
      }, IDLE_TIME);
    }
  }

  #forget(project: string, entry: Entry): void {
    clearTimeout(entry.idle);
    if (this.#entries.get(project) === entry) {
      this.#entries.delete(project);
    }
  }

  #stop(project: string, entry: Entry): void {
    this.#forget(project, entry);
    entry.server.then(
      ({ stop }) => {
        stop();
      },
      () => undefined,
    );
  }
}

/** What `seminar dev` sends to the process that started it. */
type DevMessage =
  | { type: 'ready'; url: string; root: string }
  | { type: 'pages'; count: number };

/**
 * Runs `seminar dev` with the script `cli` in `project` until it's stopped,
 * calling `log` with its output. Rejects with what it printed if it can't
 * start.
 */
export function runSeminarDev(
  cli: string,
  project: string,
  {
    allowAnyHost,
    log,
    onErrors,
    onPages,
    onExit,
  }: DevServerEvents & {
    allowAnyHost: boolean;
    log: (text: string) => void;
    /** Called after logging what it printed as errors and warnings. */
    onErrors: () => void;
  },
): Promise<DevServer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      [cli, 'dev', ...(allowAnyHost ? ['--allow-any-host'] : [])],
      { cwd: project, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    );
    let errors = '';
    let started = false;
    child.stdout?.on('data', (data: Buffer) => {
      log(data.toString());
    });
    child.stderr?.on('data', (data: Buffer) => {
      if (!started) {
        errors += data.toString();
      }
      log(data.toString());
      onErrors();
    });
    child.once('error', reject);
    child.on('message', (message: DevMessage) => {
      if (message.type === 'pages') {
        onPages(message.count);
      } else {
        started = true;
        resolve({
          url: message.url,
          root: message.root,
          stop: () => {
            child.kill();
          },
        });
      }
    });
    child.once('close', (code) => {
      // Unless it has already started.
      reject(
        new Error(
          errors.trim() || `seminar dev exited with code ${String(code)}.`,
        ),
      );
      onExit();
    });
  });
}
