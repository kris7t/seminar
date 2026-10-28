import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { waylandSocket, WaylandWindows } from './windows.ts';
import { encodeMessage, MessageReader, MessageSplitter } from './wire.ts';

interface FakeOutput {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CompositorOptions {
  outputs: FakeOutput[];
  /** Whether it has the foreign toplevel management protocol. */
  toplevels?: boolean;
  /** Whether it puts windows in full screen on the outputs asked for. */
  honorsFullscreen?: boolean;
  /** Whether it tells which output the window is on only later. */
  entersLater?: boolean;
}

/** The first id of objects created by the compositor. */
const SERVER_ID = 0xff000000;

function stateArray(states: readonly number[]): Buffer {
  const array = Buffer.alloc(4 + states.length * 4);
  array.writeUInt32LE(states.length * 4);
  for (const [index, state] of states.entries()) {
    array.writeUInt32LE(state, 4 + index * 4);
  }
  return array;
}

/**
 * Serves a fake compositor with `outputs` and one window, titled `Deck`
 * after `seminar-1`, on the first output, at `socket`.
 */
async function fakeCompositor(
  socket: string,
  {
    outputs,
    toplevels = true,
    honorsFullscreen = true,
    entersLater = false,
  }: CompositorOptions,
): Promise<net.Server> {
  const globals = [
    ...outputs.map((_, index) => ({
      name: index + 1,
      interface: 'wl_output',
      version: 4,
    })),
    { name: 100, interface: 'zxdg_output_manager_v1', version: 3 },
    ...(toplevels
      ? [
          {
            name: 101,
            interface: 'zwlr_foreign_toplevel_manager_v1',
            version: 3,
          },
        ]
      : []),
  ];
  const server = net.createServer((client) => {
    const send = (
      id: number,
      opcode: number,
      args: (number | string)[] = [],
    ) => {
      client.write(encodeMessage(id, opcode, args));
    };
    // What the objects of the client are.
    const objects = new Map<number, string>([[1, 'wl_display']]);
    // The outputs of the objects of the client.
    const outputIds = new Map<number, FakeOutput>();
    const toplevel = SERVER_ID;
    let toplevelOutput: number | undefined;
    const sendStates = (states: readonly number[]) => {
      const array = stateArray(states);
      const header = Buffer.alloc(8);
      header.writeUInt32LE(toplevel);
      header.writeUInt32LE(((header.length + array.length) << 16) | 4, 4);
      client.write(Buffer.concat([header, array]));
    };
    const splitter = new MessageSplitter();
    client.on('data', (chunk: Buffer) => {
      for (const { id, opcode, body } of splitter.push(chunk)) {
        const args = new MessageReader(body);
        const object = id === toplevel ? 'toplevel' : objects.get(id);
        if (object === 'wl_display' && opcode === 0) {
          send(args.uint(), 0, [0]);
        } else if (object === 'wl_display' && opcode === 1) {
          const registry = args.uint();
          objects.set(registry, 'wl_registry');
          for (const global of globals) {
            send(registry, 0, [global.name, global.interface, global.version]);
          }
        } else if (object === 'wl_registry' && opcode === 0) {
          const name = args.uint();
          const kind = args.string() ?? '';
          args.uint();
          const newId = args.uint();
          objects.set(newId, kind);
          const output = outputs[name - 1];
          if (kind === 'wl_output' && output !== undefined) {
            outputIds.set(newId, output);
            send(newId, 4, [output.name]);
          } else if (kind === 'zwlr_foreign_toplevel_manager_v1') {
            const first = [...outputIds.keys()][0] ?? 0;
            toplevelOutput = first;
            send(newId, 0, [toplevel]);
            send(toplevel, 0, ['seminar-1']);
            send(toplevel, 0, ['Deck']);
            sendStates([]);
            const enter = () => {
              send(toplevel, 2, [first]);
              send(toplevel, 5);
            };
            if (entersLater) {
              send(toplevel, 5);
              setTimeout(enter, 50);
            } else {
              enter();
            }
          }
        } else if (object === 'zxdg_output_manager_v1' && opcode === 1) {
          const xdgOutput = args.uint();
          const output = outputIds.get(args.uint());
          if (output !== undefined) {
            send(xdgOutput, 0, [output.x, output.y]);
            send(xdgOutput, 1, [output.width, output.height]);
          }
        } else if (object === 'toplevel' && opcode === 8 && honorsFullscreen) {
          const output = args.uint();
          if (toplevelOutput !== undefined) {
            send(toplevel, 3, [toplevelOutput]);
          }
          toplevelOutput = output;
          send(toplevel, 2, [output]);
          sendStates([3]);
          send(toplevel, 5);
        }
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(socket, resolve);
  });
  return server;
}

const LAPTOP: FakeOutput = {
  name: 'eDP-1',
  x: 0,
  y: 0,
  width: 1920,
  height: 1200,
};
const PROJECTOR: FakeOutput = {
  name: 'HDMI-A-1',
  x: 1920,
  y: 0,
  width: 1280,
  height: 720,
};

let directory: string;
let socket: string;
let server: net.Server | undefined;
let windows: WaylandWindows | undefined;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'seminar-wayland-'));
  socket = path.join(directory, 'wayland-0');
});

