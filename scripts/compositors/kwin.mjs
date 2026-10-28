import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { hasCommand, until } from './session.mjs';

const KWIN = 'org.kde.KWin';
const REPORT_PATH = '/run/seminar/E2E';
const REPORT_INTERFACE = 'run.seminar.E2E';

/** Calls a method of the scripting interface of KWin. */
function scripting(connection, member, signature, body) {
  return connection.call({
    destination: KWIN,
    path: '/Scripting',
    interface: 'org.kde.kwin.Scripting',
    member,
    signature,
    body,
  });
}

/** KWin, on virtual outputs, with two of them. */
export const kwin = {
  name: 'KWin',

  available: () => hasCommand('kwin_wayland'),

  async start(session) {
    // From the build of the command line, which the tests need anyway.
    const { DBusConnection, socketPath } =
      await import('../../packages/cli/dist/app/dbus.js');
    const compositor = session.spawn(
      'kwin_wayland',
      [
        '--virtual',
        '--no-lockscreen',
        '--no-global-shortcuts',
        '--no-kactivities',
        '--output-count',
        '2',
        '--width',
        '1280',
        '--height',
        '720',
        '--socket',
        'wayland-e2e',
      ],
      { env: { QT_FORCE_STDERR_LOGGING: '1' } },
    );
    await until(
      () => existsSync(path.join(session.env.XDG_RUNTIME_DIR, 'wayland-e2e')),
      `KWin didn't start:\n${compositor.output}`,
    );
    const connection = await DBusConnection.connect(
      socketPath(session.env.DBUS_SESSION_BUS_ADDRESS),
    );
    await until(
      () => connection.hasOwner(KWIN),
      `KWin isn't on the bus:\n${compositor.output}`,
    );
    const reports = new Map();
    connection.export(REPORT_PATH, REPORT_INTERFACE, {
      Report: (request, result) => {
        reports.get(request)?.(JSON.parse(result));
      },
    });
    let nextRequest = 0;

    /** Runs `body` as a KWin script, and returns its `result`. */
    const query = async (body) => {
      nextRequest += 1;
      const request = String(nextRequest);
      const plugin = `seminar-e2e-${request}`;
      const file = await session.writeFile(
        `${plugin}.js`,
        `let result;
${body}
callDBus(${JSON.stringify(connection.name)}, ${JSON.stringify(REPORT_PATH)},
  ${JSON.stringify(REPORT_INTERFACE)}, 'Report', ${JSON.stringify(request)},
  JSON.stringify(result ?? null));
`,
      );
      const reported = new Promise((resolve) => reports.set(request, resolve));
      try {
        const [id] = await scripting(connection, 'loadScript', 'ss', [
          file,
          plugin,
        ]);
        await connection.call({
          destination: KWIN,
          path: `/Scripting/Script${String(id)}`,
          interface: 'org.kde.kwin.Script',
          member: 'run',
        });
        await scripting(connection, 'unloadScript', 's', [plugin]);
        return await Promise.race([
          reported,
          until(() => false, `KWin script didn't report:\n${body}`, 5000),
        ]);
      } finally {
        reports.delete(request);
        await rm(file, { force: true });
      }
    };

    /** Finds the window with the internal id of KWin. */
    const find = (id) =>
      `const window = workspace.windowList().find((w) => String(w.internalId) === ${JSON.stringify(id)});`;

    return {
      env: { WAYLAND_DISPLAY: 'wayland-e2e' },

      outputs: () =>
        query(`result = workspace.screens.map((screen) => ({
  name: screen.name,
  x: screen.geometry.x,
  y: screen.geometry.y,
  width: screen.geometry.width,
  height: screen.geometry.height,
}));`),

      windows: () =>
        query(`result = workspace.windowList()
  .filter((window) => window.normalWindow)
  .map((window) => ({
    id: String(window.internalId),
    title: window.caption,
    output: window.output.name,
    fullscreen: window.fullScreen,
    width: window.frameGeometry.width,
    height: window.frameGeometry.height,
  }));`),

      async moveWindow({ id }, output) {
        await query(`${find(id)}
workspace.sendClientToScreen(
  window,
  workspace.screens.find((screen) => screen.name === ${JSON.stringify(output)}),
);`);
      },

      async leaveFullscreen({ id }) {
        await query(`${find(id)}
window.fullScreen = false;`);
      },

      /** Loads the script in `file` as `plugin`, without running it. */
      async loadScript(file, plugin) {
        await scripting(connection, 'loadScript', 'ss', [file, plugin]);
      },

      async isScriptLoaded(plugin) {
        const [loaded] = await scripting(connection, 'isScriptLoaded', 's', [
          plugin,
        ]);
        return loaded;
      },

      stop() {
        connection.close();
      },
    };
  },
};
