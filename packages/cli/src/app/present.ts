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
import type { Compositor, CompositorWindow, Output } from './compositor.ts';
import { GnomeWindows } from './gnome/gnome.ts';
import { KWinWindows } from './kwin/kwin.ts';
import {
  PRELOAD,
  pageUrl,
  registerScheme,
  roots,
  serveRoots,
} from './serve.ts';
import { waylandSocket, WaylandWindows } from './wayland/windows.ts';
import { featureArea } from './windowFeatures.ts';

/** How long to wait for the compositor to show windows, in milliseconds. */
const COMPOSITOR_TIMEOUT = 3000;

/**
 * Height of the title bar of the presenter window, as the toolbar of the
 * presenter view, which moves into it.
 */
const TITLE_BAR_HEIGHT = 48;

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
 * and the compositor lets us place them, with the wlr foreign toplevel
 * management protocol, the scripts of KWin, or the Window Calls extension of
 * GNOME Shell.
 */
async function connectCompositor(): Promise<Compositor | undefined> {
  const socket = waylandSocket(process.env);
  if (
    app.commandLine.getSwitchValue('ozone-platform') !== 'wayland' ||
    socket === undefined
  ) {
    return undefined;
  }
  try {
    const compositor =
      (await WaylandWindows.connect(socket)) ??
      (await KWinWindows.connect(process.env, process.pid)) ??
      (await GnomeWindows.connect(process.env, process.pid));
    if (compositor === undefined) {
      console.log(
        `The compositor can't show the slides on a chosen screen. Move the window of the slides to the screen of the audience before going full screen.${
          /GNOME/i.test(process.env['XDG_CURRENT_DESKTOP'] ?? '')
            ? ' On GNOME, the Window Calls extension lets it: https://extensions.gnome.org/extension/4724/window-calls/'
            : ''
        }`,
      );
    }
    return compositor;
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
async function findWindow(
  compositor: Compositor,
  window: BrowserWindow,
): Promise<CompositorWindow | undefined> {
  const title = `seminar-${randomUUID()}`;
  const keepTitle = (event: Electron.Event) => {
    event.preventDefault();
  };
  window.on('page-title-updated', keepTitle);
  window.setTitle(title);
  try {
    return await compositor.findWindow(title, COMPOSITOR_TIMEOUT);
  } finally {
    if (!window.isDestroyed()) {
      window.off('page-title-updated', keepTitle);
      window.setTitle(window.webContents.getTitle());
    }
  }
}

/**
 * Moves the audience `window` to `output`, before the deck shows it in full
 * screen there, which it can then.
 */
async function moveAudience(
  compositor: Compositor,
  window: BrowserWindow,
  output: Output,
): Promise<void> {
  const found = await findWindow(compositor, window);
  if (
    !window.isDestroyed() &&
    !(await found?.place(output, COMPOSITOR_TIMEOUT))
  ) {
    console.log(
      `The compositor didn't move the slides to ${output.name || 'the chosen screen'}.`,
    );
  }
}

/**
 * Shows the frameless audience `window` in full screen on `output`, and
 * closes it once it leaves full screen, which ends the presenter view.
 */
async function showAudience(
  compositor: Compositor,
  window: BrowserWindow,
  output: Output,
): Promise<void> {
  // Also if it leaves full screen while the compositor is still asked
  // whether it's on the right output.
  window.once('enter-full-screen', () => {
    window.once('leave-full-screen', () => {
      window.close();
    });
  });
  const found = await findWindow(compositor, window);
  if (window.isDestroyed()) {
    return;
  }
  if (
    (found === undefined || !(await found.place(output, COMPOSITOR_TIMEOUT))) &&
    !window.isDestroyed()
  ) {
    console.log(
      `The compositor didn't show the slides on ${output.name || 'the chosen screen'}.`,
    );
    // It can't be moved by hand without a frame anyway.
    if (!window.isFullScreen()) {
      window.setFullScreen(true);
    }
  }
}

function present(compositor: Compositor | undefined): void {
  roots.set(host, job.root);
  serveRoots();
  // The audience windows that the deck opened, which are blank pages that
  // it renders into, and ask for full screen with their own URL.
  const audiences = new WeakSet<Electron.WebContents>();
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, { requestingUrl }) => {
      callback(
        PERMISSIONS.has(permission) &&
          (isDeck(requestingUrl) ||
            (requestingUrl === 'about:blank' && audiences.has(contents))),
      );
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
    backgroundColor: '#000',
    // The deck draws the title bar, under the window controls, see
    // useTitleBar of core.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0000',
      symbolColor: '#fff',
      height: TITLE_BAR_HEIGHT,
    },
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true },
  });
  const { webContents } = presenter;
  const presenterWindow = new Promise<CompositorWindow | undefined>(
    (resolve) => {
      let shown = false;
      const show = () => {
        if (shown) {
          return;
        }
        shown = true;
        // Before showing the window, which has a unique title until found.
        resolve(
          compositor === undefined
            ? undefined
            : findWindow(compositor, presenter),
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
    },
  );
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
        ? { present: true, placesWindows: compositor !== undefined }
        : {}
    ) satisfies HostOptions;
  });
  ipcMain.handle(
    'seminar:current-screen',
    async (): Promise<ScreenArea | undefined> => {
      const output = await (await presenterWindow)?.output();
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
    event.returnValue =
      compositor?.fullscreens === true &&
      compositor.outputAt(area) !== undefined;
  });
  // Resolves once the audience window being opened is where it goes, for
  // the deck to show it in full screen there.
  let audiencePlaced = Promise.resolve();
  ipcMain.handle('seminar:place-audience', () => audiencePlaced);
  // Moves the audience window being opened, once it's created.
  let placeAudience: ((window: BrowserWindow) => void) | undefined;

  // The output to show the audience window that is being opened on, if any.
  let audienceOutput: Output | undefined;
  webContents.setWindowOpenHandler(({ url, frameName, features }) => {
    if (frameName !== AUDIENCE_WINDOW) {
      openExternal(url);
      return { action: 'deny' };
    }
    const area = featureArea(features);
    const output = area === undefined ? undefined : compositor?.outputAt(area);
    audienceOutput = output;
    if (
      compositor !== undefined &&
      output !== undefined &&
      !compositor.fullscreens
    ) {
      // Already now, since the deck may ask before the window is created.
      audiencePlaced = new Promise((resolve) => {
        const timeout = setTimeout(resolve, COMPOSITOR_TIMEOUT);
        placeAudience = (window) => {
          clearTimeout(timeout);
          void moveAudience(compositor, window, output).finally(resolve);
        };
      });
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        backgroundColor: '#000',
        autoHideMenuBar: true,
        // Full screen that the page didn't ask for keeps the frame.
        ...(output !== undefined && compositor?.fullscreens === true
          ? { frame: false }
          : {}),
      },
    };
  });
  webContents.on('did-create-window', (window) => {
    audiences.add(window.webContents);
    const output = audienceOutput;
    audienceOutput = undefined;
    if (compositor?.fullscreens === true && output !== undefined) {
      void showAudience(compositor, window, output);
    }
    placeAudience?.(window);
    placeAudience = undefined;
  });

  void presenter.loadURL(pageUrl(host, job.page));
}

app.on('window-all-closed', () => {
  app.quit();
});

// Not awaited at the top level, which Electron waits for before it is ready.
void app
  .whenReady()
  .then(connectCompositor)
  .then((compositor) => {
    present(compositor);
    app.once('quit', () => {
      compositor?.close();
    });
  });
