import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  connectService,
  hasDBusDaemon,
  startBus,
  type FakeService,
  type TestBus,
} from '../../test/bus.ts';
import { displayOutputs, type DisplayState } from './displayConfig.ts';
import { GnomeWindows } from './gnome.ts';

/** A variant of a boolean, as `@homebridge/dbus-native` decodes it. */
function decodedBoolean(value: boolean) {
  return [[{ type: 'b', child: [] }], [value]];
}

/** A variant of an unsigned integer, as it's decoded. */
function decodedUint(value: number) {
  return [[{ type: 'u', child: [] }], [value]];
}

interface FakeMonitor {
  connector: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  transform?: number;
}

/** Returns the state of the monitors, with variants made by `variant`. */
function displayState(
  monitors: FakeMonitor[],
  variant: {
    boolean: (value: boolean) => unknown;
    uint: (value: number) => unknown;
  },
  layoutMode = 1,
): unknown[] {
  return [
    1,
    monitors.map(({ connector, width, height }) => [
      [connector, 'Vendor', 'Product', '0x00'],
      [
        [
          `${String(width)}x${String(height)}@60`,
          width,
          height,
          60,
          1,
          [1],
          [['is-current', variant.boolean(true)]],
        ],
        [
          `640x480@60`,
          640,
          480,
          60,
          1,
          [1],
          [['is-current', variant.boolean(false)]],
        ],
      ],
      [['is-builtin', variant.boolean(false)]],
    ]),
    monitors.map(({ connector, x, y, scale = 1, transform = 0 }, index) => [
      x,
      y,
      scale,
      transform,
      index === 0,
      [[connector, 'Vendor', 'Product', '0x00']],
      [],
    ]),
    [['layout-mode', variant.uint(layoutMode)]],
  ];
}

const decoded = { boolean: decodedBoolean, uint: decodedUint };

describe('displayOutputs', () => {
  it('returns the logical monitors in the coordinates of windows', () => {
    expect(
      displayOutputs(
        displayState(
          [
            {
              connector: 'eDP-1',
              x: 0,
              y: 0,
              width: 2880,
              height: 1800,
              scale: 2,
            },
            { connector: 'HDMI-1', x: 1440, y: 0, width: 1920, height: 1080 },
            {
              connector: 'DP-1',
              x: 3360,
              y: 0,
              width: 1920,
              height: 1080,
              transform: 1,
            },
          ],
          decoded,
        ) as DisplayState,
      ),
    ).toEqual([
      { name: 'eDP-1', x: 0, y: 0, width: 1440, height: 900 },
      { name: 'HDMI-1', x: 1440, y: 0, width: 1920, height: 1080 },
      { name: 'DP-1', x: 3360, y: 0, width: 1080, height: 1920 },
    ]);
  });

  it('keeps the sizes of modes in the physical layout', () => {
    expect(
      displayOutputs(
        displayState(
          [
            {
              connector: 'eDP-1',
              x: 0,
              y: 0,
              width: 2880,
              height: 1800,
              scale: 2,
            },
          ],
          decoded,
          2,
        ) as DisplayState,
      ),
    ).toEqual([{ name: 'eDP-1', x: 0, y: 0, width: 2880, height: 1800 }]);
  });
});

