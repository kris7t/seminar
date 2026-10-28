import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as dbusNative from '@homebridge/dbus-native';

/*
 * A session bus of its own for tests, and services on it that stand in for
 * those of compositors.
 */

/** Whether `dbus-daemon` is on the `PATH`, to run a bus for the tests. */
export const hasDBusDaemon: boolean = (process.env['PATH'] ?? '')
  .split(path.delimiter)
  .some((directory) => existsSync(path.join(directory, 'dbus-daemon')));

/** A bus for tests. */
export interface TestBus {
  /** The directory of the bus, also for other files of the test. */
  directory: string;
  /** The address of the bus, like `DBUS_SESSION_BUS_ADDRESS`. */
  address: string;
  /** The path of the socket of the bus. */
  socket: string;
  stop(): Promise<void>;
}

/** Starts a bus for a test. */
export async function startBus(): Promise<TestBus> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'seminar-dbus-'));
  const socket = path.join(directory, 'bus');
  const daemon = spawn(
    'dbus-daemon',
    [
      '--session',
      '--nofork',
      '--print-address=1',
      `--address=unix:path=${socket}`,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const address = await new Promise<string>((resolve, reject) => {
    daemon.once('error', reject);
    daemon.stdout.once('data', (chunk: Buffer) => {
      resolve(chunk.toString().trim());
    });
  });
  return {
    directory,
    address,
    socket,
    stop: async () => {
      daemon.kill();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

/**
 * A method of a service: its signatures of arguments and results, and what
 * it does, which may return a promise, or throw.
 */
export type ServiceMethod = [string, string, (...args: never[]) => unknown];

interface NativeBus {
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
  createClient: (options: { socket: string }) => NativeBus;
};

/** A connection of a service that stands in for one of a compositor. */
export interface FakeService {
  /** Owns the well-known `name`. */
  requestName(name: string): Promise<void>;
  /** Exports an object at `path` with the methods of interface `name`. */
  export(
    path: string,
    name: string,
    methods: Record<string, ServiceMethod>,
  ): void;
  /** Calls a method of another connection, without waiting for it. */
  send(
    destination: string,
    path: string,
    iface: string,
    member: string,
    body: string[],
  ): void;
  close(): void;
}

/** Connects a fake service to the bus at `socket`. */
export async function connectService(socket: string): Promise<FakeService> {
  const bus = createClient({ socket });
  await new Promise<void>((resolve) => {
    bus.connection.once('connect', resolve);
  });
  return {
    requestName: (name) =>
      new Promise((resolve, reject) => {
        bus.requestName(name, 0, (error) => {
          if (error) {
            reject(new Error(error.name));
          } else {
            resolve();
          }
        });
      }),
    export: (objectPath, name, methods) => {
      bus.exportInterface(
        Object.fromEntries(
          Object.entries(methods).map(([member, [, , implementation]]) => [
            member,
            implementation,
          ]),
        ),
        objectPath,
        {
          name,
          methods: Object.fromEntries(
            Object.entries(methods).map(([member, [args, results]]) => [
              member,
              [args, results],
            ]),
          ),
        },
      );
    },
    send: (destination, objectPath, iface, member, body) => {
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
    },
    close: () => {
      bus.connection.end();
    },
  };
}
