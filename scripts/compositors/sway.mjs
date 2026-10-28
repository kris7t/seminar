import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { promisify } from 'node:util';

import { hasCommand, until } from './session.mjs';

const run = promisify(execFile);

/** Outputs of different sizes, so that tests can tell them apart. */
const CONFIG = `output HEADLESS-1 mode 1920x1080 position 0 0
output HEADLESS-2 mode 1280x720 position 1920 0
default_border none
`;

/** Sway, headless, with two outputs, and software rendering by default. */
export const sway = {
  name: 'sway',

  available: () => hasCommand('sway') && hasCommand('swaymsg'),

  async start(session) {
    const config = await session.writeFile('sway.config', CONFIG);
    const compositor = session.spawn('sway', ['-c', config], {
      env: {
        WLR_BACKENDS: 'headless',
        WLR_HEADLESS_OUTPUTS: '2',
        WLR_LIBINPUT_NO_DEVICES: '1',
        WLR_RENDERER: process.env.SEMINAR_E2E_RENDERER ?? 'pixman',
      },
    });
    const runtime = session.env.XDG_RUNTIME_DIR;
    const sockets = await until(async () => {
      const files = await readdir(runtime);
      const display = files.find((file) => /^wayland-\d+$/.test(file));
      const ipc = files.find((file) => /^sway-ipc\..*\.sock$/.test(file));
      return display !== undefined && ipc !== undefined && { display, ipc };
    }, `sway didn't start:\n${compositor.output}`);
    const env = {
      WAYLAND_DISPLAY: sockets.display,
      SWAYSOCK: `${runtime}/${sockets.ipc}`,
    };
    const swaymsg = async (...args) =>
      JSON.parse(
        (
          await run('swaymsg', ['-r', ...args], {
            env: { ...session.env, ...env },
          })
        ).stdout,
      );
    // Outputs are configured once sway answers.
    await until(
      async () =>
        (await swaymsg('-t', 'get_outputs').catch(() => [])).length === 2,
      `sway has no outputs:\n${compositor.output}`,
    );
    return {
      env,

      async outputs() {
        return (await swaymsg('-t', 'get_outputs')).map(({ name, rect }) => ({
          name,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }));
      },

      async windows() {
        const windows = [];
        const visit = (node, output) => {
          const on = node.type === 'output' ? node.name : output;
          if (node.pid !== undefined) {
            windows.push({
              id: node.id,
              title: node.name,
              output: on,
              fullscreen: node.fullscreen_mode !== 0,
              width: node.rect.width,
              height: node.rect.height,
            });
          }
          for (const child of [...node.nodes, ...node.floating_nodes]) {
            visit(child, on);
          }
        };
        visit(await swaymsg('-t', 'get_tree'), undefined);
        return windows;
      },

      async moveWindow({ id }, output) {
        await swaymsg(
          `[con_id=${String(id)}] move container to output ${output}`,
        );
      },

      async leaveFullscreen({ id }) {
        await swaymsg(`[con_id=${String(id)}] fullscreen disable`);
      },
    };
  },
};
