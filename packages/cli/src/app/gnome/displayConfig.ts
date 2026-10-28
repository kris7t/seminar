import type { Output } from '../compositor.ts';

/*
 * The state of the displays from `org.gnome.Mutter.DisplayConfig`, as
 * `@homebridge/dbus-native` decodes it: structs as arrays, and variants as
 * their signature and value.
 * See https://gitlab.gnome.org/GNOME/mutter/-/blob/main/data/dbus-interfaces/org.gnome.Mutter.DisplayConfig.xml.
 */

type Variant = [unknown, [unknown]];

type Properties = [string, Variant][];

/** A monitor: its connector and so on, its modes, and its properties. */
type Monitor = [[string, ...unknown[]], Mode[], Properties];

/** A mode: its id, width, height, refresh rate, ..., and its properties. */
type Mode = [string, number, number, ...unknown[]];

/**
 * A logical monitor: its position, scale, transform, whether it's primary,
 * its monitors, and its properties.
 */
type LogicalMonitor = [
  number,
  number,
  number,
  number,
  boolean,
  [string, ...unknown[]][],
  Properties,
];

/** The reply of `GetCurrentState`. */
export type DisplayState = [number, Monitor[], LogicalMonitor[], Properties];

function property(properties: Properties, name: string): unknown {
  return properties.find(([key]) => key === name)?.[1][1][0];
}

/** Layout mode in which positions and sizes are scaled, unlike physical. */
const LOGICAL_LAYOUT = 1;

/**
 * Returns the logical monitors of `state` as outputs, in the coordinates of
 * windows, named after the connector of their first monitor.
 */
export function displayOutputs(state: DisplayState): Output[] {
  const [, monitors, logicalMonitors, properties] = state;
  const logical =
    (property(properties, 'layout-mode') ?? LOGICAL_LAYOUT) === LOGICAL_LAYOUT;
  const outputs: Output[] = [];
  for (const [x, y, scale, transform, , [first]] of logicalMonitors) {
    const connector = first?.[0];
    const modes = monitors.find(([[name]]) => name === connector)?.[1] ?? [];
    const mode = modes.find(
      (candidate) =>
        property(candidate.at(-1) as Properties, 'is-current') === true,
    );
    if (connector === undefined || mode === undefined) {
      continue;
    }
    // Transforms of 90 and 270 degrees, flipped or not, swap the sides.
    const [width, height] =
      transform % 2 === 1 ? [mode[2], mode[1]] : [mode[1], mode[2]];
    outputs.push({
      name: connector,
      x,
      y,
      width: logical ? Math.round(width / scale) : width,
      height: logical ? Math.round(height / scale) : height,
    });
  }
  return outputs;
}
