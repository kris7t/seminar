import path from 'node:path';

import {
  outputAt,
  type Area,
  type Compositor,
  type CompositorWindow,
  type Output as CompositorOutput,
} from '../compositor.ts';
import { cosmic } from './cosmic.ts';
import {
  findGlobal,
  type BoundProtocol,
  type Global,
  type Toplevel,
  type ToplevelProtocol,
} from './protocols.ts';
import {
  WaylandConnection,
  type EventHandler,
  type MessageReader,
} from './wire.ts';
import { wlr } from './wlr.ts';

/*
 * The windows of the compositor, as listed by a protocol that lets other
 * clients, like ours, put them in full screen on chosen outputs, and the
 * outputs, with their positions from the xdg output protocol.
 * See https://wayland.app/protocols/xdg-output-unstable-v1.
 */

const REGISTRY_BIND = 0;
const REGISTRY_GLOBAL = 0;
const REGISTRY_GLOBAL_REMOVE = 1;

const OUTPUT_NAME = 4;

const XDG_OUTPUT_MANAGER = 'zxdg_output_manager_v1';
const XDG_OUTPUT_MANAGER_GET_XDG_OUTPUT = 1;
const XDG_OUTPUT_LOGICAL_POSITION = 0;
const XDG_OUTPUT_LOGICAL_SIZE = 1;
const XDG_OUTPUT_NAME = 3;

/** The protocols for windows that we know, the preferred first. */
const PROTOCOLS: readonly ToplevelProtocol[] = [wlr, cosmic];

/** An output of the compositor. */
export interface Output extends CompositorOutput {
  /** Id of our object of the output. */
  readonly id: number;
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

function readGlobal(args: MessageReader): Global {
  return {
    name: args.uint(),
    interface: args.string() ?? '',
    version: args.uint(),
  };
}

/**
 * The windows and outputs of a Wayland compositor that has one of the
 * {@link PROTOCOLS}.
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
  readonly #protocol: BoundProtocol;
  /** Called whenever the compositor has sent a complete update. */
  readonly #listeners = new Set<() => void>();

  private constructor(
    connection: WaylandConnection,
    registry: number,
    globals: readonly Global[],
    protocol: ToplevelProtocol,
  ) {
    this.#connection = connection;
    this.#registry = registry;
    const xdgOutputManager = findGlobal(globals, XDG_OUTPUT_MANAGER);
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
    this.#protocol = protocol.bind(globals, {
      connection,
      bind: (global, version, handler) => this.#bind(global, version, handler),
      add: (toplevel, requestFullscreen) => {
        this.#toplevels.set(toplevel.id, toplevel);
        this.#requestFullscreen.set(toplevel, requestFullscreen);
      },
      remove: (toplevel) => {
        toplevel.closed = true;
        this.#toplevels.delete(toplevel.id);
        this.#notify();
      },
      update: () => {
        this.#notify();
      },
    });
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
      const protocol = globals.some(
        (global) => global.interface === XDG_OUTPUT_MANAGER,
      )
        ? PROTOCOLS.find((candidate) => candidate.supports(globals))
        : undefined;
      if (protocol === undefined) {
        connection.close();
        return undefined;
      }
      const windows = new WaylandWindows(
        connection,
        registry,
        globals,
        protocol,
      );
      // The positions of the outputs, and the windows.
      await connection.roundtrip();
      await connection.roundtrip();
      if (!windows.#protocol.fullscreens) {
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
