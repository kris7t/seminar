import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ScreenArea } from '@seminar/core';
import {
  app,
  BrowserWindow,
  ipcMain,
  powerSaveBlocker,
  session,
  shell,
} from 'electron';

import type { HostOptions, PresentJob } from '../job.ts';
import {
  PRELOAD,
  pageUrl,
  registerScheme,
  roots,
  serveRoots,
} from './serve.ts';
import {
  waylandSocket,
  WaylandWindows,
  type Output,
  type Toplevel,
} from './wayland/windows.ts';
import { featureArea } from './windowFeatures.ts';

/** How long to wait for the compositor to show windows, in milliseconds. */
const COMPOSITOR_TIMEOUT = 3000;

/** Name of the audience window, see `usePresenterView` of the deck. */
const AUDIENCE_WINDOW = 'seminar-audience';

/** What decks may do without asking. */
const PERMISSIONS = new Set([
  'fullscreen',
  'automatic-fullscreen',
  'window-management',
]);

const job = JSON.parse(process.argv.at(-1) ?? '') as PresentJob;

// Each directory of decks has its own origin, which stays the same between
// presentations, along with what decks store, like the language of the UI.
const host = `deck-${createHash('sha256').update(job.root).digest('hex').slice(0, 16)}`;

registerScheme();
app.setPath('userData', path.join(app.getPath('appData'), 'seminar'));

function isDeck(url: string): boolean {
  return URL.parse(url)?.host === host;
}

function openExternal(url: string): void {
  if (/^(https?|mailto):/i.test(url)) {
    void shell.openExternal(url);
  }
}

/**
 * Connects to the Wayland compositor, if Electron shows its windows there,
 * and the compositor lets us place them.
 */
async function connectWayland(): Promise<WaylandWindows | undefined> {
  const socket = waylandSocket(process.env);
  if (
    app.commandLine.getSwitchValue('ozone-platform') !== 'wayland' ||
    socket === undefined
  ) {
    return undefined;
  }
  try {
    const windows = await WaylandWindows.connect(socket);
    if (windows === undefined) {
      console.log(
        "The compositor can't show the slides on a chosen screen. Move the window of the slides to the screen of the audience before going full screen.",
      );
    }
    return windows;
  } catch (error) {
    console.log(
      `Could not connect to the compositor: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * Finds the window of the compositor of `window`, which has a unique title
 * until then, instead of the title of its page.
 */
async function findToplevel(
  wayland: WaylandWindows,
  window: BrowserWindow,
): Promise<Toplevel | undefined> {
  const title = `seminar-${randomUUID()}`;
  const keepTitle = (event: Electron.Event) => {
    event.preventDefault();
  };
  window.on('page-title-updated', keepTitle);
  window.setTitle(title);
  try {
    return await wayland.toplevel(title, COMPOSITOR_TIMEOUT);
  } finally {
    if (!window.isDestroyed()) {
      window.off('page-title-updated', keepTitle);
      window.setTitle(window.webContents.getTitle());
    }
  }
}

/**
 * Shows the frameless audience `window` in full screen on `output`, and
 * closes it once it leaves full screen, which ends the presenter view.
 */
async function showAudience(
  wayland: WaylandWindows,
  window: BrowserWindow,
  output: Output,
): Promise<void> {
  const toplevel = await findToplevel(wayland, window);
  if (window.isDestroyed()) {
    return;
  }
  if (
    toplevel === undefined ||
    !(await wayland.fullscreen(toplevel, output, COMPOSITOR_TIMEOUT))
  ) {
    console.log(
      `The compositor didn't show the slides on ${output.name || 'the chosen screen'}.`,
    );
    if (window.isDestroyed()) {
      return;
    }
    // It can't be moved by hand without a frame anyway.
    window.setFullScreen(true);
  }
  if (!window.isDestroyed()) {
    window.on('leave-full-screen', () => {
      window.close();
    });
  }
}

function present(wayland: WaylandWindows | undefined): void {
  roots.set(host, job.root);
  serveRoots();
  session.defaultSession.setPermissionRequestHandler(
    (_, permission, callback, details) => {
      callback(PERMISSIONS.has(permission) && isDeck(details.requestingUrl));
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (_, permission, origin) => PERMISSIONS.has(permission) && isDeck(origin),
  );
  // Keep the screens on while presenting.
  powerSaveBlocker.start('prevent-display-sleep');

  const presenter = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true },
  });
  const { webContents } = presenter;
  const presenterToplevel = new Promise<Toplevel | undefined>((resolve) => {
    let shown = false;
    const show = () => {
      if (shown) {
        return;
      }
      shown = true;
      // Before showing the window, which has a unique title until found.
      resolve(
        wayland === undefined ? undefined : findToplevel(wayland, presenter),
      );
      presenter.maximize();
      presenter.show();
    };
    presenter.once('ready-to-show', show);
    webContents.once('did-finish-load', () => {
      // Hidden windows may never become ready to show with software
      // rendering, e.g., on Wayland.
      if (!app.getGPUFeatureStatus().gpu_compositing.startsWith('enabled')) {
        show();
      }
    });
  });
  presenter.on('closed', () => {
    app.quit();
  });
  webContents.on('console-message', ({ level, message }) => {
    if (level === 'error' || level === 'warning') {
      console.log(`${job.page}: ${message}`);
    }
  });
  webContents.on('will-navigate', (event) => {
    if (!isDeck(event.url)) {
      event.preventDefault();
      openExternal(event.url);
    }
  });

  ipcMain.on('seminar:host', (event) => {
    // Not for the audience window, which shows what the deck renders.
    event.returnValue = (
      event.sender === webContents
        ? { present: true, placesWindows: wayland !== undefined }
        : {}
    ) satisfies HostOptions;
  });
  ipcMain.handle(
    'seminar:current-screen',
    async (): Promise<ScreenArea | undefined> => {
      const toplevel = await presenterToplevel;
      const output =
        toplevel === undefined ? undefined : wayland?.outputOf(toplevel);
      return output === undefined
        ? undefined
        : {
            left: output.x,
            top: output.y,
            width: output.width,
            height: output.height,
          };
    },
  );
  ipcMain.on('seminar:shows-audience-fullscreen', (event, area: ScreenArea) => {
    event.returnValue = wayland?.outputAt(area) !== undefined;
  });

  // The output to show the audience window that is being opened on, if any.
  let audienceOutput: Output | undefined;
  webContents.setWindowOpenHandler(({ url, frameName, features }) => {
    if (frameName !== AUDIENCE_WINDOW) {
      openExternal(url);
      return { action: 'deny' };
    }
    const area = featureArea(features);
    audienceOutput = area === undefined ? undefined : wayland?.outputAt(area);
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        backgroundColor: '#000',
        autoHideMenuBar: true,
        // Full screen that the page didn't ask for keeps the frame.
        ...(audienceOutput === undefined ? {} : { frame: false }),
      },
    };
  });
  webContents.on('did-create-window', (window) => {
    const output = audienceOutput;
    audienceOutput = undefined;
    if (wayland !== undefined && output !== undefined) {
      void showAudience(wayland, window, output);
    }
  });

  void presenter.loadURL(pageUrl(host, job.page));
}

app.on('window-all-closed', () => {
  app.quit();
});

// Not awaited at the top level, which Electron waits for before it is ready.
void app
  .whenReady()
  .then(connectWayland)
  .then((wayland) => {
    present(wayland);
    app.once('quit', () => {
      wayland?.close();
    });
  });
