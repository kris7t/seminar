import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import * as dbusNative from '@homebridge/dbus-native';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { socketPath } from './dbus.ts';
import { KWinWindows } from './kwin.ts';
import { kwinScript, type Report } from './script.ts';

interface FakeScreen {
  name: string;
  geometry: { x: number; y: number; width: number; height: number };
}

interface FakeWindow {
  pid: number;
  caption: string;
  internalId: string;
  output: FakeScreen;
  fullScreen: boolean;
}

const LAPTOP: FakeScreen = {
  name: 'eDP-1',
  geometry: { x: 0, y: 0, width: 1920, height: 1200 },
};
const PROJECTOR: FakeScreen = {
  name: 'HDMI-A-1',
  geometry: { x: 1920, y: 0, width: 1280, height: 720 },
};

/** The process whose windows the tests place. */
const PID = 4242;

/**
 * Returns a window of KWin that goes full screen a bit after it's asked to,
 * like a client that agrees to it, if `honorsFullscreen`.
 */
function fakeWindow(
  caption: string,
  { pid = PID, honorsFullscreen = true } = {},
): FakeWindow {
  let fullScreen = false;
  return {
    pid,
    caption,
    internalId: `{${caption}}`,
    output: LAPTOP,
    get fullScreen() {
      return fullScreen;
    },
    set fullScreen(value: boolean) {
      if (honorsFullscreen) {
        setTimeout(() => {
          fullScreen = value;
        }, 50);
      }
    },
  };
}

/** Runs a KWin script against a fake workspace. */
function runScript(
  source: string,
  windows: FakeWindow[],
  callDBus: (...args: unknown[]) => void,
): void {
  vm.runInNewContext(source, {
    workspace: {
      screens: [LAPTOP, PROJECTOR],
      windowList: () => windows,
      sendClientToScreen: (window: FakeWindow, screen: FakeScreen) => {
        window.output = screen;
      },
    },
    callDBus,
  });
}

describe('kwinScript', () => {
  const target = {
    service: ':1.42',
    path: '/run/seminar/Present',
    interface: 'run.seminar.Present',
    method: 'Report',
  };

  function report(
    action: Parameters<typeof kwinScript>[3],
    windows: FakeWindow[],
  ): { call: unknown[]; report: Report } {
    let call: unknown[] = [];
    runScript(kwinScript(target, '7', PID, action), windows, (...args) => {
      call = args;
    });
    return { call, report: JSON.parse(String(call[5])) as Report };
  }

  it('reports the outputs to the method of the target', () => {
    const { call, report: result } = report(undefined, []);
    expect(call.slice(0, 5)).toEqual([
      ':1.42',
      '/run/seminar/Present',
      'run.seminar.Present',
      'Report',
      '7',
    ]);
    expect(result).toEqual({
      outputs: [
        { name: 'eDP-1', x: 0, y: 0, width: 1920, height: 1200 },
        { name: 'HDMI-A-1', x: 1920, y: 0, width: 1280, height: 720 },
      ],
    });
  });

  it('finds the window of the process by its caption', () => {
    const windows = [
      fakeWindow('seminar-1', { pid: 1 }),
      fakeWindow('seminar-1'),
      fakeWindow('"quoted" \\ caption'),
    ];
    expect(
      report({ find: 'caption', caption: 'seminar-1' }, windows).report.window,
    ).toEqual({ id: '{seminar-1}', output: 'eDP-1', fullScreen: false });
    expect(
      report({ find: 'caption', caption: '"quoted" \\ caption' }, windows)
        .report.window?.id,
    ).toBe('{"quoted" \\ caption}');
    expect(
      report({ find: 'caption', caption: 'other' }, windows).report.window,
    ).toBeUndefined();
  });

  it('moves the window to the output, and asks for full screen', () => {
    const window = fakeWindow('seminar-1');
    expect(
      report({ find: 'id', id: '{seminar-1}', fullscreenOn: 'HDMI-A-1' }, [
        window,
      ]).report.window?.output,
    ).toBe('HDMI-A-1');
  });
});

