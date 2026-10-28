import { setTimeout as sleep } from 'node:timers/promises';

import {
  outputAt,
  type Area,
  type Compositor,
  type CompositorWindow,
  type Output,
} from '../compositor.ts';
import { DBusConnection, socketPath } from '../dbus.ts';
import { displayOutputs, type DisplayState } from './displayConfig.ts';

/*
 * The windows of GNOME Shell, through the Window Calls extension, which
 * lets other clients move them, and the monitors of Mutter. Mutter shows
 * windows in full screen on the monitor that they are on, so the windows
 * only have to be moved there first.
 * See https://github.com/ickyicky/window-calls.
 */

const SHELL = 'org.gnome.Shell';
const WINDOWS_PATH = '/org/gnome/Shell/Extensions/Windows';
const WINDOWS_INTERFACE = 'org.gnome.Shell.Extensions.Windows';

const DISPLAY_CONFIG = 'org.gnome.Mutter.DisplayConfig';

/** How often to ask again while waiting for a window, in milliseconds. */
const POLL_INTERVAL = 100;

/** A window, as `List` of Window Calls describes it. */
interface ListedWindow {
  id: number;
  pid: number;
  title: string;
}

/** A window, as `Details` of Window Calls describes it. */
interface WindowDetails {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The windows of GNOME Shell, and the monitors of Mutter. */
export class GnomeWindows implements Compositor {
  readonly fullscreens = false;
  readonly #connection: DBusConnection;
  /** The process whose windows to find. */
  readonly #pid: number;
  /** The outputs when last asked. */
  #outputs: Output[] = [];

  private constructor(connection: DBusConnection, pid: number) {
    this.#connection = connection;
    this.#pid = pid;
  }

  /**
   * Connects to GNOME Shell on the session bus of `env`, to place the
   * windows of the process `pid`, or returns `undefined` if there's no
   * GNOME Shell, or no Window Calls in it.
   */
  static async connect(
    env: NodeJS.ProcessEnv,
    pid: number,
  ): Promise<GnomeWindows | undefined> {
    const address = env['DBUS_SESSION_BUS_ADDRESS'];
    const socket =
      address === undefined || address === '' ? undefined : socketPath(address);
    if (socket === undefined) {
      return undefined;
    }
    const connection = await DBusConnection.connect(socket);
    const windows = new GnomeWindows(connection, pid);
    try {
      if (
        !(await connection.hasOwner(SHELL)) ||
        (await windows.#list().catch(() => undefined)) === undefined
      ) {
        connection.close();
        return undefined;
      }
      await windows.#updateOutputs();
      return windows;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  async #windowCall(
    member: string,
    signature?: string,
    body?: unknown[],
  ): Promise<unknown> {
    const [result] = await this.#connection.call({
      destination: SHELL,
      path: WINDOWS_PATH,
      interface: WINDOWS_INTERFACE,
      member,
      ...(signature === undefined ? {} : { signature }),
      ...(body === undefined ? {} : { body }),
    });
    return result;
  }

  async #list(): Promise<ListedWindow[]> {
    return JSON.parse(String(await this.#windowCall('List'))) as ListedWindow[];
  }

  /** Returns the details of the window `id`, or `undefined` if it's gone. */
  async #details(id: number): Promise<WindowDetails | undefined> {
    try {
      return JSON.parse(
        String(await this.#windowCall('Details', 'u', [id])),
      ) as WindowDetails;
    } catch {
      return undefined;
    }
  }

  async #updateOutputs(): Promise<void> {
    const state = await this.#connection.call({
      destination: DISPLAY_CONFIG,
      path: '/org/gnome/Mutter/DisplayConfig',
      interface: DISPLAY_CONFIG,
      member: 'GetCurrentState',
    });
    this.#outputs = displayOutputs(state as DisplayState);
  }

  /** Returns the output that the window with `details` is on, if any. */
  #outputOf({ x, y, width, height }: WindowDetails): Output | undefined {
    return outputAt(this.#outputs, { left: x, top: y, width, height });
  }

  outputAt(area: Area): Output | undefined {
    return outputAt(this.#outputs, area);
  }

  async findWindow(
    title: string,
    timeout: number,
  ): Promise<CompositorWindow | undefined> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const window = (await this.#list()).find(
        (candidate) => candidate.pid === this.#pid && candidate.title === title,
      );
      // Once it's shown, since Mutter places windows when they are.
      const details =
        window === undefined ? undefined : await this.#details(window.id);
      if (window !== undefined && details !== undefined && details.width > 0) {
        return this.#window(window.id);
      }
      if (Date.now() >= deadline) {
        return undefined;
      }
      await sleep(POLL_INTERVAL);
    }
  }

  #window(id: number): CompositorWindow {
    return {
      output: async () => {
        await this.#updateOutputs();
        const details = await this.#details(id);
        return details === undefined ? undefined : this.#outputOf(details);
      },
      place: async (output, timeout) => {
        const deadline = Date.now() + timeout;
        let details = await this.#details(id);
        if (details === undefined) {
          return false;
        }
        // In the middle of the output, or at its corner if it's larger.
        await this.#windowCall('Move', 'uii', [
          id,
          output.x +
            Math.max(0, Math.floor((output.width - details.width) / 2)),
          output.y +
            Math.max(0, Math.floor((output.height - details.height) / 2)),
        ]);
        while (
          details !== undefined &&
          this.#outputOf(details)?.name !== output.name
        ) {
          if (Date.now() >= deadline) {
            return false;
          }
          await sleep(POLL_INTERVAL);
          details = await this.#details(id);
        }
        return details !== undefined;
      },
    };
  }

  close(): void {
    this.#connection.close();
  }
}
