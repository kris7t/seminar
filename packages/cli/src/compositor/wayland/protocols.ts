import type { EventHandler, WaylandConnection } from './wire.ts';

/*
 * What protocols that list the windows of the compositor, and put them in
 * full screen on chosen outputs, have in common, and what they need from
 * the client that uses them, see `WaylandWindows`.
 */

/** A global of the compositor, from its registry. */
export interface Global {
  name: number;
  interface: string;
  version: number;
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

/** The state of full screen, in the protocols that copy the xdg shell. */
export const STATE_FULLSCREEN = 3;

/** Returns a new window, for the object with `id`. */
export function newToplevel(id: number): Toplevel {
  return {
    id,
    title: '',
    titles: new Set(),
    outputs: new Set(),
    fullscreen: false,
    closed: false,
  };
}

export function setTitle(toplevel: Toplevel, title: string): void {
  toplevel.title = title;
  toplevel.titles.add(title);
}

export function enterOutput(toplevel: Toplevel, output: number): void {
  // So that the output entered last is last.
  toplevel.outputs.delete(output);
  toplevel.outputs.add(output);
}

/** Returns the global with `name`, which the protocol needs. */
export function findGlobal(globals: readonly Global[], name: string): Global {
  const global = globals.find((candidate) => candidate.interface === name);
  if (global === undefined) {
    throw new Error(`The compositor has no ${name}`);
  }
  return global;
}

/** How to ask the compositor for things with a window. */
export interface ToplevelRequests {
  /** Asks for it in full screen on the output with the id of our object. */
  readonly fullscreen: (output: number) => void;
  /** Asks to focus it for the seat with the id of our object. */
  readonly activate: (seat: number) => void;
}

/** What the client gives a protocol to list windows with. */
export interface ProtocolContext {
  readonly connection: WaylandConnection;
  /**
   * Binds `global` at `version`, with `handler` for its events, and returns
   * the id of our object.
   */
  readonly bind: (
    global: Global,
    version: number,
    handler: EventHandler,
  ) => number;
  /** Adds a window, with how to ask the compositor for things with it. */
  readonly add: (toplevel: Toplevel, requests: ToplevelRequests) => void;
  /** Removes a window that was closed. */
  readonly remove: (toplevel: Toplevel) => void;
  /** Tells that the compositor has sent a complete update. */
  readonly update: () => void;
}

/** A protocol bound by the client. */
export interface BoundProtocol {
  /**
   * Whether the compositor can show windows in full screen with it, once
   * it has answered the requests so far.
   */
  readonly fullscreens: boolean;
}

/** A protocol that lists windows, and puts them in full screen on outputs. */
export interface ToplevelProtocol {
  /** Whether the compositor has the protocol, with the globals it needs. */
  supports(globals: readonly Global[]): boolean;
  /** Binds the protocol, which adds the windows that it lists. */
  bind(globals: readonly Global[], context: ProtocolContext): BoundProtocol;
}
