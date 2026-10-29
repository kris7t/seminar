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

/** Which protocols the fake compositor lists and places windows with. */
type Protocols = 'wlr' | 'cosmic';

interface CompositorOptions {
  outputs: FakeOutput[];
  /** The protocols for windows that it has, if any. */
  protocols?: Protocols | false;
  /** Whether it puts windows in full screen on the outputs asked for. */
  honorsFullscreen?: boolean;
  /** Whether it tells which output the window is on only later. */
  entersLater?: boolean;
  /** What the COSMIC toplevel manager says it can do. */
  capabilities?: number[];
}

/** The first id of objects created by the compositor. */
const SERVER_ID = 0xff000000;

/** Returns a message with an array of 32-bit unsigned integers. */
function arrayMessage(
  id: number,
  opcode: number,
  values: readonly number[],
): Buffer {
  const array = Buffer.alloc(4 + values.length * 4);
  array.writeUInt32LE(values.length * 4);
  for (const [index, value] of values.entries()) {
    array.writeUInt32LE(value, 4 + index * 4);
  }
  const header = Buffer.alloc(8);
  header.writeUInt32LE(id);
  header.writeUInt32LE(((header.length + array.length) << 16) | opcode, 4);
  return Buffer.concat([header, array]);
}

/** The globals of the protocols for windows, with their versions. */
const PROTOCOL_GLOBALS: Record<Protocols, [string, number][]> = {
  wlr: [['zwlr_foreign_toplevel_manager_v1', 3]],
  cosmic: [
    ['ext_foreign_toplevel_list_v1', 1],
    ['zcosmic_toplevel_info_v1', 3],
    ['zcosmic_toplevel_manager_v1', 4],
  ],
};

/**
 * Serves a fake compositor with `outputs` and one window, titled `Deck`
 * after `seminar-1`, on the first output, at `socket`.
 */
