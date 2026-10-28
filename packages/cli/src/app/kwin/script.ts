import type { Output } from '../compositor.ts';

/**
 * Which window of the app a script finds: the one with `caption`, or with the
 * internal `id` of KWin, which it puts in full screen on the output named
 * `fullscreenOn`, if given.
 */
export type ScriptAction =
  | { find: 'caption'; caption: string }
  | { find: 'id'; id: string; fullscreenOn?: string };

/** A window, as a script reports it. */
export interface ReportedWindow {
  /** The internal id of KWin. */
  id: string;
  output: string;
  fullScreen: boolean;
}

/** What a script reports. */
export interface Report {
  outputs: Output[];
  window?: ReportedWindow;
}

/** Where scripts report to. */
export interface ReportTarget {
  /** The unique name of our connection to the session bus. */
  service: string;
  path: string;
  interface: string;
  /** The method, which takes the id of the request and the report. */
  method: string;
}

/**
 * Returns a KWin script that does `action` with the window of the process
 * `pid`, if any, and reports the outputs and the window to `target` with
 * `request`.
 *
 * See https://develop.kde.org/docs/plasma/kwin/api/.
 */
export function kwinScript(
  target: ReportTarget,
  request: string,
  pid: number,
  action: ScriptAction | undefined,
): string {
  // JSON is valid JavaScript, so this quotes the values.
  return `const target = ${JSON.stringify(target)};
const request = ${JSON.stringify(request)};
const pid = ${JSON.stringify(pid)};
const action = ${JSON.stringify(action ?? null)};
const outputs = workspace.screens.map((screen) => ({
  name: screen.name,
  x: screen.geometry.x,
  y: screen.geometry.y,
  width: screen.geometry.width,
  height: screen.geometry.height,
}));
const window =
  action === null
    ? undefined
    : workspace.windowList().find(
        (candidate) =>
          candidate.pid === pid &&
          (action.find === 'caption'
            ? candidate.caption === action.caption
            : String(candidate.internalId) === action.id),
      );
if (window !== undefined && action.fullscreenOn !== undefined) {
  const output = workspace.screens.find(
    (screen) => screen.name === action.fullscreenOn,
  );
  if (output !== undefined) {
    workspace.sendClientToScreen(window, output);
    window.fullScreen = true;
  }
}
const report = { outputs };
if (window !== undefined) {
  report.window = {
    id: String(window.internalId),
    output: window.output.name,
    fullScreen: window.fullScreen,
  };
}
callDBus(
  target.service,
  target.path,
  target.interface,
  target.method,
  request,
  JSON.stringify(report),
);
`;
}
