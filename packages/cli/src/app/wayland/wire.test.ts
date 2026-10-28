import { describe, expect, it } from 'vitest';

import { encodeMessage, MessageReader, MessageSplitter } from './wire.ts';

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
