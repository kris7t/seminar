import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { hasCommand, until } from './session.mjs';

const run = promisify(execFile);

const UUID = 'window-calls@domandoman.xyz';

/** The release of Window Calls that the tests install, and its digest. */
const WINDOW_CALLS = {
  url: 'https://extensions.gnome.org/extension-data/window-callsdomandoman.xyz.v21.shell-extension.zip',
  sha256: '6a593ec924cf910cc3e107a6acb7d19250e2aae04b9513e9df0497e8a72566ac',
};

const SHELL = 'org.gnome.Shell';
const WINDOWS = {
  destination: SHELL,
  path: '/org/gnome/Shell/Extensions/Windows',
  interface: 'org.gnome.Shell.Extensions.Windows',
};

/**
 * Returns the zip of Window Calls: `SEMINAR_E2E_WINDOW_CALLS`, or else the
 * release in the cache of Seminar, downloaded if needed.
 */
async function windowCallsZip(cacheDirectory) {
  const override = process.env.SEMINAR_E2E_WINDOW_CALLS;
  if (override !== undefined && override !== '') {
    return override;
  }
  const zip = path.join(
    cacheDirectory(),
    'e2e',
    path.basename(WINDOW_CALLS.url),
  );
  if (!existsSync(zip)) {
    const response = await fetch(WINDOW_CALLS.url);
    if (!response.ok) {
      throw new Error(
        `Could not download Window Calls: ${String(response.status)}`,
      );
    }
    const contents = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(contents).digest('hex');
    if (digest !== WINDOW_CALLS.sha256) {
      throw new Error(
        `Window Calls from ${WINDOW_CALLS.url} has the digest ${digest}`,
      );
    }
    await mkdir(path.dirname(zip), { recursive: true });
    await writeFile(`${zip}.partial`, contents);
    await rename(`${zip}.partial`, zip);
  }
  return zip;
}

/**
 * GNOME Shell, headless, on two virtual monitors, with the Window Calls
 * extension, which `seminar present` needs there.
 */
export const gnome = {
  name: 'GNOME Shell',

  available: () => hasCommand('gnome-shell') && hasCommand('gsettings'),

  /** Window Calls can't take windows out of full screen. */
  leavesFullscreen: false,

  async start(session) {
    // From the build of the command line, which the tests need anyway.
    const { DBusConnection, socketPath } =
      await import('../../packages/cli/dist/app/dbus.js');
    const { displayOutputs } =
      await import('../../packages/cli/dist/app/gnome/displayConfig.js');
    const { outputAt } =
      await import('../../packages/cli/dist/app/compositor.js');
    const { cacheDirectory } =
      await import('../../packages/cli/dist/electron.js');
    const { unzip } = await import('../../packages/cli/dist/unzip.js');

    const extensions = path.join(
      session.env.XDG_DATA_HOME,
      'gnome-shell/extensions',
    );
    await mkdir(extensions, { recursive: true });
    await unzip(
      await windowCallsZip(cacheDirectory),
      path.join(extensions, UUID),
    );
    const options = { env: session.env };
    await run(
      'gsettings',
      ['set', 'org.gnome.shell', 'disable-user-extensions', 'false'],
      options,
    );
    await run(
      'gsettings',
      ['set', 'org.gnome.shell', 'enabled-extensions', `['${UUID}']`],
      options,
    );

    const shell = session.spawn('gnome-shell', [
      '--headless',
      '--wayland',
      '--no-x11',
      '--virtual-monitor',
      '1920x1080',
      '--virtual-monitor',
      '1280x720',
      '--wayland-display',
      'wayland-e2e',
    ]);
    const connection = await DBusConnection.connect(
      socketPath(session.env.DBUS_SESSION_BUS_ADDRESS),
    );
    const windowCall = async (member, signature, body) =>
      (await connection.call({ ...WINDOWS, member, signature, body }))[0];
    await until(
      () =>
        windowCall('List').then(
          () => true,
          () => false,
        ),
      `GNOME Shell didn't start with Window Calls:\n${shell.output}`,
      30_000,
    );

    const outputs = async () =>
      displayOutputs(
        await connection.call({
          destination: 'org.gnome.Mutter.DisplayConfig',
          path: '/org/gnome/Mutter/DisplayConfig',
          interface: 'org.gnome.Mutter.DisplayConfig',
          member: 'GetCurrentState',
        }),
      );

    return {
      env: { WAYLAND_DISPLAY: 'wayland-e2e' },

      outputs,

      async windows() {
        const monitors = await outputs();
        const windows = [];
        for (const { id, title, wm_class, focus } of JSON.parse(
          await windowCall('List'),
        )) {
          if (wm_class !== 'electron') {
            continue;
          }
          const details = await windowCall('Details', 'u', [id]).then(
            (reply) => JSON.parse(reply),
            () => undefined,
          );
          if (details === undefined) {
            continue;
          }
          const { x, y, width, height, fullscreen } = details;
          windows.push({
            id,
            title,
            output: outputAt(monitors, { left: x, top: y, width, height })
              ?.name,
            fullscreen,
            focused: focus,
            width,
            height,
          });
        }
        return windows;
      },

      async moveWindow({ id }, name) {
        const output = (await outputs()).find(
          (candidate) => candidate.name === name,
        );
        await windowCall('Move', 'uii', [id, output.x + 50, output.y + 50]);
      },

      stop() {
        connection.close();
      },
    };
  },
};
