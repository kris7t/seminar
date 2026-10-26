/**
 * Types of the messages of sequence diagrams, i.e., of their statements, like
 * the `LINETYPE` of Pele, which it doesn't export, that start blocks, by the
 * kind of block.
 */
export const BLOCK_STARTS: ReadonlyMap<number, string> = new Map([
  [10, 'loop'],
  [12, 'alt'],
  [15, 'opt'],
  [19, 'par'],
  [22, 'rect'],
  [27, 'critical'],
  [30, 'break'],
  [32, 'par'],
]);

/** Types of messages that end blocks. */
export const BLOCK_ENDS: ReadonlySet<number> = new Set([
  11, 14, 16, 21, 23, 29, 31,
]);

/**
 * Types of messages without elements of their own: branches of blocks, like
 * `else`, activations, and numbering.
 */
export const WITHOUT_ELEMENTS: ReadonlySet<number> = new Set([
  13, 17, 18, 20, 26, 28,
]);

/** The type of notes. */
export const NOTE = 2;

/**
 * Returns the id of the elements of the message `id`, which are numbered
 * along with every statement of the diagram.
 */
export function messageId(id: number | string): string {
  return `i${String(id)}`;
}

/** Type of the blocks whose frames Pele doesn't draw. */
export const RECT_START = 22;
