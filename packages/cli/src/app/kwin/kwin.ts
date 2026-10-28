import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  outputAt,
  type Area,
  type Compositor,
  type CompositorWindow,
  type Output,
} from '../compositor.ts';
import { DBusConnection, socketPath } from './dbus.ts';
import {
  kwinScript,
  type Report,
  type ReportTarget,
  type ScriptAction,
} from './script.ts';

/*
 * The windows and outputs of KWin, which other clients can only place with
 * scripts that they load over D-Bus. The scripts report back by calling a
 * method that we export.
 */

const KWIN = 'org.kde.KWin';

const REPORT_PATH = '/run/seminar/Present';
const REPORT_INTERFACE = 'run.seminar.Present';
const REPORT_METHOD = 'Report';

/** How long to wait for a script to report, in milliseconds. */
const SCRIPT_TIMEOUT = 2000;

/** How often to ask again while waiting for a window, in milliseconds. */
const POLL_INTERVAL = 100;

/**
 * Prefix of the directories with the scripts of each process, followed by
 * its id. A script is in its directory while KWin may have it loaded.
 */
const DIRECTORY_PREFIX = 'seminar-kwin-';

/** Returns the name that a script of the process `pid` is loaded with. */
function pluginName(pid: number, request: string): string {
  return `seminar-${String(pid)}-${request}`;
}

/** Whether the process `pid` is running. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // It runs as another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Unloads the scripts that processes that are gone, or had the id `pid`
 * before, left loaded in KWin when they crashed, and removes their
 * directories in `base`.
 */
