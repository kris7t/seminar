import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  downloadArtifact,
  ElectronDownloadCacheMode,
  getHostArch,
} from '@electron/get';

import { unzip } from './unzip.ts';

/**
 * Version of Electron that the command line runs: that of its `electron`
 * development dependency, which provides the types, and is pinned to it.
 */
export const ELECTRON_VERSION: string = (
  JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { devDependencies: { electron: string } }
).devDependencies.electron;

/** Where Electron is, and how to get it. */
export interface ElectronOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  arch?: string;
  home?: string;
  /** Downloads the zip of Electron, and returns its path. */
  download?: (options: {
    platform: NodeJS.Platform;
    arch: string;
    tempDirectory: string;
  }) => Promise<string>;
  /** Extracts the zip of Electron into a directory. */
  extract?: (zip: string, directory: string) => Promise<void>;
}

/**
 * Returns the directory where Seminar caches files, like Electron:
 * `SEMINAR_CACHE_DIR` if set, or else the cache directory of the user.
 */
export function cacheDirectory({
  env = process.env,
  platform = process.platform,
  home = os.homedir(),
}: ElectronOptions = {}): string {
  const override = env['SEMINAR_CACHE_DIR'];
  if (override !== undefined && override !== '') {
    return path.resolve(override);
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library/Caches/seminar');
  }
  if (platform === 'win32') {
    return path.win32.join(
      env['LOCALAPPDATA'] ?? path.win32.join(home, 'AppData/Local'),
      'seminar/Cache',
    );
  }
  const xdg = env['XDG_CACHE_HOME'];
  return path.join(
    xdg !== undefined && path.isAbsolute(xdg) ? xdg : path.join(home, '.cache'),
    'seminar',
  );
}

/** Returns the directory of the cached Electron. */
export function electronDirectory(options: ElectronOptions = {}): string {
  const { platform = process.platform, arch = getHostArch() } = options;
  return path.join(
    cacheDirectory(options),
    'electron',
    `${ELECTRON_VERSION}-${platform}-${arch}`,
  );
}

/** Returns the executable of Electron in its `directory`. */
export function electronExecutable(
  directory: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'darwin') {
    return path.join(directory, 'Electron.app/Contents/MacOS/Electron');
  }
  return path.join(
    directory,
    platform === 'win32' ? 'electron.exe' : 'electron',
  );
}

/**
 * Returns the executable of Electron: `SEMINAR_ELECTRON` if set, or else the
 * cached Electron, if any.
 */
export function findElectron(
  options: ElectronOptions = {},
): string | undefined {
  const { env = process.env, platform = process.platform } = options;
  const override = env['SEMINAR_ELECTRON'];
  if (override !== undefined && override !== '') {
    return path.resolve(override);
  }
  const executable = electronExecutable(electronDirectory(options), platform);
  return existsSync(executable) ? executable : undefined;
}

/**
 * Downloads Electron into the cache, unless it is there already, and returns
 * its executable.
 */
export async function installElectron(
  options: ElectronOptions = {},
): Promise<string> {
  const {
    platform = process.platform,
    arch = getHostArch(),
    download = ({ platform, arch, tempDirectory }) =>
      downloadArtifact({
        version: ELECTRON_VERSION,
        artifactName: 'electron',
        platform,
        arch,
        tempDirectory,
        // The extracted Electron is cached instead of its zip.
        cacheMode: ElectronDownloadCacheMode.Bypass,
      }),
    extract = unzip,
  } = options;
  const directory = electronDirectory({ ...options, platform, arch });
  const executable = electronExecutable(directory, platform);
  if (existsSync(executable)) {
    return executable;
  }
  const parent = path.dirname(directory);
  await mkdir(parent, { recursive: true });
  // Extracted next to its place, and moved there once complete, so that an
  // interrupted download leaves no partial Electron in the cache.
  const partial = `${directory}.partial-${String(process.pid)}`;
  await rm(partial, { recursive: true, force: true });
  try {
    const zip = await download({ platform, arch, tempDirectory: parent });
    try {
      await extract(zip, partial);
    } finally {
      await rm(path.dirname(zip), { recursive: true, force: true });
    }
    try {
      await rename(partial, directory);
    } catch (error) {
      // Unless another process has installed it in the meantime.
      if (!existsSync(executable)) {
        throw error;
      }
    }
  } finally {
    await rm(partial, { recursive: true, force: true });
  }
  return executable;
}

/** How to run Electron. */
export interface ElectronRunOptions {
  /** Whether to show windows, or else run without a display. */
  windows?: boolean;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

/**
 * Returns the arguments of Electron that run `script`, followed by `args`.
 */
export function electronArgs(
  script: string,
  args: readonly string[],
  {
    windows = false,
    platform = process.platform,
    env = process.env,
  }: ElectronRunOptions = {},
): string[] {
  let display: string[] = [];
  if (platform === 'linux') {
    if (!windows) {
      // Without a display server, e.g., in continuous integration.
      display = ['--ozone-platform=headless', '--disable-gpu'];
    } else if ((env['WAYLAND_DISPLAY'] ?? '') !== '') {
      // So that the app knows that it can place windows with Wayland.
      display = ['--ozone-platform=wayland'];
    }
  }
  return [...display, script, ...args];
}

/** Returns the environment of Electron. */
export function electronEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Set, e.g., in the terminals of Visual Studio Code, which would run our
  // script with Electron as Node.js.
  const result = { ...env };
  delete result['ELECTRON_RUN_AS_NODE'];
  return result;
}

/** How Electron exited. */
export interface ElectronExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** What Electron wrote to its standard error. */
  errors: string;
}

/**
 * Runs `script` in Electron, and calls `output` with each line it writes to
 * its standard output. Stops Electron when `abortSignal` is aborted, and
 * settles once it has exited.
 */
export function runElectron(
  executable: string,
  script: string,
  args: readonly string[],
  output: (line: string) => void,
  {
    abortSignal,
    ...options
  }: Pick<ElectronRunOptions, 'windows'> & { abortSignal?: AbortSignal } = {},
): Promise<ElectronExit> {
  abortSignal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, electronArgs(script, args, options), {
      env: electronEnv(process.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stop = () => child.kill();
    abortSignal?.addEventListener('abort', stop, { once: true });
    let pending = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        output(line);
      }
    });
    // Chromium logs much that only matters if Electron fails.
    let errors = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      abortSignal?.removeEventListener('abort', stop);
      if (pending !== '') {
        output(pending);
      }
      resolve({ code, signal, errors });
    });
  });
}
