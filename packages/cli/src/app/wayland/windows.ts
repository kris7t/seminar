import path from 'node:path';

import {
  WaylandConnection,
  type EventHandler,
  type MessageReader,
} from './wire.ts';

/*
 * The windows of the compositor, as listed by its wlr foreign toplevel
 * management protocol, which lets other clients, like ours, put them in full
 * screen on chosen outputs, and the outputs, with their positions from the
 * xdg output protocol.
 * See https://wayland.app/protocols/wlr-foreign-toplevel-management-unstable-v1
 * and https://wayland.app/protocols/xdg-output-unstable-v1.
 */

const REGISTRY_BIND = 0;
const REGISTRY_GLOBAL = 0;
const REGISTRY_GLOBAL_REMOVE = 1;

const OUTPUT_NAME = 4;

const XDG_OUTPUT_MANAGER_GET_XDG_OUTPUT = 1;
const XDG_OUTPUT_LOGICAL_POSITION = 0;
const XDG_OUTPUT_LOGICAL_SIZE = 1;
const XDG_OUTPUT_NAME = 3;

const TOPLEVEL_MANAGER_TOPLEVEL = 0;

const TOPLEVEL_TITLE = 0;
const TOPLEVEL_OUTPUT_ENTER = 2;
const TOPLEVEL_OUTPUT_LEAVE = 3;
const TOPLEVEL_STATE = 4;
const TOPLEVEL_DONE = 5;
const TOPLEVEL_CLOSED = 6;
const TOPLEVEL_DESTROY = 7;
const TOPLEVEL_SET_FULLSCREEN = 8;

const STATE_FULLSCREEN = 3;

/** Since which version the protocol has `set_fullscreen`. */
const TOPLEVEL_MANAGER_VERSION = 2;

/** An output of the compositor, in logical coordinates. */
export interface Output {
  /** Id of our object of the output. */
  readonly id: number;
  /** Name of the output, like `DP-1`. */
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A window of any client of the compositor. */
export interface Toplevel {
  readonly id: number;
  title: string;
  /** Every title that the window had. */
  readonly titles: Set<string>;
  /** Ids of the outputs that the window is on, the last entered last. */
  readonly outputs: Set<number>;
  fullscreen: boolean;
  closed: boolean;
}

/** An area of the outputs, in logical coordinates. */
export interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Returns the output of `outputs` that the middle of `area` is on, if any. */
export function outputAt(
  outputs: Iterable<Output>,
  { left, top, width, height }: Area,
): Output | undefined {
  const x = left + width / 2;
  const y = top + height / 2;
  for (const output of outputs) {
    if (
      x >= output.x &&
      x < output.x + output.width &&
      y >= output.y &&
      y < output.y + output.height
    ) {
      return output;
    }
  }
  return undefined;
}

/**
 * Returns the path of the socket of the Wayland compositor of `env`, if it
 * has one.
 */
export function waylandSocket(env: NodeJS.ProcessEnv): string | undefined {
  const display = env['WAYLAND_DISPLAY'];
  if (display === undefined || display === '') {
    return undefined;
  }
  if (path.isAbsolute(display)) {
    return display;
  }
  const runtime = env['XDG_RUNTIME_DIR'];
  return runtime === undefined || runtime === ''
    ? undefined
    : path.join(runtime, display);
}

interface Global {
  name: number;
  interface: string;
  version: number;
}

function readGlobal(args: MessageReader): Global {
  return {
    name: args.uint(),
    interface: args.string() ?? '',
    version: args.uint(),
  };
}

/**
 * The windows and outputs of a Wayland compositor that supports the wlr
 * foreign toplevel management protocol.
 */
export class WaylandWindows {
  readonly #connection: WaylandConnection;
  readonly #registry: number;
  readonly #xdgOutputManager: number;
  /** Outputs by the name of their globals. */
  readonly #outputs = new Map<number, Output>();
  readonly #toplevels = new Map<number, Toplevel>();
  /** Called whenever the compositor has sent a complete update. */
  readonly #listeners = new Set<() => void>();

