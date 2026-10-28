import type { EventEmitter } from 'node:events';
import * as dbusNative from '@homebridge/dbus-native';

/*
 * The parts of `@homebridge/dbus-native` that we use, which its declarations
 * leave out.
 */

interface NativeMessage {
  destination: string;
  path: string;
  interface: string;
  member: string;
  signature?: string;
  body?: unknown[];
}

interface NativeBus {
  /** The unique name of the connection, once the bus has answered Hello. */
  name?: string | null;
  connection: EventEmitter & { end(): void };
  invoke(
    message: NativeMessage,
    callback: (
      error: { name: string; message: string } | null | undefined,
      ...values: unknown[]
    ) => void,
  ): void;
  exportInterface(
    implementation: Record<string, (...args: never[]) => unknown>,
    path: string,
    description: {
      name: string;
      methods: Record<string, [string, string]>;
    },
  ): void;
}

const { createClient } = dbusNative as unknown as {
  createClient: (options: { socket: string }) => NativeBus;
};

/**
 * Returns the path of the socket of a bus at `address`, like
 * `unix:path=/run/user/1000/bus`, or `undefined` if it's not a Unix socket.
 * Abstract sockets have paths that start with a null character.
 */
export function socketPath(address: string): string | undefined {
  for (const entry of address.split(';')) {
    const separator = entry.indexOf(':');
    if (entry.slice(0, separator) !== 'unix') {
      continue;
    }
    const params = new Map(
      entry
        .slice(separator + 1)
        .split(',')
        .map((param) => {
          const equals = param.indexOf('=');
          return [
            param.slice(0, equals),
            decodeURIComponent(param.slice(equals + 1)),
          ];
        }),
    );
    const path = params.get('path');
    if (path !== undefined) {
      return path;
    }
    const abstract = params.get('abstract');
    if (abstract !== undefined) {
      return `\0${abstract}`;
    }
  }
  return undefined;
}

/** A method call. */
export interface Call {
  destination: string;
  path: string;
  interface: string;
  member: string;
  signature?: string;
  body?: unknown[];
}

/** A connection to a D-Bus message bus. */
export class DBusConnection {
  readonly #bus: NativeBus;
  #closed = false;
  /** Rejects the calls waiting for their replies. */
  readonly #pending = new Set<(error: Error) => void>();

  private constructor(bus: NativeBus) {
    this.#bus = bus;
    const onClose = (error?: Error) => {
      this.#closed = true;
      for (const reject of this.#pending) {
        reject(error ?? new Error('The D-Bus connection is closed'));
      }
      this.#pending.clear();
    };
    bus.connection.on('end', () => {
      onClose();
    });
    bus.connection.on('error', onClose);
  }

  /**
   * Connects to the bus at the Unix socket at `path`, see
   * {@link socketPath}.
   */
  static async connect(path: string): Promise<DBusConnection> {
    // Instead of letting the library parse addresses, which would spawn
    // processes for some of them.
    const bus = createClient({ socket: path });
    const connection = new DBusConnection(bus);
    await new Promise<void>((resolve, reject) => {
      bus.connection.once('error', reject);
      bus.connection.once('connect', () => {
        bus.connection.off('error', reject);
        resolve();
      });
    });
    // Answered after Hello, which names the connection.
    await connection.call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'GetId',
    });
    return connection;
  }

  /** The unique name of the connection, like `:1.42`. */
  get name(): string {
    return this.#bus.name ?? '';
  }

  /** Calls a method, and returns what it returns. */
  call(call: Call): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      if (this.#closed) {
        reject(new Error('The D-Bus connection is closed'));
        return;
      }
      this.#pending.add(reject);
      this.#bus.invoke({ ...call }, (error, ...values) => {
        this.#pending.delete(reject);
        if (error) {
          reject(new Error(`${error.name}: ${error.message}`));
        } else {
          resolve(values);
        }
      });
    });
  }

  /** Returns whether a connection owns the well-known `name`. */
  async hasOwner(name: string): Promise<boolean> {
    const [owned] = await this.call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'NameHasOwner',
      signature: 's',
      body: [name],
    });
    return owned === true;
  }

  /**
   * Exports an object at `path` with an interface whose methods take only
   * strings and return nothing.
   */
  export(
    path: string,
    name: string,
    methods: Record<string, (...args: string[]) => void>,
  ): void {
    this.#bus.exportInterface(methods, path, {
      name,
      methods: Object.fromEntries(
        Object.entries(methods).map(([method, implementation]) => [
          method,
          ['s'.repeat(implementation.length), ''],
        ]),
      ),
    });
  }

  close(): void {
    this.#closed = true;
    this.#bus.connection.end();
  }
}
