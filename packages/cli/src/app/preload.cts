import type { ScreenArea, SeminarHost } from '@seminar/core';
import type * as Electron from 'electron';

import type { HostOptions } from '../job.ts';

// Sandboxed preload scripts are CommonJS, and can only require Electron.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron') as typeof Electron;

const options = ipcRenderer.sendSync('seminar:host') as HostOptions;

const host: SeminarHost = {
  print: options.print,
  ...(options.print === undefined
    ? {}
    : {
        printReady: (printed) => {
          ipcRenderer.send('seminar:print-ready', printed);
        },
      }),
  present: options.present,
  preview: options.preview,
  activate: () => ipcRenderer.invoke('seminar:activate') as Promise<void>,
  presentationEnded: () => {
    ipcRenderer.send('seminar:presentation-ended');
  },
  ...(options.placesWindows === true
    ? {
        currentScreen: () =>
          ipcRenderer.invoke('seminar:current-screen') as Promise<
            ScreenArea | undefined
          >,
        showsAudienceFullscreen: (screen) =>
          ipcRenderer.sendSync(
            'seminar:shows-audience-fullscreen',
            screen,
          ) as boolean,
        placeAudience: (screen) =>
          ipcRenderer.invoke('seminar:place-audience', screen) as Promise<void>,
      }
    : {}),
};

contextBridge.exposeInMainWorld('seminarHost', host);