async function reapScripts(
  connection: DBusConnection,
  base: string,
  pid: number,
): Promise<void> {
  const uid = process.getuid?.();
  for (const entry of await readdir(base).catch(() => [])) {
    const owner = Number(entry.slice(DIRECTORY_PREFIX.length));
    if (
      !entry.startsWith(DIRECTORY_PREFIX) ||
      !Number.isInteger(owner) ||
      (owner !== pid && isRunning(owner))
    ) {
      continue;
    }
    const directory = path.join(base, entry);
    const stats = await stat(directory).catch(() => undefined);
    if (stats === undefined || (uid !== undefined && stats.uid !== uid)) {
      continue;
    }
    for (const file of await readdir(directory).catch(() => [])) {
      const request = /^(\d+)\.js$/.exec(file)?.[1];
      if (request !== undefined) {
        await unloadScript(connection, pluginName(owner, request));
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
}

function unloadScript(
  connection: DBusConnection,
  plugin: string,
): Promise<unknown> {
  return connection
    .call({
      destination: KWIN,
      path: '/Scripting',
      interface: 'org.kde.kwin.Scripting',
      member: 'unloadScript',
      signature: 's',
      body: [plugin],
    })
    .catch(() => undefined);
}

/** The windows and outputs of KWin, as seen by its scripts. */
export class KWinWindows implements Compositor {
  readonly #connection: DBusConnection;
  /** Where the scripts are written for KWin to load. */
  readonly #directory: string;
  /** The process whose windows the scripts find. */
  readonly #pid: number;
  readonly #target: ReportTarget;
  /** The outputs in the last report. */
  #outputs: Output[] = [];
  /** Takes the reports of the scripts running, by their requests. */
  readonly #reports = new Map<string, (report: Report) => void>();
  #nextRequest = 0;

  private constructor(
    connection: DBusConnection,
    directory: string,
    pid: number,
  ) {
    this.#connection = connection;
    this.#directory = directory;
    this.#pid = pid;
    this.#target = {
      service: connection.name,
      path: REPORT_PATH,
      interface: REPORT_INTERFACE,
      method: REPORT_METHOD,
    };
    connection.export(REPORT_PATH, REPORT_INTERFACE, {
      [REPORT_METHOD]: (request: string, report: string) => {
        const take = this.#reports.get(request);
        if (take !== undefined) {
          take(JSON.parse(report) as Report);
        }
      },
    });
  }

  /**
   * Connects to KWin on the session bus of `env`, to place the windows of
   * the process `pid`, or returns `undefined` if there's no KWin.
   */
  static async connect(
    env: NodeJS.ProcessEnv,
    pid: number,
  ): Promise<KWinWindows | undefined> {
    const address = env['DBUS_SESSION_BUS_ADDRESS'];
    const socket =
      address === undefined || address === '' ? undefined : socketPath(address);
    if (socket === undefined) {
      return undefined;
    }
    const connection = await DBusConnection.connect(socket);
    try {
      if (!(await connection.hasOwner(KWIN))) {
        connection.close();
        return undefined;
      }
      // Cleared at the end of the session, if there's one.
      const runtime = env['XDG_RUNTIME_DIR'];
      const base =
        runtime === undefined || runtime === '' ? os.tmpdir() : runtime;
      await reapScripts(connection, base, pid);
      const directory = path.join(base, `${DIRECTORY_PREFIX}${String(pid)}`);
      await mkdir(directory, { mode: 0o700 });
      const windows = new KWinWindows(connection, directory, pid);
      // Also tells whether its scripts can report to us.
      if ((await windows.#run(undefined)) === undefined) {
        windows.close();
        return undefined;
      }
      return windows;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  /**
   * Runs a script that does `action`, and returns its report, or `undefined`
   * if it didn't report in time.
   */
  async #run(action: ScriptAction | undefined): Promise<Report | undefined> {
    const request = String(this.#nextRequest);
    this.#nextRequest += 1;
    const file = path.join(this.#directory, `${request}.js`);
    const plugin = pluginName(this.#pid, request);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reported = new Promise<Report | undefined>((resolve) => {
      timer = setTimeout(() => {
        resolve(undefined);
      }, SCRIPT_TIMEOUT);
      this.#reports.set(request, resolve);
    });
    try {
      await writeFile(
        file,
        kwinScript(this.#target, request, this.#pid, action),
      );
      try {
        const [id] = await this.#connection.call({
          destination: KWIN,
          path: '/Scripting',
          interface: 'org.kde.kwin.Scripting',
          member: 'loadScript',
          signature: 'ss',
          body: [file, plugin],
        });
        if (typeof id !== 'number' || id < 0) {
          throw new Error('KWin could not load a script');
        }
        await this.#connection.call({
          destination: KWIN,
          path: `/Scripting/Script${String(id)}`,
          interface: 'org.kde.kwin.Script',
          member: 'run',
        });
      } finally {
        // KWin has run the script once it answers, so it can be unloaded
        // right away. If we crash before, the file is left for reapScripts.
        await unloadScript(this.#connection, plugin);
        await rm(file, { force: true });
      }
      const report = await reported;
      if (report !== undefined) {
        this.#outputs = report.outputs;
      }
      return report;
    } finally {
      clearTimeout(timer);
      this.#reports.delete(request);
    }
  }

  outputAt(area: Area): Output | undefined {
    return outputAt(this.#outputs, area);
  }

  async findWindow(
    title: string,
    timeout: number,
  ): Promise<CompositorWindow | undefined> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const window = (await this.#run({ find: 'caption', caption: title }))
        ?.window;
      if (window !== undefined) {
        return this.#window(window.id);
      }
      if (Date.now() >= deadline) {
        return undefined;
      }
      await sleep(POLL_INTERVAL);
    }
  }

  #window(id: string): CompositorWindow {
    return {
      output: async () => {
        const window = (await this.#run({ find: 'id', id }))?.window;
        return this.#outputs.find((output) => output.name === window?.output);
      },
      fullscreen: async (output, timeout) => {
        const deadline = Date.now() + timeout;
        let window = (
          await this.#run({ find: 'id', id, fullscreenOn: output.name })
        )?.window;
        // KWin shows the window in full screen once the client agrees.
        while (!(
          window?.fullScreen === true && window.output === output.name
        )) {
          if (window === undefined || Date.now() >= deadline) {
            return false;
          }
          await sleep(POLL_INTERVAL);
          window = (await this.#run({ find: 'id', id }))?.window;
        }
        return true;
      },
    };
  }

  close(): void {
    this.#connection.close();
    void rm(this.#directory, { recursive: true, force: true });
  }
}
