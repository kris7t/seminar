import net from 'node:net';

/*
 * The wire format of the Wayland protocol, without file descriptors, which
 * the requests and events that we use don't have.
 * See https://wayland.freedesktop.org/docs/html/ch04.html#sect-Protocol-Wire-Format.
 */

/**
 * An argument of a message: a number for integers, objects, and new ids,
 * a string, or `null` for a null string.
 */
export type Argument = number | string | null;

const HEADER_SIZE = 8;

function padded(length: number): number {
  return (length + 3) & ~3;
}

/** Returns a message to object `id`. */
export function encodeMessage(
  id: number,
  opcode: number,
  args: readonly Argument[],
): Buffer {
  const parts = args.map((arg) => {
    if (typeof arg === 'number') {
      const part = Buffer.alloc(4);
      part.writeUInt32LE(arg >>> 0);
      return part;
    }
    if (arg === null) {
      return Buffer.alloc(4);
    }
    const text = Buffer.from(`${arg}\0`);
    const part = Buffer.alloc(4 + padded(text.length));
    part.writeUInt32LE(text.length);
    text.copy(part, 4);
    return part;
  });
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt32LE(id);
  header.writeUInt32LE(((HEADER_SIZE + body.length) << 16) | opcode, 4);
  return Buffer.concat([header, body]);
}

/** Reads the arguments of a message in order. */
export class MessageReader {
  readonly #body: Buffer;
  #offset = 0;

  constructor(body: Buffer) {
    this.#body = body;
  }

  uint(): number {
    const value = this.#body.readUInt32LE(this.#offset);
    this.#offset += 4;
    return value;
  }

  int(): number {
    const value = this.#body.readInt32LE(this.#offset);
    this.#offset += 4;
    return value;
  }

  string(): string | null {
    const length = this.uint();
    const value =
      length === 0
        ? null
        : this.#body.toString('utf8', this.#offset, this.#offset + length - 1);
    this.#offset += padded(length);
    return value;
  }

  /** Reads an array of 32-bit unsigned integers, like a set of states. */
  uints(): number[] {
    const length = this.uint();
    const values: number[] = [];
    for (let index = 0; index < length; index += 4) {
      values.push(this.#body.readUInt32LE(this.#offset + index));
    }
    this.#offset += padded(length);
    return values;
  }
}

/** A message, as split from the stream by {@link MessageSplitter}. */
export interface Message {
  id: number;
  opcode: number;
  body: Buffer;
}

/** Splits the stream of a connection into messages. */
export class MessageSplitter {
  #pending: Buffer = Buffer.alloc(0);

  /** Returns the messages completed by `chunk`. */
  push(chunk: Buffer): Message[] {
    this.#pending = Buffer.concat([this.#pending, chunk]);
    const messages: Message[] = [];
    while (this.#pending.length >= HEADER_SIZE) {
      const word = this.#pending.readUInt32LE(4);
      const size = word >>> 16;
      if (size < HEADER_SIZE) {
        throw new Error(`Invalid Wayland message of ${String(size)} bytes`);
      }
      if (this.#pending.length < size) {
        break;
      }
      messages.push({
        id: this.#pending.readUInt32LE(0),
        opcode: word & 0xffff,
        body: this.#pending.subarray(HEADER_SIZE, size),
      });
      this.#pending = this.#pending.subarray(size);
    }
    return messages;
  }
}

/** Handles the events of an object. */
export type EventHandler = (opcode: number, args: MessageReader) => void;

/** The object of the display, which every connection starts with. */
const DISPLAY = 1;

const DISPLAY_SYNC = 0;
const DISPLAY_GET_REGISTRY = 1;
const DISPLAY_ERROR = 0;
const CALLBACK_DONE = 0;

/** A connection to a Wayland compositor as a client. */
export class WaylandConnection {
  readonly #socket: net.Socket;
  readonly #handlers = new Map<number, EventHandler>();
  #nextId = DISPLAY + 1;
  /** Called once the connection is closed, with the error, if any. */
  onClose: ((error?: Error) => void) | undefined;

  private constructor(socket: net.Socket) {
    this.#socket = socket;
    const splitter = new MessageSplitter();
    this.#handlers.set(DISPLAY, (opcode, args) => {
      if (opcode === DISPLAY_ERROR) {
        const id = args.uint();
        const code = args.uint();
        const message = args.string() ?? '';
        this.#socket.destroy(
          new Error(
            `Wayland error ${String(code)} of object ${String(id)}: ${message}`,
          ),
        );
      }
      // Ids are never reused, so their deletion doesn't matter.
    });
    socket.on('data', (chunk: Buffer) => {
      try {
        for (const { id, opcode, body } of splitter.push(chunk)) {
          this.#handlers.get(id)?.(opcode, new MessageReader(body));
        }
      } catch (error) {
        socket.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
    let failure: Error | undefined;
    socket.on('error', (error) => {
      failure = error;
    });
    socket.on('close', () => {
      this.onClose?.(failure);
    });
  }

  /** Connects to the compositor listening on the socket at `path`. */
  static connect(path: string): Promise<WaylandConnection> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(path);
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.off('error', reject);
        resolve(new WaylandConnection(socket));
      });
    });
  }

  /** Whether the connection is closed. */
  get closed(): boolean {
    return this.#socket.destroyed;
  }

  /** Returns a new id for an object created by the client. */
  newId(handler: EventHandler): number {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#handlers.set(id, handler);
    return id;
  }

  /** Handles the events of an object created by the compositor. */
  listen(id: number, handler: EventHandler): void {
    this.#handlers.set(id, handler);
  }

  /** Stops handling the events of an object. */
  forget(id: number): void {
    this.#handlers.delete(id);
  }

  /** Sends a request to object `id`. */
  send(id: number, opcode: number, args: readonly Argument[] = []): void {
    if (!this.closed) {
      this.#socket.write(encodeMessage(id, opcode, args));
    }
  }

  /** Returns the id of a new registry. */
  getRegistry(handler: EventHandler): number {
    const id = this.newId(handler);
    this.send(DISPLAY, DISPLAY_GET_REGISTRY, [id]);
    return id;
  }

  /**
   * Resolves once the compositor has handled the requests sent so far, and
   * the events it sent in response.
   */
  roundtrip(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('The Wayland connection is closed'));
        return;
      }
      const id = this.newId((opcode) => {
        if (opcode === CALLBACK_DONE) {
          this.forget(id);
          this.#socket.off('close', onClose);
          resolve();
        }
      });
      const onClose = () => {
        reject(new Error('The Wayland connection is closed'));
      };
      this.#socket.once('close', onClose);
      this.send(DISPLAY, DISPLAY_SYNC, [id]);
    });
  }

  close(): void {
    this.#socket.end();
  }
}
