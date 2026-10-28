import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/** Whether `command` is on the `PATH`. */
export function hasCommand(command) {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .some((directory) => existsSync(path.join(directory, command)));
}

/**
 * Calls `check` until it returns something other than `undefined` or
 * `false`, and returns that, or throws `message` after `timeout` ms.
 */
export async function until(check, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const result = await check();
    if (result !== undefined && result !== false) {
      return result;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out: ${message}`);
    }
    await sleep(100);
  }
}

/** Returns a TCP port that is free on the loopback interface. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * A session of its own for a compositor and the apps in it: its own home,
 * XDG directories and session bus, so that nothing reaches the session of
 * the user, and processes that are stopped together with their children.
 */
export class Session {
  /** The environment of the processes of the session. */
  env;
  /** Where the session keeps its files. */
  directory;
  #processes = new Set();

  static async start() {
    const session = new Session();
    // Short, since the sockets of sway are named after it.
    session.directory = await mkdtemp(path.join(os.tmpdir(), 'seminar-e2e-'));
    const home = path.join(session.directory, 'home');
    const runtime = path.join(session.directory, 'run');
    await mkdir(home);
    await mkdir(runtime, { mode: 0o700 });
    session.env = {
      PATH: process.env.PATH ?? '',
      HOME: home,
      LANG: 'C.UTF-8',
      XDG_RUNTIME_DIR: runtime,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      XDG_DATA_HOME: path.join(home, '.local/share'),
      XDG_CACHE_HOME: path.join(home, '.cache'),
      XDG_STATE_HOME: path.join(home, '.local/state'),
    };
    try {
      const bus = session.spawn('dbus-daemon', [
        '--session',
        '--nofork',
        '--print-address=1',
        `--address=unix:path=${path.join(runtime, 'bus')}`,
      ]);
      session.env.DBUS_SESSION_BUS_ADDRESS = await new Promise(
        (resolve, reject) => {
          bus.once('error', reject);
          bus.stdout.once('data', (chunk) => resolve(String(chunk).trim()));
        },
      );
    } catch (error) {
      await session.stop();
      throw error;
    }
    return session;
  }

  /**
   * Starts `command` in the session, in a process group of its own, and
   * collects what it writes in `output`.
   */
  spawn(command, args, { env = {}, cwd } = {}) {
    const child = spawn(command, args, {
      env: { ...this.env, ...env },
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.output = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8').on('data', (chunk) => {
        child.output += chunk;
      });
    }
    child.exited = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        this.#processes.delete(child);
        resolve({ code, signal });
      });
    });
    this.#processes.add(child);
    return child;
  }

  /** Stops `child` and the processes that it started. */
  async kill(child) {
    if (!this.#processes.has(child)) {
      return;
    }
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        return;
      }
      if (await Promise.race([child.exited, sleep(3000)])) {
        return;
      }
    }
  }

  /** Writes `contents` to `name` in the directory of the session. */
  async writeFile(name, contents, mode) {
    const file = path.join(this.directory, name);
    await writeFile(file, contents, { mode });
    return file;
  }

  /**
   * Returns the processes that inherited the home of the session, but left
   * the process groups that it started, with what they run.
   */
  async #strays() {
    const home = `HOME=${this.env.HOME}`;
    const strays = [];
    for (const entry of await readdir('/proc').catch(() => [])) {
      const pid = Number(entry);
      if (!Number.isInteger(pid) || pid === process.pid) {
        continue;
      }
      const environ = await readFile(`/proc/${entry}/environ`, 'utf8').catch(
        () => '',
      );
      if (environ.split('\0').includes(home)) {
        const command = await readFile(`/proc/${entry}/cmdline`, 'utf8').catch(
          () => '',
        );
        strays.push({ pid, command: command.replaceAll('\0', ' ').trim() });
      }
    }
    return strays;
  }

  /** Stops the processes of the session, and removes its files. */
  async stop() {
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      // With the services that the bus started, in the group of the bus.
      const processes = [...this.#processes];
      for (const child of processes) {
        try {
          process.kill(-child.pid, signal);
        } catch {
          // Gone already.
        }
      }
      await Promise.race([
        Promise.all(processes.map((child) => child.exited)),
        sleep(3000),
      ]);
    }
    for (const { pid, command } of await this.#strays()) {
      if (process.env.SEMINAR_E2E_DEBUG !== undefined) {
        console.error('# stopping a stray process:', pid, command);
      }
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Gone already.
      }
    }
    // Chromium may still be writing its caches while it's stopping.
    await rm(this.directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
}