/** Whether `dbus-daemon` is on the `PATH`, to run a bus for the tests. */
const hasDBusDaemon = (process.env['PATH'] ?? '')
  .split(path.delimiter)
  .some((directory) => existsSync(path.join(directory, 'dbus-daemon')));

interface FakeBus {
  invoke(message: object, callback: (...args: unknown[]) => void): void;
  requestName(
    name: string,
    flags: number,
    callback: (error: { name: string } | null) => void,
  ): void;
  exportInterface(
    implementation: object,
    path: string,
    description: object,
  ): void;
  connection: { end(): void; once(event: string, listener: () => void): void };
}

const { createClient } = dbusNative as unknown as {
  createClient: (options: { socket: string }) => FakeBus;
};

/** Serves a fake KWin with `windows` on the bus at `socket`. */
async function fakeKWin(socket: string, windows: FakeWindow[]) {
  const bus = createClient({ socket });
  await new Promise<void>((resolve) => {
    bus.connection.once('connect', resolve);
  });
  const scripts = new Map<number, string>();
  const plugins = new Map<string, number>();
  let nextId = 0;
  const callDBus = (...args: unknown[]) => {
    const [destination, objectPath, iface, member, ...body] = args;
    bus.invoke(
      {
        destination,
        path: objectPath,
        interface: iface,
        member,
        signature: 's'.repeat(body.length),
        body,
      },
      () => undefined,
    );
  };
  bus.exportInterface(
    {
      loadScript: async (file: string, plugin: string) => {
        const id = nextId;
        nextId += 1;
        scripts.set(id, await readFile(file, 'utf8'));
        plugins.set(plugin, id);
        bus.exportInterface(
          {
            run: () => {
              runScript(scripts.get(id) ?? '', windows, callDBus);
            },
          },
          `/Scripting/Script${String(id)}`,
          { name: 'org.kde.kwin.Script', methods: { run: ['', ''] } },
        );
        return id;
      },
      unloadScript: (plugin: string) => {
        const id = plugins.get(plugin);
        if (id !== undefined) {
          scripts.delete(id);
        }
        return plugins.delete(plugin);
      },
    },
    '/Scripting',
    {
      name: 'org.kde.kwin.Scripting',
      methods: { loadScript: ['ss', 'i'], unloadScript: ['s', 'b'] },
    },
  );
  await new Promise((resolve, reject) => {
    bus.requestName('org.kde.KWin', 0, (error) => {
      if (error) {
        reject(new Error(error.name));
      } else {
        resolve(undefined);
      }
    });
  });
  return {
    loaded: () => plugins.size,
    isLoaded: (plugin: string) => plugins.has(plugin),
    /** Loads a script, like one left by a process that crashed. */
    preload: (plugin: string) => {
      plugins.set(plugin, -1);
    },
    close: () => {
      bus.connection.end();
    },
  };
}

