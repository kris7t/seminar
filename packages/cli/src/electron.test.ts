import { existsSync, readFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readlink,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cacheDirectory,
  ELECTRON_VERSION,
  electronArgs,
  electronEnv,
  electronExecutable,
  findElectron,
  installElectron,
} from './electron.ts';
import { unzip } from './unzip.ts';

const fixture = (name: string) => path.join(import.meta.dirname, 'test', name);

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'seminar-cli-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('ELECTRON_VERSION', () => {
  it('is the exact version of the electron development dependency', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { devDependencies: Record<string, string> };
    expect(ELECTRON_VERSION).toBe(pkg.devDependencies['electron']);
    // A range would download whatever version the range meant.
    expect(ELECTRON_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('cacheDirectory', () => {
  it('follows the conventions of each platform', () => {
    expect(
      cacheDirectory({ env: {}, platform: 'linux', home: '/home/u' }),
    ).toBe('/home/u/.cache/seminar');
    expect(
      cacheDirectory({
        env: { XDG_CACHE_HOME: '/xdg' },
        platform: 'linux',
        home: '/home/u',
      }),
    ).toBe('/xdg/seminar');
    expect(
      cacheDirectory({ env: {}, platform: 'darwin', home: '/Users/u' }),
    ).toBe('/Users/u/Library/Caches/seminar');
    expect(
      cacheDirectory({
        env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
        platform: 'win32',
        home: 'C:\\Users\\u',
      }),
    ).toBe('C:\\Users\\u\\AppData\\Local\\seminar\\Cache');
  });

  it('can be set', () => {
    expect(
      cacheDirectory({
        env: { SEMINAR_CACHE_DIR: '/cache', XDG_CACHE_HOME: '/xdg' },
        platform: 'linux',
      }),
    ).toBe('/cache');
  });
});

describe('electronExecutable', () => {
  it('is in the app bundle on macOS', () => {
    expect(electronExecutable('/e', 'darwin')).toBe(
      '/e/Electron.app/Contents/MacOS/Electron',
    );
    expect(electronExecutable('/e', 'win32')).toBe('/e/electron.exe');
    expect(electronExecutable('/e', 'linux')).toBe('/e/electron');
  });
});

describe('installElectron', () => {
  const options = () => ({
    env: { SEMINAR_CACHE_DIR: directory },
    platform: 'linux' as const,
    arch: 'x64',
  });

  it('downloads Electron into the cache once', async () => {
    let downloads = 0;
    const install = () =>
      installElectron({
        ...options(),
        download: async ({ platform, arch, tempDirectory }) => {
          downloads += 1;
          expect([platform, arch]).toEqual(['linux', 'x64']);
          const download = path.join(tempDirectory, 'download');
          await mkdir(download);
          const zip = path.join(download, 'electron.zip');
          await writeFile(zip, '');
          return zip;
        },
        extract: async (_, target) => {
          await mkdir(target, { recursive: true });
          await writeFile(path.join(target, 'electron'), '');
        },
      });
    expect(findElectron(options())).toBeUndefined();
    const executable = await install();
    expect(executable).toBe(
      path.join(
        directory,
        'electron',
        `${ELECTRON_VERSION}-linux-x64`,
        'electron',
      ),
    );
    expect(findElectron(options())).toBe(executable);
    expect(await install()).toBe(executable);
    expect(downloads).toBe(1);
    // Neither the zip nor a partial Electron are kept.
    expect(await readdir(path.join(directory, 'electron'))).toEqual([
      `${ELECTRON_VERSION}-linux-x64`,
    ]);
  });

  it('leaves nothing in the cache if extracting fails', async () => {
    await expect(
      installElectron({
        ...options(),
        download: async ({ tempDirectory }) => {
          const zip = path.join(tempDirectory, 'download', 'electron.zip');
          await mkdir(path.dirname(zip));
          await writeFile(zip, '');
          return zip;
        },
        extract: async (_, target) => {
          await mkdir(target, { recursive: true });
          throw new Error('Broken zip');
        },
      }),
    ).rejects.toThrow('Broken zip');
    expect(findElectron(options())).toBeUndefined();
    expect(await readdir(path.join(directory, 'electron'))).toEqual([]);
  });

  it('runs the Electron that is set instead', () => {
    expect(
      findElectron({
        ...options(),
        env: { SEMINAR_ELECTRON: '/opt/electron' },
      }),
    ).toBe('/opt/electron');
  });
});

describe('electronArgs', () => {
  it('runs without a display server on Linux', () => {
    expect(electronArgs('main.js', ['job'], { platform: 'linux' })).toEqual([
      '--ozone-platform=headless',
      '--disable-gpu',
      'main.js',
      'job',
    ]);
    expect(electronArgs('main.js', ['job'], { platform: 'darwin' })).toEqual([
      'main.js',
      'job',
    ]);
  });

  it('shows windows on Wayland if there is a compositor', () => {
    expect(
      electronArgs('main.js', ['job'], {
        windows: true,
        platform: 'linux',
        env: { WAYLAND_DISPLAY: 'wayland-1' },
      }),
    ).toEqual(['--ozone-platform=wayland', 'main.js', 'job']);
    expect(
      electronArgs('main.js', ['job'], {
        windows: true,
        platform: 'linux',
        env: { DISPLAY: ':0' },
      }),
    ).toEqual(['main.js', 'job']);
  });

  it('runs Electron as itself, not as Node.js', () => {
    expect(electronEnv({ ELECTRON_RUN_AS_NODE: '1', PATH: '/bin' })).toEqual({
      PATH: '/bin',
    });
  });
});

describe('unzip', () => {
  it('keeps the modes of files and symbolic links', async () => {
    await unzip(fixture('app.zip'), directory);
    expect(readFileSync(path.join(directory, 'App/data.txt'), 'utf8')).toBe(
      'data',
    );
    expect((await stat(path.join(directory, 'App/run'))).mode & 0o777).toBe(
      0o755,
    );
    expect(await readlink(path.join(directory, 'App/Current'))).toBe(
      'data.txt',
    );
  });

  it('extracts nothing outside of the directory', async () => {
    const target = path.join(directory, 'target');
    await expect(unzip(fixture('escape.zip'), target)).rejects.toThrow(
      'invalid relative path',
    );
    expect(existsSync(path.join(directory, 'escaped.txt'))).toBe(false);
  });
});
