import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  encodeMessage,
  MessageReader,
  MessageSplitter,
  WaylandConnection,
} from './wire.ts';

describe('the wire format', () => {
  it('encodes and decodes messages', () => {
    const message = encodeMessage(3, 2, [42, -1, 'wl_output', null]);
    // Header, two integers, a string padded to 12 bytes, and a null string.
    expect(message.length).toBe(8 + 4 + 4 + 4 + 12 + 4);
    const [decoded] = new MessageSplitter().push(message);
    expect(decoded?.id).toBe(3);
    expect(decoded?.opcode).toBe(2);
    const reader = new MessageReader(decoded?.body ?? Buffer.alloc(0));
    expect(reader.uint()).toBe(42);
    expect(reader.int()).toBe(-1);
    expect(reader.string()).toBe('wl_output');
    expect(reader.string()).toBeNull();
  });

  it('splits messages that arrive in pieces', () => {
    const stream = Buffer.concat([
      encodeMessage(1, 0, ['first']),
      encodeMessage(2, 1, [7]),
    ]);
    const splitter = new MessageSplitter();
    expect(splitter.push(stream.subarray(0, 5))).toEqual([]);
    expect(splitter.push(stream.subarray(5, 20)).map(({ id }) => id)).toEqual([
      1,
    ]);
    expect(splitter.push(stream.subarray(20)).map(({ id }) => id)).toEqual([2]);
  });

  it('reads arrays of states', () => {
    const body = Buffer.alloc(12);
    body.writeUInt32LE(8);
    body.writeUInt32LE(2, 4);
    body.writeUInt32LE(3, 8);
    expect(new MessageReader(body).uints()).toEqual([2, 3]);
  });
});

describe('malformed messages', () => {
  it('throws on arguments past the end of the message', () => {
    const reader = new MessageReader(Buffer.alloc(6));
    expect(reader.uint()).toBe(0);
    expect(() => reader.uint()).toThrow('Truncated Wayland message');
    const string = Buffer.alloc(8);
    string.writeUInt32LE(100);
    expect(() => new MessageReader(string).string()).toThrow(
      'Truncated Wayland message',
    );
    const array = Buffer.alloc(8);
    array.writeUInt32LE(8);
    expect(() => new MessageReader(array).uints()).toThrow(
      'Truncated Wayland message',
    );
  });

  it('throws on strings without a null at the end', () => {
    const body = Buffer.alloc(8);
    body.writeUInt32LE(4);
    body.write('abcd', 4);
    expect(() => new MessageReader(body).string()).toThrow(
      'Unterminated string in a Wayland message',
    );
  });

  it('throws on arrays of integers that are not whole', () => {
    const body = Buffer.alloc(8);
    body.writeUInt32LE(3);
    expect(() => new MessageReader(body).uints()).toThrow(
      'Invalid array of integers in a Wayland message',
    );
  });

  it('throws on messages shorter than their header', () => {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(1);
    header.writeUInt32LE(4 << 16, 4);
    expect(() => new MessageSplitter().push(header)).toThrow(
      'Invalid Wayland message of 4 bytes',
    );
  });
});

describe('WaylandConnection', () => {
  let directory: string;
  let server: net.Server | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'seminar-wire-'));
  });

  afterEach(async () => {
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

  it('closes on malformed messages from the compositor', async () => {
    const socket = path.join(directory, 'wayland-0');
    server = net.createServer((client) => {
      client.on('data', () => {
        // An event of the registry with a string longer than the message.
        const message = encodeMessage(2, 0, [1, 'wl_output', 4]);
        message.writeUInt32LE(1000, 12);
        client.write(message);
      });
    });
    await new Promise<void>((resolve) => {
      server?.listen(socket, resolve);
    });
    const connection = await WaylandConnection.connect(socket);
    const closed = new Promise<Error | undefined>((resolve) => {
      connection.onClose = resolve;
    });
    connection.getRegistry((_, args) => {
      args.uint();
      args.string();
    });
    await expect(connection.roundtrip()).rejects.toThrow(
      'The Wayland connection is closed',
    );
    expect((await closed)?.message).toBe('Truncated Wayland message');
  });
});
