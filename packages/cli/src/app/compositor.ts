/*
 * What the app needs from a compositor to place its windows where browsers
 * can't, e.g., on Wayland.
 */

/** An area of the outputs, in logical coordinates. */
export interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** An output of the compositor, in logical coordinates. */
export interface Output {
  /** Name of the output, like `DP-1`. */
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Returns the output of `outputs` that the middle of `area` is on, if any. */
export function outputAt<T extends Output>(
  outputs: Iterable<T>,
  { left, top, width, height }: Area,
): T | undefined {
  const x = left + width / 2;
  const y = top + height / 2;
  for (const output of outputs) {
    if (
      x >= output.x &&
      x < output.x + output.width &&
      y >= output.y &&
      y < output.y + output.height
    ) {
      return output;
    }
  }
  return undefined;
}

/** A window of the app, as the compositor knows it. */
export interface CompositorWindow {
  /** Returns the output that the window is on, if known. */
  output(): Promise<Output | undefined>;
  /**
   * Asks the compositor to show the window on `output`, in full screen if
   * it {@link Compositor.fullscreens}, or else only there, so that it can go
   * full screen on the output that it is on.
   *
   * @returns Whether it did so within `timeout` milliseconds.
   */
  place(output: Output, timeout: number): Promise<boolean>;
}

/** A compositor that lets the app place its windows. */
export interface Compositor {
  /**
   * Whether placing a window on an output also shows it in full screen,
   * since the compositor can only put windows on chosen outputs that way.
   */
  readonly fullscreens: boolean;
  /** Returns the output that the middle of `area` is on, if any. */
  outputAt(area: Area): Output | undefined;
  /**
   * Returns the window of the app that has or had `title`, waiting for it to
   * be on an output for at most `timeout` milliseconds.
   */
  findWindow(
    title: string,
    timeout: number,
  ): Promise<CompositorWindow | undefined>;
  close(): void;
}
