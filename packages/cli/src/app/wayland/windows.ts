import path from 'node:path';

import {
  outputAt,
  type Area,
  type Compositor,
  type CompositorWindow,
  type Output as CompositorOutput,
} from '../compositor.ts';
import {
  WaylandConnection,
  type EventHandler,
  type MessageReader,
} from './wire.ts';

/*
 * The windows of the compositor, as listed by its wlr foreign toplevel
 * management protocol, or the COSMIC toplevel info and management protocols
 * on top of the ext foreign toplevel list protocol, which let other clients,
 * like ours, put them in full screen on chosen outputs, and the outputs, with
 * their positions from the xdg output protocol.
 * See https://wayland.app/protocols/wlr-foreign-toplevel-management-unstable-v1,
 * https://wayland.app/protocols/cosmic-toplevel-info-unstable-v1,
 * https://wayland.app/protocols/cosmic-toplevel-management-unstable-v1,
 * https://wayland.app/protocols/ext-foreign-toplevel-list-v1,
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

const FOREIGN_LIST_TOPLEVEL = 0;

const FOREIGN_TOPLEVEL_CLOSED = 0;
const FOREIGN_TOPLEVEL_DONE = 1;
const FOREIGN_TOPLEVEL_TITLE = 2;
const FOREIGN_TOPLEVEL_DESTROY = 0;

const COSMIC_INFO_GET_COSMIC_TOPLEVEL = 1;
const COSMIC_INFO_DONE = 2;

/** Since which version COSMIC extends the ext foreign toplevels. */
const COSMIC_INFO_VERSION = 2;

const COSMIC_TOPLEVEL_OUTPUT_ENTER = 4;
const COSMIC_TOPLEVEL_OUTPUT_LEAVE = 5;
const COSMIC_TOPLEVEL_STATE = 8;
const COSMIC_TOPLEVEL_DESTROY = 0;

const COSMIC_MANAGER_CAPABILITIES = 0;
const COSMIC_MANAGER_SET_FULLSCREEN = 7;
const COSMIC_CAPABILITY_FULLSCREEN = 5;

/** Which protocols the compositor lists and places windows with. */
type Protocols = 'wlr' | 'cosmic';

/** Returns the protocols that `globals` let us place windows with, if any. */
function protocolsOf(globals: readonly Global[]): Protocols | undefined {
  const find = (name: string) =>
    globals.find((global) => global.interface === name);
  if (find('zxdg_output_manager_v1') === undefined) {
    return undefined;
  }
  if (
    (find('zwlr_foreign_toplevel_manager_v1')?.version ?? 0) >=
    TOPLEVEL_MANAGER_VERSION
  ) {
    return 'wlr';
  }
  if (
    find('ext_foreign_toplevel_list_v1') !== undefined &&
    (find('zcosmic_toplevel_info_v1')?.version ?? 0) >= COSMIC_INFO_VERSION &&
    find('zcosmic_toplevel_manager_v1') !== undefined
  ) {
    return 'cosmic';
  }
  return undefined;
}

/** An output of the compositor. */
export interface Output extends CompositorOutput {
  /** Id of our object of the output. */
  readonly id: number;
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
export class WaylandWindows implements Compositor {
  readonly fullscreens = true;
  readonly #connection: WaylandConnection;
  readonly #registry: number;
  readonly #xdgOutputManager: number;
  /** Outputs by the name of their globals. */
  readonly #outputs = new Map<number, Output>();
  readonly #toplevels = new Map<number, Toplevel>();
  /** Asks to show a window in full screen on the output with an id. */
  readonly #requestFullscreen = new WeakMap<
    Toplevel,
    (output: number) => void
  >();
  /** The COSMIC objects that extend the ext foreign toplevels, if used. */
  #cosmicInfo: number | undefined;
  #cosmicManager: number | undefined;
  /** What the COSMIC toplevel manager can do, once it has said. */
  #cosmicCapabilities: number[] | undefined;
  /** Called whenever the compositor has sent a complete update. */
  readonly #listeners = new Set<() => void>();