async function fakeCompositor(
  socket: string,
  {
    outputs,
    protocols = 'wlr',
    honorsFullscreen = true,
    entersLater = false,
    capabilities = [1, 2, 3, 4, 5],
  }: CompositorOptions,
): Promise<net.Server> {
  const globals = [
    ...outputs.map((_, index) => ({
      name: index + 1,
      interface: 'wl_output',
      version: 4,
    })),
    { name: 100, interface: 'zxdg_output_manager_v1', version: 3 },
    ...(protocols === false ? [] : PROTOCOL_GLOBALS[protocols]).map(
      ([name, version], index) => ({
        name: 101 + index,
        interface: name,
        version,
      }),
    ),
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
    // With COSMIC, the objects of the client that tell about the window.
    let cosmicInfo = 0;
    let cosmicToplevel = 0;

    /** Tells about the output of the window, and its state. */
    const sendWindow = (
      states: number[],
      enter: number | undefined,
      leave?: number,
    ) => {
      if (protocols === 'wlr') {
        if (leave !== undefined) send(toplevel, 3, [leave]);
        if (enter !== undefined) send(toplevel, 2, [enter]);
        client.write(arrayMessage(toplevel, 4, states));
        send(toplevel, 5);
      } else {
        if (leave !== undefined) send(cosmicToplevel, 5, [leave]);
        if (enter !== undefined) send(cosmicToplevel, 4, [enter]);
        client.write(arrayMessage(cosmicToplevel, 8, states));
        send(cosmicInfo, 2);
      }
    };
    /** Tells about the window once it's listed. */
    const announce = () => {
      const first = [...outputIds.keys()][0] ?? 0;
      toplevelOutput = first;
      if (entersLater) {
        sendWindow([], undefined);
        setTimeout(() => {
          sendWindow([], first);
        }, 50);
      } else {
        sendWindow([], first);
      }
    };
    const fullscreen = (output: number) => {
      if (!honorsFullscreen) return;
      sendWindow([3], output, toplevelOutput);
      toplevelOutput = output;
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
            send(newId, 0, [toplevel]);
            send(toplevel, 0, ['seminar-1']);
            send(toplevel, 0, ['Deck']);
            announce();
          } else if (kind === 'zcosmic_toplevel_info_v1') {
            cosmicInfo = newId;
          } else if (kind === 'zcosmic_toplevel_manager_v1') {
            client.write(arrayMessage(newId, 0, capabilities));
          } else if (kind === 'ext_foreign_toplevel_list_v1') {
            send(newId, 0, [toplevel]);
            send(toplevel, 2, ['seminar-1']);
            send(toplevel, 2, ['Deck']);
            send(toplevel, 1);
          }
        } else if (object === 'zxdg_output_manager_v1' && opcode === 1) {
          const xdgOutput = args.uint();
          const output = outputIds.get(args.uint());
          if (output !== undefined) {
            send(xdgOutput, 0, [output.x, output.y]);
            send(xdgOutput, 1, [output.width, output.height]);
          }
        } else if (object === 'zcosmic_toplevel_info_v1' && opcode === 1) {
          cosmicToplevel = args.uint();
          if (args.uint() === toplevel) {
            announce();
          }
        } else if (object === 'toplevel' && opcode === 8) {
          fullscreen(args.uint());
        } else if (object === 'zcosmic_toplevel_manager_v1' && opcode === 7) {
          if (args.uint() === cosmicToplevel) {
            fullscreen(args.uint());
          }
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

for (const protocols of ['wlr', 'cosmic'] as const) {
  describe(`WaylandWindows with the ${protocols} protocols`, () => {
    it('lists the outputs with their positions', async () => {
      server = await fakeCompositor(socket, {
        outputs: [LAPTOP, PROJECTOR],
        protocols,
      });
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
        windows?.outputAt({ left: 1920, top: 0, width: 1280, height: 720 })
          ?.name,
      ).toBe('HDMI-A-1');
    });

    it('finds windows by an earlier title, and the output they are on', async () => {
      server = await fakeCompositor(socket, {
        outputs: [LAPTOP, PROJECTOR],
        protocols,
      });
      windows = await WaylandWindows.connect(socket);
      const toplevel = await windows?.toplevel('seminar-1', 100);
      expect(toplevel?.title).toBe('Deck');
      expect(toplevel && windows?.outputOf(toplevel)?.name).toBe('eDP-1');
      expect(await windows?.toplevel('seminar-2', 100)).toBeUndefined();
    });

    it('waits for windows to be on an output', async () => {
      server = await fakeCompositor(socket, {
        outputs: [LAPTOP, PROJECTOR],
        protocols,
        entersLater: true,
      });
      windows = await WaylandWindows.connect(socket);
      const toplevel = await windows?.toplevel('seminar-1', 1000);
      expect(toplevel && windows?.outputOf(toplevel)?.name).toBe('eDP-1');
    });

    it('shows windows in full screen on an output', async () => {
      server = await fakeCompositor(socket, {
        outputs: [LAPTOP, PROJECTOR],
        protocols,
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
      expect(await windows.fullscreen(toplevel, projector, 1000)).toBe(true);
      expect(toplevel.fullscreen).toBe(true);
      expect(windows.outputOf(toplevel)?.name).toBe('HDMI-A-1');
    });

    it("tells if the compositor doesn't show the window there", async () => {
      server = await fakeCompositor(socket, {
        outputs: [LAPTOP, PROJECTOR],
        protocols,
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
  });
}

describe('WaylandWindows', () => {
  it('needs protocols to place windows', async () => {
    server = await fakeCompositor(socket, {
      outputs: [LAPTOP],
      protocols: false,
    });
    expect(await WaylandWindows.connect(socket)).toBeUndefined();
  });

  it('needs COSMIC to show windows in full screen', async () => {
    server = await fakeCompositor(socket, {
      outputs: [LAPTOP],
      protocols: 'cosmic',
      capabilities: [1, 2],
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