describe.skipIf(!hasDBusDaemon)('KWinWindows', () => {
  let directory: string;
  let daemon: ChildProcess;
  let address: string;
  let kwin: Awaited<ReturnType<typeof fakeKWin>> | undefined;
  let windows: KWinWindows | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'seminar-dbus-'));
    daemon = spawn(
      'dbus-daemon',
      [
        '--session',
        '--nofork',
        '--print-address=1',
        `--address=unix:path=${path.join(directory, 'bus')}`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    address = await new Promise((resolve, reject) => {
      daemon.once('error', reject);
      daemon.stdout?.once('data', (chunk: Buffer) => {
        resolve(chunk.toString().trim());
      });
    });
  });

  afterEach(async () => {
    windows?.close();
    windows = undefined;
    kwin?.close();
    kwin = undefined;
    daemon.kill();
    await rm(directory, { recursive: true, force: true });
  });

  /** The environment of the app, with a runtime directory of the test. */
  function env(): NodeJS.ProcessEnv {
    return { DBUS_SESSION_BUS_ADDRESS: address, XDG_RUNTIME_DIR: directory };
  }

  function busSocket(): string {
    const socket = socketPath(address);
    if (socket === undefined) {
      throw new Error(`Not a Unix socket: ${address}`);
    }
    return socket;
  }

  it('needs KWin on the session bus', async () => {
    expect(await KWinWindows.connect(env(), PID)).toBeUndefined();
    expect(await KWinWindows.connect({}, PID)).toBeUndefined();
  });

  it('finds the window and its output with scripts', async () => {
    kwin = await fakeKWin(busSocket(), [fakeWindow('seminar-1')]);
    windows = await KWinWindows.connect(env(), PID);
    expect(
      windows?.outputAt({ left: 1920, top: 0, width: 1280, height: 720 })?.name,
    ).toBe('HDMI-A-1');
    const window = await windows?.findWindow('seminar-1', 1000);
    expect((await window?.output())?.name).toBe('eDP-1');
    expect(await windows?.findWindow('seminar-2', 200)).toBeUndefined();
    // Scripts are unloaded once they report.
    expect(kwin.loaded()).toBe(0);
  });

  it('shows the window in full screen on an output', async () => {
    kwin = await fakeKWin(busSocket(), [fakeWindow('seminar-1')]);
    windows = await KWinWindows.connect(env(), PID);
    const window = await windows?.findWindow('seminar-1', 1000);
    const projector = windows?.outputAt({
      left: 1920,
      top: 0,
      width: 1280,
      height: 720,
    });
    if (window === undefined || projector === undefined) {
      throw new Error('No window or output');
    }
    expect(await window.fullscreen(projector, 1000)).toBe(true);
    expect((await window.output())?.name).toBe('HDMI-A-1');
  });

  it('unloads the scripts that crashed processes left loaded', async () => {
    const child = spawn(process.execPath, ['-e', '']);
    const gone = child.pid ?? 0;
    await new Promise((resolve) => child.once('exit', resolve));
    kwin = await fakeKWin(busSocket(), []);
    for (const [owner, request] of [
      [gone, '3'],
      [PID, '1'],
      [process.pid, '2'],
    ] as const) {
      const scripts = path.join(directory, `seminar-kwin-${String(owner)}`);
      await mkdir(scripts);
      await writeFile(path.join(scripts, `${request}.js`), '');
      kwin.preload(`seminar-${String(owner)}-${request}`);
    }
    windows = await KWinWindows.connect(env(), PID);
    // Of processes that are gone, or had our id before.
    expect(kwin.isLoaded(`seminar-${String(gone)}-3`)).toBe(false);
    expect(kwin.isLoaded(`seminar-${String(PID)}-1`)).toBe(false);
    expect(
      existsSync(path.join(directory, `seminar-kwin-${String(gone)}`)),
    ).toBe(false);
    // Of processes that still run.
    expect(kwin.isLoaded(`seminar-${String(process.pid)}-2`)).toBe(true);
  });

  it("tells if the window doesn't go full screen", async () => {
    kwin = await fakeKWin(busSocket(), [
      fakeWindow('seminar-1', { honorsFullscreen: false }),
    ]);
    windows = await KWinWindows.connect(env(), PID);
    const window = await windows?.findWindow('seminar-1', 1000);
    const projector = windows?.outputAt({
      left: 1920,
      top: 0,
      width: 1280,
      height: 720,
    });
    if (window === undefined || projector === undefined) {
      throw new Error('No window or output');
    }
    expect(await window.fullscreen(projector, 300)).toBe(false);
  });
});

describe('socketPath', () => {
  it('finds the Unix socket of a bus', () => {
    expect(socketPath('unix:path=/run/user/1000/bus')).toBe(
      '/run/user/1000/bus',
    );
    expect(
      socketPath('unix:abstract=/tmp/dbus-abc,guid=123;unix:path=/tmp/x'),
    ).toBe('\0/tmp/dbus-abc');
    expect(socketPath('tcp:host=localhost,port=1;unix:path=/a%20b')).toBe(
      '/a b',
    );
    expect(socketPath('unixexec:path=/bin/sh')).toBeUndefined();
  });
});