  private constructor(
    connection: WaylandConnection,
    registry: number,
    globals: readonly Global[],
    protocols: Protocols,
  ) {
    this.#connection = connection;
    this.#registry = registry;
    const find = (name: string) => {
      const global = globals.find((candidate) => candidate.interface === name);
      if (global === undefined) {
        throw new Error(`The compositor has no ${name}`);
      }
      return global;
    };
    const xdgOutputManager = find('zxdg_output_manager_v1');
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
    if (protocols === 'wlr') {
      const toplevelManager = find('zwlr_foreign_toplevel_manager_v1');
      this.#bind(
        toplevelManager,
        Math.min(toplevelManager.version, 3),
        (opcode, args) => {
          if (opcode === TOPLEVEL_MANAGER_TOPLEVEL) {
            this.#addToplevel(args.uint());
          }
        },
      );
    } else {
      const info = find('zcosmic_toplevel_info_v1');
      this.#cosmicInfo = this.#bind(
        info,
        Math.min(info.version, 3),
        (opcode) => {
          if (opcode === COSMIC_INFO_DONE) {
            this.#notify();
          }
        },
      );
      const manager = find('zcosmic_toplevel_manager_v1');
      this.#cosmicManager = this.#bind(
        manager,
        Math.min(manager.version, 4),
        (opcode, args) => {
          if (opcode === COSMIC_MANAGER_CAPABILITIES) {
            this.#cosmicCapabilities = args.uints();
          }
        },
      );
      // After the COSMIC objects, to extend the toplevels that it lists.
      this.#bind(find('ext_foreign_toplevel_list_v1'), 1, (opcode, args) => {
        if (opcode === FOREIGN_LIST_TOPLEVEL) {
          this.#addForeignToplevel(args.uint());
        }
      });
    }
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
      const protocols = protocolsOf(globals);
      if (protocols === undefined) {
        connection.close();
        return undefined;
      }
      const windows = new WaylandWindows(
        connection,
        registry,
        globals,
        protocols,
      );
      // The positions of the outputs, and the windows.
      await connection.roundtrip();
      await connection.roundtrip();
      if (
        windows.#cosmicCapabilities !== undefined &&
        !windows.#cosmicCapabilities.includes(COSMIC_CAPABILITY_FULLSCREEN)
      ) {
        connection.close();
        return undefined;
      }
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
    this.#requestFullscreen.set(toplevel, (output) => {
      this.#connection.send(id, TOPLEVEL_SET_FULLSCREEN, [output]);
    });
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

  /**
   * Adds a window listed by the ext foreign toplevel list, with its COSMIC
   * extension, which tells its outputs and state.
   */
  #addForeignToplevel(id: number): void {
    const toplevel: Toplevel = {
      id,
      title: '',
      titles: new Set(),
      outputs: new Set(),
      fullscreen: false,
      closed: false,
    };
    this.#toplevels.set(id, toplevel);
    const cosmic = this.#connection.newId((opcode, args) => {
      switch (opcode) {
        case COSMIC_TOPLEVEL_OUTPUT_ENTER: {
          const output = args.uint();
          toplevel.outputs.delete(output);
          toplevel.outputs.add(output);
          break;
        }
        case COSMIC_TOPLEVEL_OUTPUT_LEAVE:
          toplevel.outputs.delete(args.uint());
          break;
        case COSMIC_TOPLEVEL_STATE:
          toplevel.fullscreen = args.uints().includes(STATE_FULLSCREEN);
          break;
      }
    });
    const info = this.#cosmicInfo;
    const manager = this.#cosmicManager;
    if (info !== undefined && manager !== undefined) {
      this.#connection.send(info, COSMIC_INFO_GET_COSMIC_TOPLEVEL, [
        cosmic,
        id,
      ]);
      this.#requestFullscreen.set(toplevel, (output) => {
        this.#connection.send(manager, COSMIC_MANAGER_SET_FULLSCREEN, [
          cosmic,
          output,
        ]);
      });
    }
    this.#connection.listen(id, (opcode, args) => {
      switch (opcode) {
        case FOREIGN_TOPLEVEL_TITLE:
          toplevel.title = args.string() ?? '';
          toplevel.titles.add(toplevel.title);
          break;
        case FOREIGN_TOPLEVEL_DONE:
          this.#notify();
          break;
        case FOREIGN_TOPLEVEL_CLOSED:
          toplevel.closed = true;
          this.#toplevels.delete(id);
          this.#connection.send(cosmic, COSMIC_TOPLEVEL_DESTROY);
          this.#connection.send(id, FOREIGN_TOPLEVEL_DESTROY);
          this.#connection.forget(cosmic);
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

  async findWindow(
    title: string,
    timeout: number,
  ): Promise<CompositorWindow | undefined> {
    const toplevel = await this.toplevel(title, timeout);
    return toplevel === undefined
      ? undefined
      : {
          output: () => Promise.resolve(this.outputOf(toplevel)),
          place: (output, timeout) => {
            // Only our own outputs have the ids of their objects.
            const ours = this.outputs.find((candidate) => candidate === output);
            return ours === undefined
              ? Promise.resolve(false)
              : this.fullscreen(toplevel, ours, timeout);
          },
        };
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
    this.#requestFullscreen.get(toplevel)?.(output.id);
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