  private constructor(
    connection: WaylandConnection,
    registry: number,
    globals: readonly Global[],
  ) {
    this.#connection = connection;
    this.#registry = registry;
    const find = (name: string) =>
      globals.find((global) => global.interface === name);
    const xdgOutputManager = find('zxdg_output_manager_v1');
    const toplevelManager = find('zwlr_foreign_toplevel_manager_v1');
    if (xdgOutputManager === undefined || toplevelManager === undefined) {
      throw new Error('Unsupported compositor');
    }
    this.#xdgOutputManager = this.#bind(
      xdgOutputManager,
      Math.min(xdgOutputManager.version, 3),
      () => undefined,
    );
    for (const global of globals) {
      if (global.interface === 'wl_output') {
        this.#addOutput(global);
      }
    }
    this.#bind(
      toplevelManager,
      Math.min(toplevelManager.version, 3),
      (opcode, args) => {
        if (opcode === TOPLEVEL_MANAGER_TOPLEVEL) {
          this.#addToplevel(args.uint());
        }
      },
    );
    // Outputs may be connected and disconnected later.
    connection.listen(registry, (opcode, args) => {
      if (opcode === REGISTRY_GLOBAL) {
        const global = readGlobal(args);
        if (global.interface === 'wl_output') {
          this.#addOutput(global);
        }
      } else if (opcode === REGISTRY_GLOBAL_REMOVE) {
        this.#outputs.delete(args.uint());
      }
    });
    connection.onClose = () => {
      this.#notify();
    };
  }

  /**
   * Connects to the compositor listening on the socket at `path`, or returns
   * `undefined` if it doesn't support the protocols.
   */
  static async connect(path: string): Promise<WaylandWindows | undefined> {
    const connection = await WaylandConnection.connect(path);
    try {
      const globals: Global[] = [];
      const registry = connection.getRegistry((opcode, args) => {
        if (opcode === REGISTRY_GLOBAL) {
          globals.push(readGlobal(args));
        }
      });
      await connection.roundtrip();
      const toplevelManager = globals.find(
        (global) => global.interface === 'zwlr_foreign_toplevel_manager_v1',
      );
      if (
        toplevelManager === undefined ||
        toplevelManager.version < TOPLEVEL_MANAGER_VERSION ||
        !globals.some((global) => global.interface === 'zxdg_output_manager_v1')
      ) {
        connection.close();
        return undefined;
      }
      const windows = new WaylandWindows(connection, registry, globals);
      // The positions of the outputs, and the windows.
      await connection.roundtrip();
      await connection.roundtrip();
      return windows;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  #bind(global: Global, version: number, handler: EventHandler): number {
    const id = this.#connection.newId(handler);
    this.#connection.send(this.#registry, REGISTRY_BIND, [
      global.name,
      global.interface,
      version,
      id,
    ]);
    return id;
  }

  #addOutput(global: Global): void {
    const output: Output = {
      id: this.#bind(global, Math.min(global.version, 4), (opcode, args) => {
        if (opcode === OUTPUT_NAME) {
          output.name = args.string() ?? '';
        }
      }),
      name: '',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    const xdgOutput = this.#connection.newId((opcode, args) => {
      this.#outputEvent(output, opcode, args);
    });
    this.#connection.send(
      this.#xdgOutputManager,
      XDG_OUTPUT_MANAGER_GET_XDG_OUTPUT,
      [xdgOutput, output.id],
    );
    this.#outputs.set(global.name, output);
  }

  #outputEvent(output: Output, opcode: number, args: MessageReader): void {
    switch (opcode) {
      case XDG_OUTPUT_LOGICAL_POSITION:
        output.x = args.int();
        output.y = args.int();
        break;
      case XDG_OUTPUT_LOGICAL_SIZE:
        output.width = args.int();
        output.height = args.int();
        break;
      case XDG_OUTPUT_NAME:
        output.name ||= args.string() ?? '';
        break;
    }
    this.#notify();
  }

  #addToplevel(id: number): void {
    const toplevel: Toplevel = {
      id,
      title: '',
      titles: new Set(),
      outputs: new Set(),
      fullscreen: false,
      closed: false,
    };
    this.#toplevels.set(id, toplevel);
    this.#connection.listen(id, (opcode, args) => {
      switch (opcode) {
        case TOPLEVEL_TITLE:
          toplevel.title = args.string() ?? '';
          toplevel.titles.add(toplevel.title);
          break;
        case TOPLEVEL_OUTPUT_ENTER: {
          const output = args.uint();
          toplevel.outputs.delete(output);
          toplevel.outputs.add(output);
          break;
        }
        case TOPLEVEL_OUTPUT_LEAVE:
          toplevel.outputs.delete(args.uint());
          break;
        case TOPLEVEL_STATE:
          toplevel.fullscreen = args.uints().includes(STATE_FULLSCREEN);
          break;
        case TOPLEVEL_DONE:
          this.#notify();
          break;
        case TOPLEVEL_CLOSED:
          toplevel.closed = true;
          this.#toplevels.delete(id);
          this.#connection.send(id, TOPLEVEL_DESTROY);
          this.#connection.forget(id);
          this.#notify();
          break;
      }
    });
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /**
   * Resolves with `true` once `condition` holds, or with `false` after
   * `timeout` milliseconds, or once the connection is closed.
   */
  #until(condition: () => boolean, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const check = () => {
        if (condition()) {
          finish(true);
        } else if (this.#connection.closed) {
          finish(false);
        }
      };
      const timer = setTimeout(() => {
        finish(false);
      }, timeout);
      const finish = (result: boolean) => {
        clearTimeout(timer);
        this.#listeners.delete(check);
        resolve(result);
      };
      this.#listeners.add(check);
      check();
    });
  }

  /** The outputs of the compositor. */
  get outputs(): Output[] {
    return [...this.#outputs.values()].filter((output) => output.width > 0);
  }

  /** Returns the output that the middle of `area` is on, if any. */
  outputAt(area: Area): Output | undefined {
    return outputAt(this.outputs, area);
  }

  /**
   * Returns the window that has or had `title`, waiting for it to be on an
   * output for at most `timeout` milliseconds.
   */
  async toplevel(
    title: string,
    timeout: number,
  ): Promise<Toplevel | undefined> {
    const find = () =>
      [...this.#toplevels.values()].find((toplevel) =>
        toplevel.titles.has(title),
      );
    // Compositors may tell which outputs a new window is on only later.
    await this.#until(() => (find()?.outputs.size ?? 0) > 0, timeout);
    return find();
  }

  /** Returns the output that `toplevel` entered last, if any. */
  outputOf(toplevel: Toplevel): Output | undefined {
    const id = [...toplevel.outputs].at(-1);
    return this.outputs.find((output) => output.id === id);
  }

  /**
   * Asks the compositor to show `toplevel` in full screen on `output`.
   *
   * @returns Whether it did so within `timeout` milliseconds.
   */
  fullscreen(
    toplevel: Toplevel,
    output: Output,
    timeout: number,
  ): Promise<boolean> {
    this.#connection.send(toplevel.id, TOPLEVEL_SET_FULLSCREEN, [output.id]);
    return this.#until(
      () =>
        !toplevel.closed &&
        toplevel.fullscreen &&
        toplevel.outputs.has(output.id),
      timeout,
    );
  }

  close(): void {
    this.#connection.close();
  }
}