afterEach(async () => {
  windows?.close();
  windows = undefined;
  await new Promise((resolve) => {
    if (server === undefined) {
      resolve(undefined);
    } else {
      server.close(resolve);
    }
  });
  server = undefined;
  await rm(directory, { recursive: true, force: true });
});

describe('WaylandWindows', () => {
  it('lists the outputs with their positions', async () => {
    server = await fakeCompositor(socket, { outputs: [LAPTOP, PROJECTOR] });
    windows = await WaylandWindows.connect(socket);
    expect(
      windows?.outputs.map(({ name, x, y, width, height }) => ({
        name,
        x,
        y,
        width,
        height,
      })),
    ).toEqual([LAPTOP, PROJECTOR]);
    expect(
      windows?.outputAt({ left: 1920, top: 0, width: 1280, height: 720 })?.name,
    ).toBe('HDMI-A-1');
  });

  it('finds windows by an earlier title, and the output they are on', async () => {
    server = await fakeCompositor(socket, { outputs: [LAPTOP, PROJECTOR] });
    windows = await WaylandWindows.connect(socket);
    const toplevel = await windows?.toplevel('seminar-1', 100);
    expect(toplevel?.title).toBe('Deck');
    expect(toplevel && windows?.outputOf(toplevel)?.name).toBe('eDP-1');
    expect(await windows?.toplevel('seminar-2', 100)).toBeUndefined();
  });

  it('waits for windows to be on an output', async () => {
    server = await fakeCompositor(socket, {
      outputs: [LAPTOP, PROJECTOR],
      entersLater: true,
    });
    windows = await WaylandWindows.connect(socket);
    const toplevel = await windows?.toplevel('seminar-1', 1000);
    expect(toplevel && windows?.outputOf(toplevel)?.name).toBe('eDP-1');
  });

  it('shows windows in full screen on an output', async () => {
    server = await fakeCompositor(socket, { outputs: [LAPTOP, PROJECTOR] });
    windows = await WaylandWindows.connect(socket);
    const toplevel = await windows?.toplevel('seminar-1', 100);
    const projector = windows?.outputs[1];
    if (
      windows === undefined ||
      toplevel === undefined ||
      projector === undefined
    ) {
      throw new Error('No window or output');
    }
    expect(await windows.fullscreen(toplevel, projector, 1000)).toBe(true);
    expect(toplevel.fullscreen).toBe(true);
    expect(windows.outputOf(toplevel)?.name).toBe('HDMI-A-1');
  });

  it("tells if the compositor doesn't show the window there", async () => {
    server = await fakeCompositor(socket, {
      outputs: [LAPTOP, PROJECTOR],
      honorsFullscreen: false,
    });
    windows = await WaylandWindows.connect(socket);
    const toplevel = await windows?.toplevel('seminar-1', 100);
    const projector = windows?.outputs[1];
    if (
      windows === undefined ||
      toplevel === undefined ||
      projector === undefined
    ) {
      throw new Error('No window or output');
    }
    expect(await windows.fullscreen(toplevel, projector, 100)).toBe(false);
  });

  it('needs the foreign toplevel management protocol', async () => {
    server = await fakeCompositor(socket, {
      outputs: [LAPTOP],
      toplevels: false,
    });
    expect(await WaylandWindows.connect(socket)).toBeUndefined();
  });
});

describe('waylandSocket', () => {
  it('finds the socket of the compositor', () => {
    expect(
      waylandSocket({
        WAYLAND_DISPLAY: 'wayland-1',
        XDG_RUNTIME_DIR: '/run/user/1000',
      }),
    ).toBe(path.join('/run/user/1000', 'wayland-1'));
    expect(waylandSocket({ WAYLAND_DISPLAY: '/tmp/wayland' })).toBe(
      '/tmp/wayland',
    );
    expect(
      waylandSocket({ XDG_RUNTIME_DIR: '/run/user/1000' }),
    ).toBeUndefined();
  });
});