interface FakeWindow {
  id: number;
  pid: number;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The process whose windows the tests place. */
const PID = 4242;

const MONITORS: FakeMonitor[] = [
  { connector: 'eDP-1', x: 0, y: 0, width: 1920, height: 1200 },
  { connector: 'HDMI-1', x: 1920, y: 0, width: 1280, height: 720 },
];

/** The signature of the state of `GetCurrentState`. */
const DISPLAY_STATE = 'ua((ssss)a(siiddada{sv})a{sv})a(iiduba(ssss)a{sv})a{sv}';

/**
 * Serves a fake GNOME Shell with `windows`, with Window Calls if
 * `windowCalls`, which moves windows a bit after it's asked to, unless
 * `ignoresMoves`.
 */
async function fakeShell(
  socket: string,
  windows: FakeWindow[],
  { windowCalls = true, ignoresMoves = false } = {},
): Promise<FakeService> {
  const service = await connectService(socket);
  const find = (id: number) => {
    const window = windows.find((candidate) => candidate.id === id);
    if (window === undefined) {
      throw new Error('Not found');
    }
    return window;
  };
  if (windowCalls) {
    service.export(
      '/org/gnome/Shell/Extensions/Windows',
      'org.gnome.Shell.Extensions.Windows',
      {
        List: [
          '',
          's',
          () =>
            JSON.stringify(
              windows.map(({ id, pid, title }) => ({
                id,
                pid,
                title,
                wm_class: 'electron',
              })),
            ),
        ],
        Details: [
          'u',
          's',
          (id: number) => {
            const { x, y, width, height } = find(id);
            return JSON.stringify({
              id,
              x,
              y,
              width,
              height,
              fullscreen: false,
            });
          },
        ],
        Move: [
          'uii',
          '',
          (id: number, x: number, y: number) => {
            const window = find(id);
            if (!ignoresMoves) {
              setTimeout(() => {
                Object.assign(window, { x, y });
              }, 50);
            }
          },
        ],
      },
    );
  }
  service.export(
    '/org/gnome/Mutter/DisplayConfig',
    'org.gnome.Mutter.DisplayConfig',
    {
      GetCurrentState: [
        '',
        DISPLAY_STATE,
        () =>
          displayState(MONITORS, {
            boolean: (value) => ['b', value],
            uint: (value) => ['u', value],
          }),
      ],
    },
  );
  await service.requestName('org.gnome.Shell');
  await service.requestName('org.gnome.Mutter.DisplayConfig');
  return service;
}

function fakeWindow(title: string, { pid = PID } = {}): FakeWindow {
  return { id: 7, pid, title, x: 100, y: 100, width: 800, height: 600 };
}

describe.skipIf(!hasDBusDaemon)('GnomeWindows', () => {
  let bus: TestBus;
  let shell: FakeService | undefined;
  let gnome: GnomeWindows | undefined;

  beforeEach(async () => {
    bus = await startBus();
  });

  afterEach(async () => {
    gnome?.close();
    gnome = undefined;
    shell?.close();
    shell = undefined;
    await bus.stop();
  });

  function env(): NodeJS.ProcessEnv {
    return { DBUS_SESSION_BUS_ADDRESS: bus.address };
  }

  const PROJECTOR = { left: 1920, top: 0, width: 1280, height: 720 };

  it('needs GNOME Shell with Window Calls', async () => {
    expect(await GnomeWindows.connect(env(), PID)).toBeUndefined();
    shell = await fakeShell(bus.socket, [], { windowCalls: false });
    expect(await GnomeWindows.connect(env(), PID)).toBeUndefined();
  });

  it('finds the window and its monitor', async () => {
    shell = await fakeShell(bus.socket, [
      fakeWindow('seminar-1', { pid: 1 }),
      { ...fakeWindow('seminar-1'), id: 8, x: 2000 },
    ]);
    gnome = await GnomeWindows.connect(env(), PID);
    expect(gnome?.outputAt(PROJECTOR)?.name).toBe('HDMI-1');
    const window = await gnome?.findWindow('seminar-1', 1000);
    expect((await window?.output())?.name).toBe('HDMI-1');
    expect(await gnome?.findWindow('seminar-2', 200)).toBeUndefined();
  });

  it('moves the window to the middle of the monitor', async () => {
    const windows = [fakeWindow('seminar-1')];
    shell = await fakeShell(bus.socket, windows);
    gnome = await GnomeWindows.connect(env(), PID);
    const window = await gnome?.findWindow('seminar-1', 1000);
    const projector = gnome?.outputAt(PROJECTOR);
    if (window === undefined || projector === undefined) {
      throw new Error('No window or monitor');
    }
    expect(await window.place(projector, 1000)).toBe(true);
    expect(windows[0]).toMatchObject({ x: 1920 + 240, y: 60 });
    // Windows larger than the monitor go in its corner.
    Object.assign(windows[0] ?? {}, { width: 1920, height: 1200 });
    const laptop = gnome?.outputAt({ left: 0, top: 0, width: 10, height: 10 });
    if (laptop === undefined) {
      throw new Error('No monitor');
    }
    expect(await window.place(laptop, 1000)).toBe(true);
    Object.assign(windows[0] ?? {}, { width: 1920, height: 1080 });
    expect(await window.place(projector, 1000)).toBe(true);
    expect(windows[0]).toMatchObject({ x: 1920, y: 0 });
  });

  it("tells if the window doesn't move", async () => {
    shell = await fakeShell(bus.socket, [fakeWindow('seminar-1')], {
      ignoresMoves: true,
    });
    gnome = await GnomeWindows.connect(env(), PID);
    const window = await gnome?.findWindow('seminar-1', 1000);
    const projector = gnome?.outputAt(PROJECTOR);
    if (window === undefined || projector === undefined) {
      throw new Error('No window or monitor');
    }
    expect(await window.place(projector, 300)).toBe(false);
  });
});
